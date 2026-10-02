const router = require('express').Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  registerValidation,
  loginValidation,
  profileValidation,
  changePasswordValidation,
} = require('../validators/authValidators');

router.post('/register', authLimiter, registerValidation, validate, authController.register);
router.post('/login', authLimiter, loginValidation, validate, authController.login);
router.post('/logout', protect, authController.logout);
router.get('/me', protect, authController.me);
router.patch('/profile', protect, profileValidation, validate, authController.updateProfile);
router.patch('/change-password', protect, authLimiter, changePasswordValidation, validate, authController.changePassword);

module.exports = router;
