const mongoose = require("mongoose");
const Notification = require("../models/Notification");

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const getNotifications = async (req, res, next) => {
  try {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 50
    ) {
      return sendError(res, 400, "Page must be positive and limit must be between 1 and 50");
    }

    const filter = { recipientId: req.user._id };
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .select("-eventKey -recipientId")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, isRead: false }),
    ]);

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const markNotificationRead = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 404, "Notification not found");
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user._id },
      { $set: { isRead: true } },
      { returnDocument: "after" }
    ).select("-eventKey -recipientId").lean();
    if (!notification) return sendError(res, 404, "Notification not found");
    res.json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
};

const markAllNotificationsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { recipientId: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ success: true, updatedCount: result.modifiedCount });
  } catch (error) {
    next(error);
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 404, "Notification not found");
    }
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipientId: req.user._id,
    });
    if (!notification) return sendError(res, 404, "Notification not found");
    res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
};
