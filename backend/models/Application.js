const mongoose = require("mongoose");

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        "applied",
        "under_review",
        "shortlisted",
        "interview",
        "selected",
        "rejected",
        "withdrawn",
      ],
      required: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resume: {
      fileName: { type: String, trim: true, maxlength: 255 },
      fileUrl: { type: String, trim: true, maxlength: 2048 },
    },
    coverLetter: {
      type: String,
      trim: true,
      maxlength: [5000, "Cover letter cannot exceed 5000 characters"],
      default: "",
    },
    status: {
      type: String,
      enum: [
        "applied",
        "under_review",
        "shortlisted",
        "interview",
        "selected",
        "rejected",
        "withdrawn",
      ],
      default: "applied",
      index: true,
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

applicationSchema.index({ jobId: 1, studentId: 1 }, { unique: true });
applicationSchema.index({ companyId: 1, appliedAt: -1 });

module.exports = mongoose.model("Application", applicationSchema);
