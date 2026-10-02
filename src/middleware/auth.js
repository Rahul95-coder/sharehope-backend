const jwt = require('jsonwebtoken');
const User = require('../models/User');

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

exports.protect = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user || user.isDeleted) {
      return res.status(401).json({ success: false, message: 'User not found or deleted.' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ success: false, message: 'Your account has been suspended.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please log in again.' });
    }
    return next(error);
  }
};

/**
 * Like `protect` for document downloads opened via a plain <a href>, where the
 * browser cannot send an Authorization header. Accepts ?token=<jwt> as well.
 */
exports.protectAllowQueryToken = async (req, res, next) => {
  if (!req.headers.authorization && typeof req.query.token === 'string') {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  return exports.protect(req, res, next);
};

exports.authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role: ${roles.join(' or ')}`,
    });
  }
  return next();
};

exports.verifiedOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  if (req.user.status !== 'VERIFIED' && req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Your account must be verified to perform this action.',
    });
  }
  return next();
};

exports.optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (user && !user.isDeleted && user.status !== 'SUSPENDED') req.user = user;
    }
  } catch (_) {
    /* anonymous request */
  }
  next();
};
