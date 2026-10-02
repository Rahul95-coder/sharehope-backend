const router = require('express').Router();
const impactController = require('../controllers/impactController');
const { protect, authorize } = require('../middleware/auth');

router.get('/public', impactController.getPublicStats);
router.get('/donor', protect, authorize('DONOR'), impactController.getMyDonorImpact);
router.get('/ngo', protect, authorize('NGO'), impactController.getMyNGOImpact);
router.get('/volunteer', protect, authorize('VOLUNTEER'), impactController.getMyVolunteerImpact);

module.exports = router;
