const Notification = require('../models/Notification');

const createNotification = async ({ userId, type, title, message, link = null, entityType = null, entityId = null, metadata = {} }) => {
  try {
    await Notification.create({
      user: userId,
      type,
      title,
      message,
      link,
      entityType,
      entityId,
      metadata,
    });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
};

const createBulkNotifications = async (notifications) => {
  try {
    await Notification.insertMany(notifications);
  } catch (err) {
    console.error('Failed to create bulk notifications:', err.message);
  }
};

module.exports = { createNotification, createBulkNotifications };
