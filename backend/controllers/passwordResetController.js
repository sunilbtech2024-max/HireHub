const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");
const { sendPasswordResetEmail } = require("../utils/sendPasswordResetEmail");
const { redact } = require("../utils/sendOtpEmail");
const {
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  MAX_OTP_ATTEMPTS,
  RESET_TOKEN_TTL_MS,
  MAX_REQUESTS_PER_WINDOW,
  REQUEST_WINDOW_MS,
  getOtpPepper,
  generateOtp,
  hashOtp,
  safeCompareHex,
  generateResetToken,
  hashResetToken,
  maskEmail,
  isPasswordWithinByteLimit,
} = require("../utils/passwordReset");

// One message for every outcome so responses cannot be used to discover whether
// an address is registered.
const GENERIC_FORGOT_MESSAGE =
  "If this email is registered, a 6-digit reset code has been sent. It expires in 10 minutes.";
const INVALID_CODE_MESSAGE = "Invalid or expired code. Request a new one.";
const INVALID_RESET_MESSAGE =
  "This reset request is invalid or has expired. Start the password reset again.";
const COOLDOWN_MESSAGE =
  "Please wait one minute before requesting another code.";
const RATE_LIMIT_MESSAGE =
  "Too many reset requests for this email. Please try again later.";
const UNAVAILABLE_MESSAGE =
  "Password reset is temporarily unavailable. Please try again later.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESET_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

const normalizeEmail = (value) => value.trim().toLowerCase();
const isValidEmail = (value) =>
  typeof value === "string" &&
  value.length <= 254 &&
  EMAIL_PATTERN.test(value.trim());

const pepperIsMissing = () => {
  try {
    getOtpPepper();
    return false;
  } catch {
    return true;
  }
};

const respondUnavailable = (res) =>
  res.status(503).json({ success: false, message: UNAVAILABLE_MESSAGE });

// Logs only redacted diagnostics. The OTP, reset token, mailbox and SMTP
// credentials can never reach this function. `redact` is reused from the
// existing email utility so the controller does not depend on the sender
// having sanitized its error.
const logResetEmailFailure = (email, error) => {
  console.error("Password reset email failed:", {
    email: maskEmail(email),
    code: error?.code || "EMAIL_SEND_FAILED",
    responseCode: error?.responseCode || null,
    command: redact(error?.command),
    message: redact(error?.message),
  });
};

