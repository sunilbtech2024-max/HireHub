const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    originalName: { type: String, required: true, maxlength: 255 },
    filename: { type: String, required: true, unique: true },
    path: { type: String, required: true, select: false },
    mimeType: { type: String, required: true, enum: ["application/pdf"] },
    size: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 },
    extractedText: { type: String, required: true, select: false },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Resume", resumeSchema);
