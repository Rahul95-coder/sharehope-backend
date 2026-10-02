const request = require('supertest');
const User = require('../../models/User');
const app = require('../../app');

const PASSWORD = 'Test@1234';

const createUser = async (overrides = {}) => {
  const user = await User.create({
    name: 'Test User',
    email: `u${Date.now()}${Math.random().toString(36).slice(2, 7)}@sectest.com`,
    passwordHash: await User.hashPassword(PASSWORD),
    role: 'DONOR',
    status: 'VERIFIED',
    phone: '9876543210',
    address: { addressLine: '1 Test Rd', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    ...overrides,
  });
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed in factory: ${res.status} ${JSON.stringify(res.body)}`);
  return { user, token: res.body.data.token };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const inHours = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const createDonation = (token, extra = {}) => {
  const fields = {
    title: extra.title || 'Test Thali',
    category: 'COOKED_FOOD',
    quantity: '10',
    unit: 'KG',
    foodType: 'VEG',
    expiryDateTime: extra.expiryDateTime || inHours(24),
    ...(extra.fields || {}), // overrides replace defaults (no duplicate multipart fields)
  };
  const r = request(app).post('/api/donations').set(auth(token));
  Object.entries(fields).forEach(([k, v]) => r.field(k, v));
  return r;
};

const cleanup = async () => {
  const Donation = require('../../models/Donation');
  const Claim = require('../../models/Claim');
  const ImpactRecord = require('../../models/ImpactRecord');
  const Notification = require('../../models/Notification');
  const AuditLog = require('../../models/AuditLog');
  const VolunteerShift = require('../../models/VolunteerShift');
  const ids = await User.find({ email: /@sectest\.com$/ }).distinct('_id');
  await Promise.all([
    Claim.deleteMany({ ngo: { $in: ids } }),
    ImpactRecord.deleteMany({ donor: { $in: ids } }),
    Notification.deleteMany({ user: { $in: ids } }),
    AuditLog.deleteMany({ actor: { $in: ids } }),
    Donation.deleteMany({ donor: { $in: ids } }),
    VolunteerShift.deleteMany({ title: /^TEST_/ }),
  ]);
  await User.deleteMany({ _id: { $in: ids } });
};

module.exports = { createUser, auth, inHours, createDonation, cleanup, PASSWORD, PNG, app };
