const Notification = require("../models/Notification");

const allowedTypes = new Set([
  "APPLICATION_SUBMITTED",
  "APPLICATION_STATUS_CHANGED",
  "APPLICATION_WITHDRAWN",
  "COMPANY_VERIFICATION_REQUESTED",
  "COMPANY_VERIFICATION_UPDATED",
  "NEW_JOB_RECOMMENDATION",
]);
const allowedRelatedModels = new Set(["Application", "Company", "Job"]);

const createNotification = async ({
  recipientId,
  type,
  title,
  message,
  link = "",
  relatedId = null,
  relatedModel = null,
  eventKey,
}) => {
  if (!recipientId || !allowedTypes.has(type)) {
    throw new TypeError("A valid notification recipient and type are required");
  }
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 160 ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 500
  ) {
    throw new TypeError("Notification title and message are required within allowed lengths");
  }
  if (link && (typeof link !== "string" || !link.startsWith("/") || link.startsWith("//"))) {
    throw new TypeError("Notification links must be safe application-relative paths");
  }
  if (relatedModel && !allowedRelatedModels.has(relatedModel)) {
    throw new TypeError("Unsupported notification related model");
  }

  try {
    return await Notification.create({
      recipientId,
      type,
      title: title.trim(),
      message: message.trim(),
      link,
      relatedId,
      relatedModel,
      ...(eventKey ? { eventKey } : {}),
    });
  } catch (error) {
    if (eventKey && error.code === 11000) {
      return Notification.findOne({ eventKey });
    }
    console.error("Notification creation failed:", error.name || "Error");
    return null;
  }
};

const createNotifications = async (recipients, notification) => {
  const uniqueRecipients = [...new Set(recipients.map(String))].filter(Boolean);
  return Promise.all(
    uniqueRecipients.map((recipientId) =>
      createNotification({
        ...notification,
        recipientId,
        eventKey: notification.eventKey
          ? `${notification.eventKey}:recipient:${recipientId}`
          : undefined,
      })
    )
  );
};

module.exports = { createNotification, createNotifications };
