
const mongoose = require("mongoose");

const pendingRegistrationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["student", "company"],
      default: "student",
      required: true,
    },
    phone: {
      type: String,
      default: "",
    },
    companyName: {
      type: String,
      default: "",
    },
    otpHash: {
      type: String,
      required: true,
    },
    otpExpiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastOtpSentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Automatically delete expired pending registrations.
pendingRegistrationSchema.index(
  { otpExpiresAt: 1 },
  { expireAfterSeconds: 86400 }
);

module.exports = mongoose.model(
  "PendingRegistration",
  pendingRegistrationSchema
);
