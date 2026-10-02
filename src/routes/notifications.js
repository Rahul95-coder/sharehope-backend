const router = require('express').Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.get('/', protect, notificationController.getMyNotifications);
router.get('/unread-count', protect, notificationController.getUnreadCount);
router.patch('/:id/read', protect, notificationController.markRead);
router.patch('/mark-all-read', protect, notificationController.markAllRead);

module.exports = router;
