const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Job title is required"],
      trim: true,
      maxlength: 160,
    },
    type: {
      type: String,
      enum: ["job", "internship"],
      required: [true, "Posting type is required"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: 10000,
    },
    responsibilities: {
      type: [String],
      default: [],
    },
    requirements: {
      type: [String],
      default: [],
    },
    skillsRequired: {
      type: [String],
      required: [true, "Required skills are required"],
      validate: {
        validator: (skills) => Array.isArray(skills) && skills.length > 0,
        message: "Provide at least one required skill",
      },
    },
    educationRequired: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    experience: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
      maxlength: 160,
    },
    workMode: {
      type: String,
      enum: ["onsite", "hybrid", "remote"],
      default: "onsite",
    },
    salary: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    stipend: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    vacancies: {
      type: Number,
      default: 1,
      min: 1,
      max: 10000,
    },
    deadline: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "active", "closed"],
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, type: 1, createdAt: -1 });
jobSchema.index({ title: "text", description: "text", skillsRequired: "text" });

module.exports = mongoose.model("Job", jobSchema);
