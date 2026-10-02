const bcrypt = require('bcryptjs');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const AppError = require('../utils/AppError');
const AuditLog = require('../models/AuditLog');
const { cleanString, cleanAddress } = require('../utils/pick');

// A real bcrypt hash of a random string. Compared against when the email does not
// exist so that "unknown email" and "wrong password" take the same time
// (otherwise response timing reveals which emails are registered).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-equalisation', 12);

const cleanList = (value) =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string').map((v) => v.trim().slice(0, 60)) : [];

const register = async (data, ipAddress) => {
  const { role, password } = data;

  if (role === 'ADMIN') throw new AppError('Cannot register as admin.', 403);

  const email = String(data.email).toLowerCase();
  const existingUser = await User.findOne({ email });
  if (existingUser) throw new AppError('Email already registered.', 409);

  const passwordHash = await User.hashPassword(password);
  const status = role === 'VOLUNTEER' ? 'VERIFIED' : 'PENDING';

  // Whitelist every field - never spread req.body into the model.
  const user = await User.create({
    name: cleanString(data.name, 100),
    contactPersonName: cleanString(data.contactPersonName, 100),
    email,
    phone: cleanString(data.phone, 20),
    passwordHash,
    role,
    status,
    address: cleanAddress(data.address) || {},
    donorType: data.donorType || undefined,
    registrationNumber: cleanString(data.registrationNumber, 60),
    organizationDescription: cleanString(data.organizationDescription, 1000),
    mission: cleanString(data.mission, 500),
    availability: cleanList(data.availability),
    skills: cleanList(data.skills),
    preferredCategories: cleanList(data.preferredCategories),
    transportAvailable: data.transportAvailable === true,
  });

  await AuditLog.create({
    actor: user._id,
    actorEmail: email,
    actorRole: role,
    action: 'USER_REGISTERED',
    entity: 'User',
    entityId: user._id,
    metadata: { role, name: user.name },
    ipAddress,
  });

  const token = generateToken(user._id);
  return { user: user.toSafeObject(), token };
};

const login = async (emailInput, password, ipAddress) => {
  const email = String(emailInput).toLowerCase();
  const user = await User.findOne({ email, isDeleted: false }).select('+passwordHash');

  if (!user) {
    await bcrypt.compare(String(password), DUMMY_HASH);
    throw new AppError('Invalid email or password.', 401);
  }

  const isMatch = await user.comparePassword(String(password));
  if (!isMatch) throw new AppError('Invalid email or password.', 401);

  if (user.status === 'SUSPENDED') {
    throw new AppError('Your account has been suspended. Contact admin.', 403);
  }

  user.lastLoginAt = new Date();
  await user.save();

  await AuditLog.create({
    actor: user._id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'USER_LOGIN',
    entity: 'User',
    entityId: user._id,
    ipAddress,
  });

  const token = generateToken(user._id);
  return { user: user.toSafeObject(), token };
};

module.exports = { register, login };
