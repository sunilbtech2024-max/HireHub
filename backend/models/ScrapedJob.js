const mongoose = require("mongoose");

const textList = {
  type: [String],
  default: [],
  validate: {
    validator: (items) =>
      Array.isArray(items) &&
      items.length <= 100 &&
      items.every(
        (item) =>
          typeof item === "string" &&
          item.trim().length > 0 &&
          item.length <= 1000
      ),
    message: "Job lists must contain up to 100 non-empty text items",
  },
};

const scrapedJobSchema = new mongoose.Schema(
  {
    source: { type: String, required: true, trim: true, maxlength: 64 },
    sourceJobId: { type: String, trim: true, maxlength: 256, default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    companyName: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 20000 },
    responsibilities: textList,
    requirements: textList,
    skillsRequired: textList,
    location: { type: String, default: "", trim: true, maxlength: 300 },
    workMode: {
      type: String,
      enum: ["onsite", "hybrid", "remote", null],
      default: null,
    },
    employmentType: { type: String, default: "", trim: true, maxlength: 80 },
    salary: { type: String, default: "", trim: true, maxlength: 200 },
    sourceUrl: { type: String, required: true, trim: true, maxlength: 2048 },
    postedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "expired", "closed"],
      default: "active",
      index: true,
    },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    firstSeenAt: { type: Date, required: true, default: Date.now },
    rawDataHash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
  },
  { timestamps: true }
);

scrapedJobSchema.index(
  { source: 1, sourceJobId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceJobId: { $type: "string" } },
    name: "scraped_job_source_external_id_unique",
  }
);
scrapedJobSchema.index(
  { source: 1, sourceUrl: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceJobId: null },
    name: "scraped_job_source_url_fallback_unique",
  }
);
scrapedJobSchema.index(
  { source: 1, status: 1, expiresAt: 1 },
  { name: "scraped_job_source_expiry" }
);

module.exports = mongoose.model("ScrapedJob", scrapedJobSchema);
