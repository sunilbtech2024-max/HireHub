const crypto = require("crypto");
const firebaseAuth = require("../config/firebaseAdmin");
const { isDisposableEmail } = require("../utils/validateEmail");
const User = require("../models/User");
const Company = require("../models/Company");
const generateToken = require("../utils/generateToken");
const bcrypt = require("bcryptjs");
const PendingRegistration = require("../models/PendingRegistration");
const { sendOtpEmail } = require("../utils/sendOtpEmail");

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;

// @desc    Register a new user (Student or Company)
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      role = "student",
      phone,
      companyName,
    } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, and password",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (isDisposableEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Temporary email addresses are not allowed.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    if (!["student", "company"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration role.",
      });
    }

    if (role === "company" && !companyName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide your company name.",
      });
    }

    if (await User.exists({ email: normalizedEmail })) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    const hashedPassword = await bcrypt.hash(password, 10);
    const issuedAt = new Date();

    const pendingFields = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
      phone: phone?.trim() || "",
      companyName: companyName?.trim() || "",
      otpHash,
      otpExpiresAt: new Date(issuedAt.getTime() + OTP_TTL_MS),
      attempts: 0,
      lastOtpSentAt: issuedAt,
    };

    // Atomic claim: the conditional update only matches when no OTP was issued
    // within the cooldown window, so two concurrent submissions cannot both
    // send an email (duplicate OTPs) or overwrite each other's hash.
    const cooldownCutoff = new Date(issuedAt.getTime() - OTP_COOLDOWN_MS);

    let pending = await PendingRegistration.findOneAndUpdate(
      { email: normalizedEmail, lastOtpSentAt: { $lte: cooldownCutoff } },
      { $set: pendingFields },
      { new: true, runValidators: true }
    );

    if (!pending) {
      const existingPending = await PendingRegistration.findOne({
        email: normalizedEmail,
      }).select("lastOtpSentAt");

      if (existingPending) {
        return res.status(429).json({
          success: false,
          message: "Please wait one minute before requesting another OTP.",
        });
      }

      try {
        pending = await PendingRegistration.create(pendingFields);
      } catch (createError) {
        // A concurrent request created the record first: no duplicate email.
        if (createError?.code === 11000) {
          return res.status(429).json({
            success: false,
            message: "Please wait one minute before requesting another OTP.",
          });
        }
        throw createError;
      }
    }

    try {
      const emailInfo = await sendOtpEmail(normalizedEmail, otp);

      // Safe diagnostic: message IDs help correlate with relay (Brevo) logs.
      if (emailInfo?.messageId) {
        console.log(`OTP email accepted by SMTP relay (messageId=${emailInfo.messageId})`);
      }
    } catch (emailError) {
      // Log diagnostics only. Never log the OTP, password, or SMTP credentials.
      console.error("OTP email sending failed:", {
        code: emailError.code || "EMAIL_SEND_FAILED",
        responseCode: emailError.responseCode || null,
        command: emailError.command || "",
        message: emailError.message,
      });

      // The OTP was stored before sending, so a failed send would leave an
      // unusable record that also blocks retries with the 60s cooldown.
      try {
        await PendingRegistration.deleteOne({ email: normalizedEmail });
      } catch (cleanupError) {
        console.error(
          "Failed to clear pending registration after email failure:",
          cleanupError.message
        );
      }

      return res.status(502).json({
        success: false,
        message:
          "We could not send the verification email. Please check your email address and try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP sent to your email. It expires in 10 minutes.",
      email: normalizedEmail,
    });
  } catch (error) {
    next(error);
  }
};


const verifyRegistrationOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (
      typeof email !== "string" ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter your email and 6-digit OTP.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const pending = await PendingRegistration.findOne({
      email: normalizedEmail,
    });

    if (!pending) {
      return res.status(400).json({
        success: false,
        message: "Registration not found. Please register again.",
      });
    }

    if (pending.otpExpiresAt.getTime() <= Date.now()) {
      await PendingRegistration.deleteOne({ _id: pending._id });

      return res.status(400).json({
        success: false,
        message: "OTP expired. Please register again.",
      });
    }

    if (pending.attempts >= 5) {
      await PendingRegistration.deleteOne({ _id: pending._id });

      return res.status(429).json({
        success: false,
        message: "Too many attempts. Please register again.",
      });
    }

    const submittedHash = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    const validOtp = crypto.timingSafeEqual(
      Buffer.from(submittedHash, "hex"),
      Buffer.from(pending.otpHash, "hex")
    );

    if (!validOtp) {
      pending.attempts += 1;
      await pending.save();

      return res.status(400).json({
        success: false,
        message: "Incorrect OTP.",
      });
    }

    if (await User.exists({ email: normalizedEmail })) {
      await PendingRegistration.deleteOne({ _id: pending._id });

      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const user = new User({
      name: pending.name,
      email: pending.email,
      password: pending.password,
      role: pending.role,
      phone: pending.phone || "",
    });

    user.$locals.passwordAlreadyHashed = true;
    await user.save();

    let company = null;

    try {
      if (user.role === "company") {
        company = await Company.create({
          userId: user._id,
          companyName:
            pending.companyName || `${user.name}'s Organization`,
          verified: false,
          verificationStatus: "pending",
        });
      }
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }

    await PendingRegistration.deleteOne({ _id: pending._id });

    return res.status(201).json({
      success: true,
      message: "Email verified and account created successfully.",
      token: generateToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        skills: user.skills,
        location: user.location,
        createdAt: user.createdAt,
      },
      company: company || undefined,
    });
  } catch (error) {
    next(error);
  }
};
    

    

    
// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide both email and password",
      });
    }

    // Find user and explicitly select password
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact an administrator.",
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    let company = null;
    if (user.role === "company") {
      company = await Company.findOne({ userId: user._id });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profileImage: user.profileImage,
        headline: user.headline,
        skills: user.skills,
        education: user.education,
        experience: user.experience,
        location: user.location,
        bio: user.bio,
        createdAt: user.createdAt,
      },
      company: company || undefined,
    });
  } catch (error) {
    next(error);
  }
};


const googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google ID token is required",
      });
    }

    // Verify the token using Firebase Admin SDK
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);

    if (!decodedToken.email || decodedToken.email_verified !== true) {
      return res.status(401).json({
        success: false,
        message: "A verified Google email is required",
      });
    }

    const email = decodedToken.email.toLowerCase().trim();

    let user = await User.findOne({ email });

    // Do not automatically link Google to an existing account
    if (user) {
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: "Your account has been deactivated. Please contact an administrator.",
        });
      }

      return res.status(409).json({
        success: false,
        message:
          "An account with this email already exists. Please log in using your existing method first.",
      });
    }

    // Generate a random password to satisfy the existing User model.
    // The user will authenticate through Google, not this password.
    user = await User.create({
      name: (decodedToken.name || email.split("@")[0]).trim(),
      email,
      password: crypto.randomBytes(32).toString("hex"),
      role: "student",
      profileImage: decodedToken.picture || "",
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profileImage: user.profileImage,
        headline: user.headline,
        skills: user.skills,
        education: user.education,
        experience: user.experience,
        location: user.location,
        bio: user.bio,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    if (
      error.code === "auth/argument-error" ||
      error.code === "auth/id-token-expired" ||
      error.code === "auth/invalid-id-token"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired Google sign-in token",
      });
    }

    next(error);
  }
};

// @desc    Get currently logged-in user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    let company = null;
    if (user.role === "company") {
      company = await Company.findOne({ userId: user._id });
    }

    res.json({
      success: true,
      user,
      company: company || undefined,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user password
// @route   PUT /api/auth/update-password
// @access  Private
const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide both current and new password",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    const user = await User.findById(req.user._id).select("+password");

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  verifyRegistrationOtp,
  login,
  googleLogin,
  getMe,
  updatePassword,
};