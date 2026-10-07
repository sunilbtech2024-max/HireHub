const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "APPLICATION_SUBMITTED",
        "APPLICATION_STATUS_CHANGED",
        "APPLICATION_WITHDRAWN",
        "COMPANY_VERIFICATION_REQUESTED",
        "COMPANY_VERIFICATION_UPDATED",
        "NEW_JOB_RECOMMENDATION",
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    link: { type: String, trim: true, maxlength: 500, default: "" },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    relatedModel: {
      type: String,
      enum: ["Application", "Company", "Job"],
      default: null,
    },
    isRead: { type: Boolean, default: false, index: true },
    eventKey: { type: String, trim: true, maxlength: 200, default: undefined },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index(
  { eventKey: 1 },
  { unique: true, sparse: true, name: "notification_event_key_unique" }
);

module.exports = mongoose.model("Notification", notificationSchema);
