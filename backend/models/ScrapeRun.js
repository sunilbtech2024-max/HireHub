const mongoose = require("mongoose");

const errorSummarySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, maxlength: 64 },
    message: { type: String, required: true, maxlength: 240 },
  },
  { _id: false }
);

const scrapeRunSchema = new mongoose.Schema(
  {
    source: { type: String, required: true, trim: true, maxlength: 64 },
    startedAt: { type: Date, required: true, default: Date.now },
    finishedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["running", "completed", "partial", "failed"],
      required: true,
      default: "running",
    },
    fetchedCount: { type: Number, default: 0, min: 0 },
    insertedCount: { type: Number, default: 0, min: 0 },
    updatedCount: { type: Number, default: 0, min: 0 },
    skippedCount: { type: Number, default: 0, min: 0 },
    expiredCount: { type: Number, default: 0, min: 0 },
    failedCount: { type: Number, default: 0, min: 0 },
    errorSummaries: {
      type: [errorSummarySchema],
      default: [],
      validate: {
        validator: (items) => items.length <= 20,
        message: "A scrape run can store at most 20 error summaries",
      },
    },
    durationMs: { type: Number, default: null, min: 0 },
  },
  { timestamps: true }
);

scrapeRunSchema.index(
  { source: 1, startedAt: -1 },
  { name: "scrape_run_source_started" }
);
scrapeRunSchema.index(
  { status: 1, startedAt: -1 },
  { name: "scrape_run_status_started" }
);

module.exports = mongoose.model("ScrapeRun", scrapeRunSchema);