// @desc    Request a password reset OTP
// @route   POST /api/auth/forgot-password
// @access  Public
const requestPasswordReset = async (req, res, next) => {
  try {
    const rawEmail = req.body?.email;

    if (!isValidEmail(rawEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    const email = normalizeEmail(rawEmail);

    // A missing pepper is a server misconfiguration, not a user error, and must
    // never fall back to JWT_SECRET.
    if (pepperIsMissing()) return respondUnavailable(res);

    const now = Date.now();
    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    const existing = await PasswordReset.findOne({ email });
    const windowStartedAt = existing?.requestWindowStart
      ? new Date(existing.requestWindowStart).getTime()
      : now;
    const windowExpired = !existing || now - windowStartedAt >= REQUEST_WINDOW_MS;

    if (!windowExpired && existing.requestCount >= MAX_REQUESTS_PER_WINDOW) {
      return res.status(429).json({
        success: false,
        message: RATE_LIMIT_MESSAGE,
        retryAfterSeconds: Math.ceil(
          (REQUEST_WINDOW_MS - (now - windowStartedAt)) / 1000
        ),
      });
    }

    // A new code always supersedes any previous reset authorization, but the
    // failed-attempt counter is deliberately preserved across resends.
    const otpFields = {
      otpHash,
      otpExpiresAt: new Date(now + OTP_TTL_MS),
      lastOtpSentAt: new Date(now),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      consumedAt: null,
    };

    if (existing) {
      const update = {
        $set: windowExpired
          ? {
              ...otpFields,
              requestCount: 1,
              requestWindowStart: new Date(now),
            }
          : otpFields,
      };

      if (!windowExpired) update.$inc = { requestCount: 1 };

      // The conditional filter makes the 60s cooldown race-safe: concurrent
      // requests cannot both overwrite the hash or send two emails.
      const updated = await PasswordReset.findOneAndUpdate(
        {
          _id: existing._id,
          lastOtpSentAt: { $lte: new Date(now - OTP_RESEND_COOLDOWN_MS) },
        },
        update,
        { new: true, runValidators: true }
      );

      if (!updated) {
        return res.status(429).json({
          success: false,
          message: COOLDOWN_MESSAGE,
        });
      }
    } else {
      try {
        await PasswordReset.create({
          email,
          ...otpFields,
          attempts: 0,
          requestCount: 1,
          requestWindowStart: new Date(now),
        });
      } catch (createError) {
        // Another request created the record first: this is a cooldown, and no
        // second email may be sent.
        if (createError?.code === 11000) {
          return res.status(429).json({
            success: false,
            message: COOLDOWN_MESSAGE,
          });
        }
        throw createError;
      }
    }

    // The email is only sent for real accounts, but the response, status and
    // stored record are identical for unknown addresses. Sending is not awaited
    // so response timing cannot reveal account existence.
    const userExists = await User.exists({ email });

    if (userExists) {
      sendPasswordResetEmail(email, otp).catch((error) =>
        logResetEmailFailure(email, error)
      );
    }

    return res.status(200).json({
      success: true,
      message: GENERIC_FORGOT_MESSAGE,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify a password reset OTP and issue a single-use reset token
// @route   POST /api/auth/verify-reset-otp
// @access  Public
const verifyResetOtp = async (req, res, next) => {
  try {
    const rawEmail = req.body?.email;
    const otp = req.body?.otp;

    if (
      !isValidEmail(rawEmail) ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter your email and the 6-digit code.",
      });
    }

    const email = normalizeEmail(rawEmail);
    const record = await PasswordReset.findOne({ email }).select(
      "+otpHash +resetTokenHash"
    );

    if (!record || record.isConsumed()) {
      return res.status(400).json({
        success: false,
        message: INVALID_CODE_MESSAGE,
      });
    }

    if (record.isOtpExpired()) {
      await PasswordReset.deleteOne({ _id: record._id });

      return res.status(400).json({
        success: false,
        message: INVALID_CODE_MESSAGE,
      });
    }

    if (record.hasExceededOtpAttempts()) {
      await PasswordReset.deleteOne({ _id: record._id });

      return res.status(429).json({
        success: false,
        message: "Too many attempts. Request a new code.",
      });
    }

    if (pepperIsMissing()) return respondUnavailable(res);

    const submittedHash = hashOtp(otp);

    if (!safeCompareHex(record.otpHash, submittedHash)) {
      // Atomic increment: concurrent wrong guesses cannot hide attempts.
      await PasswordReset.updateOne(
        { _id: record._id },
        { $inc: { attempts: 1 } }
      );

      return res.status(400).json({
        success: false,
        message: INVALID_CODE_MESSAGE,
      });
    }

    // The OTP is bound to a real account before authorization is issued.
    if (!(await User.exists({ email }))) {
      await PasswordReset.deleteOne({ _id: record._id });

      return res.status(400).json({
        success: false,
        message: INVALID_CODE_MESSAGE,
      });
    }

    const resetToken = generateResetToken();
    const resetTokenHash = hashResetToken(resetToken);
    const now = Date.now();

    // Expiring otpExpiresAt makes this OTP unusable for a second verification.
    const updated = await PasswordReset.findOneAndUpdate(
      { _id: record._id, consumedAt: null },
      {
        $set: {
          resetTokenHash,
          resetTokenExpiresAt: new Date(now + RESET_TOKEN_TTL_MS),
          otpExpiresAt: new Date(now),
          attempts: 0,
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: INVALID_CODE_MESSAGE,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Code verified. Choose a new password.",
      resetToken,
      expiresIn: Math.floor(RESET_TOKEN_TTL_MS / 1000),
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Set a new password using a verified reset authorization
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    const rawEmail = req.body?.email;
    const resetToken = req.body?.resetToken;
    const newPassword = req.body?.newPassword;
    const confirmPassword = req.body?.confirmPassword;

    if (
      !isValidEmail(rawEmail) ||
      typeof resetToken !== "string" ||
      !RESET_TOKEN_PATTERN.test(resetToken)
    ) {
      return res.status(400).json({
        success: false,
        message: INVALID_RESET_MESSAGE,
      });
    }

    if (
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string" ||
      newPassword.length === 0 ||
      confirmPassword.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter and confirm your new password.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    if (!isPasswordWithinByteLimit(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "Password is too long. The maximum is 72 bytes.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    const email = normalizeEmail(rawEmail);

    let submittedTokenHash;
    try {
      submittedTokenHash = hashResetToken(resetToken);
    } catch {
      return res.status(400).json({
        success: false,
        message: INVALID_RESET_MESSAGE,
      });
    }

    const record = await PasswordReset.findOne({ email }).select(
      "+otpHash +resetTokenHash"
    );

    if (
      !record ||
      record.isConsumed() ||
      record.isResetTokenExpired() ||
      !record.resetTokenHash ||
      !safeCompareHex(record.resetTokenHash, submittedTokenHash)
    ) {
      return res.status(400).json({
        success: false,
        message: INVALID_RESET_MESSAGE,
      });
    }

    // Atomic single-use claim: two concurrent submissions cannot both reset.
    const now = Date.now();
    const claimed = await PasswordReset.findOneAndUpdate(
      {
        _id: record._id,
        consumedAt: null,
        resetTokenExpiresAt: { $gt: new Date(now) },
      },
      { $set: { consumedAt: new Date(now) } },
      { new: true }
    );

    if (!claimed) {
      return res.status(400).json({
        success: false,
        message: INVALID_RESET_MESSAGE,
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      await PasswordReset.deleteOne({ _id: record._id });

      return res.status(400).json({
        success: false,
        message: INVALID_RESET_MESSAGE,
      });
    }

    try {
      // The User model's existing pre-save hook performs the bcrypt hashing.
      // Never pre-hash here and never set $locals.passwordAlreadyHashed.
      user.password = newPassword;
      await user.save();
    } catch (saveError) {
      // Best effort: release the claim so the user can retry with the same
      // authorization instead of restarting the whole flow.
      await PasswordReset.updateOne(
        { _id: record._id },
        { $set: { consumedAt: null } }
      ).catch(() => {});
      throw saveError;
    }

    // Invalidate the OTP and the reset authorization.
    await PasswordReset.deleteOne({ _id: record._id });

    return res.status(200).json({
      success: true,
      message: "Password updated. Please log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
};
