const router = require('express').Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

const adminOnly = [protect, authorize('ADMIN')];

router.get('/dashboard', ...adminOnly, adminController.getDashboardStats);
router.get('/users', ...adminOnly, adminController.getUsers);
router.get('/users/:id', ...adminOnly, adminController.getUserById);
router.patch('/users/:id/status', ...adminOnly, adminController.updateUserStatus);
router.get('/donations', ...adminOnly, adminController.getAllDonations);
router.get('/claims', ...adminOnly, adminController.getAllClaims);
router.get('/audit-logs', ...adminOnly, adminController.getAuditLogs);
router.get('/impact', ...adminOnly, adminController.getImpact);

module.exports = router;
