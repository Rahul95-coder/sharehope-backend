const User = require('../models/User');
const Donation = require('../models/Donation');
const Claim = require('../models/Claim');
const AuditLog = require('../models/AuditLog');
const ImpactRecord = require('../models/ImpactRecord');
const VolunteerShift = require('../models/VolunteerShift');
const AppError = require('../utils/AppError');
const { createNotification } = require('../utils/notificationHelper');
const { str, escapeRegex, oneOf, parsePagination, buildPagination } = require('../utils/query');

exports.getDashboardStats = async (req, res) => {
  const [users, donations, claims, impactRecords] = await Promise.all([
    User.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Donation.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Claim.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ImpactRecord.aggregate([
      { $group: { _id: null, totalKg: { $sum: '$quantityKg' }, totalMeals: { $sum: '$estimatedMeals' }, totalFamilies: { $sum: '$estimatedFamilies' } } },
    ]),
  ]);

  const userStats = {};
  users.forEach((u) => {
    const key = `${u._id.role}_${u._id.status}`;
    userStats[key] = u.count;
  });

  const donationStats = {};
  donations.forEach((d) => { donationStats[d._id] = d.count; });

  const claimStats = {};
  claims.forEach((c) => { claimStats[c._id] = c.count; });

  const impact = impactRecords[0] || { totalKg: 0, totalMeals: 0, totalFamilies: 0 };
  delete impact._id;

  res.status(200).json({
    success: true,
    data: { userStats, donationStats, claimStats, impact },
  });
};

exports.getUsers = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const query = { isDeleted: false };
  const role = oneOf(str(req.query.role), ['ADMIN', 'DONOR', 'NGO', 'VOLUNTEER']);
  const status = oneOf(str(req.query.status), ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']);
  const search = str(req.query.search, 60);
  if (role) query.role = role;
  if (status) query.status = status;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    query.$or = [{ name: rx }, { email: rx }];
  }
  const [users, total] = await Promise.all([
    User.find(query).sort('-createdAt').skip(skip).limit(limit),
    User.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { users, pagination: buildPagination(total, page, limit) } });
};

exports.getUserById = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.isDeleted) throw new AppError('User not found.', 404);
  res.status(200).json({ success: true, data: { user } });
};

exports.updateUserStatus = async (req, res) => {
  const { status } = req.body;
  const adminNotes = str(req.body.adminNotes, 1000);
  const rejectionReason = str(req.body.rejectionReason, 500);
  if (!['VERIFIED', 'REJECTED', 'SUSPENDED', 'PENDING'].includes(status)) {
    throw new AppError('Invalid status.', 400);
  }

  const user = await User.findById(req.params.id);
  if (!user || user.isDeleted) throw new AppError('User not found.', 404);
  if (user.role === 'ADMIN') throw new AppError('Cannot modify admin users.', 403);

  const prevStatus = user.status;
  user.status = status;
  if (adminNotes) user.adminNotes = adminNotes;
  if (status === 'VERIFIED') {
    user.verifiedAt = new Date();
    user.verifiedBy = req.user._id;
  }
  if (status === 'REJECTED') {
    user.rejectedAt = new Date();
    if (rejectionReason) user.rejectionReason = rejectionReason;
  }
  await user.save();

  // Notify user
  const typeMap = { VERIFIED: 'VERIFICATION_APPROVED', REJECTED: 'VERIFICATION_REJECTED', SUSPENDED: 'VERIFICATION_SUSPENDED' };
  if (typeMap[status]) {
    await createNotification({
      userId: user._id,
      type: typeMap[status],
      title: status === 'VERIFIED' ? 'Account Verified!' : status === 'REJECTED' ? 'Account Rejected' : 'Account Suspended',
      message: status === 'VERIFIED'
        ? 'Congratulations! Your account has been verified. You can now use all features.'
        : status === 'REJECTED'
        ? `Your account was rejected. Reason: ${rejectionReason || 'Not specified.'}`
        : 'Your account has been suspended. Please contact support.',
    });
  }

  await AuditLog.create({
    actor: req.user._id,
    actorEmail: req.user.email,
    actorRole: 'ADMIN',
    action: `USER_STATUS_CHANGED_${status}`,
    entity: 'User',
    entityId: user._id,
    previousData: { status: prevStatus },
    newData: { status },
    metadata: { adminNotes, rejectionReason },
  });

  res.status(200).json({ success: true, message: `User status updated to ${status}`, data: { user } });
};

exports.getAllDonations = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const query = { isDeleted: false };
  const status = oneOf(str(req.query.status), Donation.schema.path('status').enumValues);
  const category = oneOf(str(req.query.category), Donation.schema.path('category').enumValues);
  const search = str(req.query.search, 60);
  if (status) query.status = status;
  if (category) query.category = category;
  if (search) query.title = { $regex: escapeRegex(search), $options: 'i' };
  const [donations, total] = await Promise.all([
    Donation.find(query).populate('donor', 'name email').populate('claimedBy', 'name email').sort('-createdAt').skip(skip).limit(limit),
    Donation.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { donations, pagination: buildPagination(total, page, limit) } });
};

exports.getAllClaims = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const query = {};
  const status = oneOf(str(req.query.status), Claim.schema.path('status').enumValues);
  if (status) query.status = status;
  const [claims, total] = await Promise.all([
    Claim.find(query)
      .populate({ path: 'donation', populate: { path: 'donor', select: 'name email' } })
      .populate('ngo', 'name email')
      .sort('-claimedAt').skip(skip).limit(limit),
    Claim.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { claims, pagination: buildPagination(total, page, limit) } });
};

exports.getAuditLogs = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });
  const query = {};
  const entity = str(req.query.entity, 40);
  const action = str(req.query.action, 60);
  if (entity) query.entity = entity;
  if (action) query.action = { $regex: escapeRegex(action), $options: 'i' };
  const [logs, total] = await Promise.all([
    AuditLog.find(query).populate('actor', 'name email role').sort('-createdAt').skip(skip).limit(limit),
    AuditLog.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { logs, pagination: buildPagination(total, page, limit) } });
};

exports.getImpact = async (req, res) => {
  const [totalStats, byCategory, recentRecords] = await Promise.all([
    ImpactRecord.aggregate([
      { $group: { _id: null, totalKg: { $sum: '$quantityKg' }, totalMeals: { $sum: '$estimatedMeals' }, totalFamilies: { $sum: '$estimatedFamilies' }, totalHours: { $sum: '$volunteerHours' } } },
    ]),
    ImpactRecord.aggregate([
      { $group: { _id: '$category', totalKg: { $sum: '$quantityKg' }, totalMeals: { $sum: '$estimatedMeals' }, count: { $sum: 1 } } },
      { $sort: { totalKg: -1 } },
    ]),
    ImpactRecord.find().populate('donor', 'name').populate('ngo', 'name').sort('-recordDate').limit(10),
  ]);
  const stats = totalStats[0] || { totalKg: 0, totalMeals: 0, totalFamilies: 0, totalHours: 0 };
  res.status(200).json({ success: true, data: { stats, byCategory, recentRecords } });
};
