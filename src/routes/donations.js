const router = require('express').Router();
const donationController = require('../controllers/donationController');
const { protect, authorize, verifiedOnly } = require('../middleware/auth');
const { uploadImages, verifyUploadedFiles } = require('../config/cloudinary');
const { sanitizeBody } = require('../middleware/sanitize');
const { verifyLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { createDonationValidation } = require('../validators/donationValidators');

// Every donation endpoint requires a login: donor contact details and claim state are not public.
router.use(protect);

router.get('/', donationController.getDonations);
router.get('/my', authorize('DONOR'), donationController.getMyDonations);
router.get('/:id', donationController.getDonationById);

router.post(
  '/',
  authorize('DONOR'),
  verifiedOnly,
  uploadImages.array('images', 8),
  verifyUploadedFiles,
  sanitizeBody,
  createDonationValidation,
  validate,
  donationController.createDonation
);
router.patch('/:id', authorize('DONOR', 'ADMIN'), donationController.updateDonation);
router.delete('/:id', authorize('DONOR', 'ADMIN'), donationController.deleteDonation);
router.patch('/:id/cancel', authorize('DONOR', 'ADMIN'), donationController.cancelDonation);
router.post('/:id/claim', authorize('NGO'), verifiedOnly, donationController.claimDonation);
router.post('/:id/verify-pickup', authorize('DONOR', 'ADMIN'), verifyLimiter, donationController.verifyPickup);
router.post(
  '/:id/images',
  authorize('DONOR'),
  verifiedOnly,
  uploadImages.array('images', 8),
  verifyUploadedFiles,
  donationController.addImages
);
router.delete('/:id/images/:imageId', authorize('DONOR'), donationController.removeImage);

module.exports = router;
