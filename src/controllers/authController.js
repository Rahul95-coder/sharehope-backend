const authService = require('../services/authService');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { cleanString, cleanAddress } = require('../utils/pick');

exports.register = async (req, res) => {
  const result = await authService.register(req.body, req.ip);
  res.status(201).json({ success: true, message: 'Registration successful', data: result });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password, req.ip);
  res.status(200).json({ success: true, message: 'Login successful', data: result });
};

exports.logout = async (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

exports.me = async (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user.toSafeObject() } });
};

const PROFILE_TEXT_FIELDS = {
  name: 100,
  contactPersonName: 100,
  phone: 20,
  organizationDescription: 1000,
  mission: 500,
};
const STRING_LIST_FIELDS = ['availability', 'skills', 'preferredCategories'];

exports.updateProfile = async (req, res) => {
  const updates = {};

  Object.entries(PROFILE_TEXT_FIELDS).forEach(([field, max]) => {
    if (req.body[field] !== undefined) updates[field] = cleanString(req.body[field], max);
  });

  if (req.body.address !== undefined) {
    const address = cleanAddress(req.body.address);
    if (address) {
      // Merge into the existing address so a partial update does not wipe other fields.
      Object.entries(address).forEach(([k, v]) => {
        updates[`address.${k}`] = v;
      });
    }
  }

  STRING_LIST_FIELDS.forEach((field) => {
    if (Array.isArray(req.body[field])) {
      updates[field] = req.body[field].filter((v) => typeof v === 'string').map((v) => v.trim().slice(0, 60));
    }
  });

  if (req.body.transportAvailable !== undefined) {
    updates.transportAvailable = req.body.transportAvailable === true || req.body.transportAvailable === 'true';
  }

  const user = await User.findById(req.user._id);
  Object.entries(updates).forEach(([path, value]) => user.set(path, value)); // dotted paths merge into address
  await user.save(); // runs schema validators
  res.status(200).json({ success: true, data: { user: user.toSafeObject() } });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (currentPassword === newPassword) {
    throw new AppError('New password must be different from the current password.', 400);
  }

  const user = await User.findById(req.user._id).select('+passwordHash');
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new AppError('Current password is incorrect.', 400);

  user.passwordHash = await User.hashPassword(newPassword);
  await user.save();
  res.status(200).json({ success: true, message: 'Password changed successfully' });
};

