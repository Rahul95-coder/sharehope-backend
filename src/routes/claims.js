const router = require('express').Router();
const claimController = require('../controllers/claimController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, authorize('NGO'), claimController.getMyClaims);
router.get('/donor', protect, authorize('DONOR'), claimController.getDonorClaims);
router.get('/:id', protect, claimController.getClaimById);
router.patch('/:id/status', protect, authorize('NGO'), claimController.updateClaimStatus);

module.exports = router;
