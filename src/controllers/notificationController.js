const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');

exports.getMyNotifications = async (req, res) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  const query = { user: req.user._id };
  if (unreadOnly === 'true') query.isRead = false;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query).sort('-createdAt').skip(skip).limit(parseInt(limit)),
    Notification.countDocuments(query),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);
  res.status(200).json({ success: true, data: { notifications, unreadCount, pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } } });
};

exports.markRead = async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { isRead: true, readAt: new Date() }
  );
  res.status(200).json({ success: true, message: 'Marked as read.' });
};

exports.markAllRead = async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  res.status(200).json({ success: true, message: 'All notifications marked as read.' });
};

exports.getUnreadCount = async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, isRead: false });
  res.status(200).json({ success: true, data: { count } });
};
