const router = require('express').Router();
const volunteerController = require('../controllers/volunteerController');
const { protect, authorize, optionalAuth } = require('../middleware/auth');

router.get('/shifts', volunteerController.getShifts);
router.get('/shifts/my', protect, authorize('VOLUNTEER'), volunteerController.getMyShifts);
router.get('/shifts/:id', optionalAuth, volunteerController.getShiftById);
router.post('/shifts', protect, authorize('ADMIN'), volunteerController.createShift);
router.patch('/shifts/:id', protect, authorize('ADMIN'), volunteerController.updateShift);
router.delete('/shifts/:id', protect, authorize('ADMIN'), volunteerController.deleteShift);
router.post('/shifts/:id/join', protect, authorize('VOLUNTEER'), volunteerController.joinShift);
router.post('/shifts/:id/cancel', protect, authorize('VOLUNTEER'), volunteerController.cancelShiftRegistration);
router.post('/shifts/:id/attendance', protect, authorize('ADMIN'), volunteerController.markAttendance);

module.exports = router;
