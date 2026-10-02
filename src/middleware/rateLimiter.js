const rateLimit = require('express-rate-limit');

const skipInTests = () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TEST !== 'true';

const json = (message) => ({ success: false, message });

// Login / register: strict, but successful logins do not count against the user.
exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: json('Too many attempts. Please try again in a few minutes.'),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: skipInTests,
});

// General API traffic.
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: json('Too many requests. Please slow down.'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
});

// Pickup-code verification: the code is 6 hex chars, so brute force must be throttled per user.
// Must be mounted AFTER the `protect` middleware (it keys on the logged-in user).
exports.verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: json('Too many pickup-code attempts. Please wait 15 minutes and try again.'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `verify:${req.user ? req.user._id : 'anonymous'}`,
  skip: skipInTests,
});
