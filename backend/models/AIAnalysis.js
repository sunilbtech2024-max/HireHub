const mongoose = require("mongoose");

const textList = { type: [String], default: [] };
const atsScoreSchema = new mongoose.Schema(
  {
    overall: { type: Number, min: 0, max: 100, required: true },
    breakdown: {
      keywords: { type: Number, min: 0, max: 100, required: true },
      technicalSkills: { type: Number, min: 0, max: 100, required: true },
      structure: { type: Number, min: 0, max: 100, required: true },
      projects: { type: Number, min: 0, max: 100, required: true },
      education: { type: Number, min: 0, max: 100, required: true },
      experience: { type: Number, min: 0, max: 100, required: true },
      formatting: { type: Number, min: 0, max: 100, required: true },
    },
  },
  { _id: false }
);

const aiAnalysisSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      required: true,
    },
    summary: { type: String, default: "", maxlength: 4000 },
    skills: textList,
    technicalSkills: textList,
    softSkills: textList,
    education: textList,
    experience: textList,
    projects: textList,
    strengths: textList,
    weaknesses: textList,
    missingSkills: textList,
    improvementSuggestions: textList,
    careerSuggestions: textList,
    atsScore: { type: atsScoreSchema, default: undefined },
    model: { type: String, required: true, maxlength: 100 },
    analyzedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

aiAnalysisSchema.index({ resumeId: 1 }, { unique: true });

module.exports = mongoose.model("AIAnalysis", aiAnalysisSchema);
