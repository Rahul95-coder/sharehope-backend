const Claim = require('../models/Claim');
const Donation = require('../models/Donation');
const donationService = require('../services/donationService');
const AppError = require('../utils/AppError');
const { str, oneOf, parsePagination, buildPagination } = require('../utils/query');

const CLAIM_STATUSES = Claim.schema.path('status').enumValues;
const idOf = (v) => (v && v._id ? v._id.toString() : v ? v.toString() : '');

// NGO: their own claims (they legitimately see their own pickup code).
exports.getMyClaims = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const query = { ngo: req.user._id };
  const status = oneOf(str(req.query.status), CLAIM_STATUSES);
  if (status) query.status = status;

  const [claims, total] = await Promise.all([
    Claim.find(query)
      .populate({ path: 'donation', populate: { path: 'donor', select: 'name email phone address' } })
      .sort('-claimedAt')
      .skip(skip)
      .limit(limit),
    Claim.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { claims, pagination: buildPagination(total, page, limit) } });
};

exports.getClaimById = async (req, res) => {
  const claim = await Claim.findById(req.params.id)
    .populate({ path: 'donation', populate: { path: 'donor', select: 'name email phone address' } })
    .populate('ngo', 'name email phone address');
  if (!claim) throw new AppError('Claim not found.', 404);

  const uid = req.user._id.toString();
  const isNgo = idOf(claim.ngo) === uid;
  const isDonor = idOf(claim.donation && claim.donation.donor) === uid;
  const isAdmin = req.user.role === 'ADMIN';
  if (!isNgo && !isDonor && !isAdmin) throw new AppError('Unauthorized.', 403);

  const out = claim.toObject();
  if (isDonor && !isAdmin) delete out.pickupCode; // donor must not be able to read the code
  res.status(200).json({ success: true, data: { claim: out } });
};

exports.updateClaimStatus = async (req, res) => {
  const { status, cancelReason } = req.body;
  const claim = await donationService.updateClaimStatus(req.params.id, req.user._id, status, { cancelReason });
  res.status(200).json({ success: true, message: `Claim updated to ${status}`, data: { claim } });
};

exports.getDonorClaims = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const donationIds = await Donation.find({ donor: req.user._id }).distinct('_id');
  const query = { donation: { $in: donationIds } };
  const status = oneOf(str(req.query.status), CLAIM_STATUSES);
  if (status) query.status = status;

  const [claims, total] = await Promise.all([
    Claim.find(query)
      .select('-pickupCode') // the code is shown to the NGO only
      .populate('donation')
      .populate('ngo', 'name email phone address')
      .sort('-claimedAt')
      .skip(skip)
      .limit(limit),
    Claim.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { claims, pagination: buildPagination(total, page, limit) } });
};
