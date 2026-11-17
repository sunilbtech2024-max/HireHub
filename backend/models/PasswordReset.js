const mongoose = require("mongoose");
const { OTP_TTL_MS, MAX_OTP_ATTEMPTS } = require("../utils/passwordReset");

// Lifecycle:
//   1. forgot-password  -> upsert { otpHash, otpExpiresAt, lastOtpSentAt }
//   2. verify-reset-otp -> set { resetTokenHash, resetTokenExpiresAt }, clear attempts
//   3. reset-password   -> set { consumedAt }, then delete the document
//
// OTPs and reset tokens are only ever stored as HMAC/SHA-256 digests. Both hash
// fields use `select: false`, so an accidental find() cannot serialize them.
const passwordResetSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      unique: true,
      maxlength: [254, "Email cannot exceed 254 characters"],
    },
    otpHash: {
      type: String,
      required: [true, "OTP hash is required"],
      select: false,
    },
    otpExpiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + OTP_TTL_MS),
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastOtpSentAt: {
      type: Date,
      default: Date.now,
    },
    // Persistent per-email throttling (survives restarts, unlike in-memory caps).
    requestCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    requestWindowStart: {
      type: Date,
      default: Date.now,
    },
    resetTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    resetTokenExpiresAt: {
      type: Date,
      default: null,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.otpHash;
        delete ret.resetTokenHash;
        return ret;
      },
    },
  }
);

// Safety net only. Every read path must still check expiry explicitly because
// MongoDB's TTL monitor runs roughly once per minute.
passwordResetSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 3600 });

passwordResetSchema.methods.isOtpExpired = function (now = Date.now()) {
  if (!this.otpExpiresAt) return true;
  return this.otpExpiresAt.getTime() <= now;
};

passwordResetSchema.methods.isResetTokenExpired = function (now = Date.now()) {
  if (!this.resetTokenExpiresAt) return true;
  return this.resetTokenExpiresAt.getTime() <= now;
};

passwordResetSchema.methods.hasExceededOtpAttempts = function () {
  return this.attempts >= MAX_OTP_ATTEMPTS;
};

passwordResetSchema.methods.isConsumed = function () {
  return Boolean(this.consumedAt);
};

module.exports = mongoose.model("PasswordReset", passwordResetSchema);
