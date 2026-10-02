const Donation = require('../models/Donation');
const Claim = require('../models/Claim');
const donationService = require('../services/donationService');
const AppError = require('../utils/AppError');
const { getUrgency } = require('../utils/urgencyHelper');
const { calculateImpact } = require('../utils/impactCalculator');
const { str, escapeRegex, oneOf, parsePagination, buildPagination } = require('../utils/query');
const { pick } = require('../utils/pick');
const { createNotification } = require('../utils/notificationHelper');
const { getFileUrl, getFileKey, deleteStoredFile, cleanupUploadedFiles } = require('../config/cloudinary');
const AuditLog = require('../models/AuditLog');

const enums = (path) => Donation.schema.path(path).enumValues;
const FEED_SORTS = ['-createdAt', 'createdAt', 'expiryDateTime', '-expiryDateTime', '-quantity', 'quantity'];
const CLAIMED_STATES = ['CLAIMED', 'DISPATCHED', 'IN_TRANSIT'];
const MAX_IMAGES = 8;

const id = (v) => (v && v._id ? v._id.toString() : v ? v.toString() : '');

exports.createDonation = async (req, res) => {
  try {
    const donation = await donationService.createDonation(req.user._id, req.body, req.files);
    res.status(201).json({ success: true, message: 'Donation created successfully', data: { donation } });
  } catch (err) {
    await cleanupUploadedFiles(req); // do not leave orphaned uploads behind
    throw err;
  }
};

exports.getDonations = async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  const q = req.query;
  const { page, limit, skip } = parsePagination(q, { defaultLimit: 12, maxLimit: 50 });

  const query = { isDeleted: false };
  // Only admins may list non-AVAILABLE batches; everyone else sees the open feed.
  query.status = isAdmin ? oneOf(str(q.status), enums('status')) || 'AVAILABLE' : 'AVAILABLE';
  if (query.status === 'AVAILABLE') query.expiryDateTime = { $gt: new Date() };

  const category = oneOf(str(q.category), enums('category'));
  const foodType = oneOf(str(q.foodType), enums('foodType'));
  const urgency = oneOf(str(q.urgency), enums('urgency'));
  const city = str(q.city, 60);
  const search = str(q.search, 60);
  if (category) query.category = category;
  if (foodType) query.foodType = foodType;
  if (urgency) query.urgency = urgency;
  if (city) query['pickupAddress.city'] = { $regex: escapeRegex(city), $options: 'i' };
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    query.$or = [{ title: rx }, { description: rx }];
  }

  const sort = oneOf(str(q.sort), FEED_SORTS) || '-createdAt';
  const donorFields = isAdmin ? 'name email phone address donorType' : 'name donorType address';

  const [donations, total] = await Promise.all([
    Donation.find(query).populate('donor', donorFields).sort(sort).skip(skip).limit(limit),
    Donation.countDocuments(query),
  ]);

  res.status(200).json({ success: true, data: { donations, pagination: buildPagination(total, page, limit) } });
};

exports.getDonationById = async (req, res) => {
  const donation = await Donation.findOne({ _id: req.params.id, isDeleted: false })
    .populate('donor', 'name email phone address donorType organizationDescription')
    .populate('claimedBy', 'name email phone address');
  if (!donation) throw new AppError('Donation not found.', 404);

  const uid = req.user._id.toString();
  const isAdmin = req.user.role === 'ADMIN';
  const isOwner = id(donation.donor) === uid;
  const isClaimer = id(donation.claimedBy) === uid;
  const privileged = isAdmin || isOwner || isClaimer;

  // Other users can only see batches that are open for claiming.
  if (!privileged && donation.status !== 'AVAILABLE') throw new AppError('Donation not found.', 404);

  const out = donation.toObject();
  if (!privileged) {
    // Contact details are shared only between the donor and the NGO that claimed the batch.
    out.donor = pick(out.donor, ['_id', 'name', 'donorType', 'address', 'organizationDescription']);
    delete out.claimedBy;
  }
  res.status(200).json({ success: true, data: { donation: out } });
};

const assertEditable = (donation, user) => {
  if (!donation || donation.isDeleted) throw new AppError('Donation not found.', 404);
  if (donation.donor.toString() !== user._id.toString() && user.role !== 'ADMIN') {
    throw new AppError('Unauthorized.', 403);
  }
};

exports.updateDonation = async (req, res) => {
  const donation = await Donation.findById(req.params.id);
  assertEditable(donation, req.user);
  if (user_isNotAdmin(req) && !['AVAILABLE', 'PENDING'].includes(donation.status)) {
    throw new AppError('Only listings that are still available can be edited.', 400);
  }

  const fields = donationService.pickDonationFields(req.body);
  const updates = {};
  ['title', 'description', 'unit', 'category', 'foodType', 'storageCondition', 'temperatureGuideline', 'pickupAddress'].forEach((f) => {
    if (fields[f] !== undefined) updates[f] = fields[f];
  });

  if (req.body.quantity !== undefined) {
    const qty = Number(req.body.quantity);
    if (!Number.isFinite(qty) || qty < 0.1 || qty > 100000) throw new AppError('Invalid quantity.', 400);
    updates.quantity = qty;
  }
  if (req.body.expiryDateTime !== undefined) {
    const exp = new Date(req.body.expiryDateTime);
    if (Number.isNaN(exp.getTime()) || exp <= new Date()) throw new AppError('Expiry must be a valid future date.', 400);
    updates.expiryDateTime = exp;
    updates.urgency = getUrgency(exp);
  }
  if (req.body.pickupDeadline !== undefined) {
    const dl = new Date(req.body.pickupDeadline);
    if (Number.isNaN(dl.getTime())) throw new AppError('Invalid pickup deadline.', 400);
    updates.pickupDeadline = dl;
  }
  if (updates.quantity !== undefined || updates.unit !== undefined) {
    updates.estimatedMeals = calculateImpact(updates.quantity ?? donation.quantity, updates.unit ?? donation.unit).meals;
  }

  Object.entries(updates).forEach(([key, value]) => donation.set(key, value));
  await donation.save(); // runs schema validators
  const updated = await donation.populate('donor', 'name email');

  await AuditLog.create({
    actor: req.user._id,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    action: 'DONATION_UPDATED',
    entity: 'Donation',
    entityId: donation._id,
    metadata: { fields: Object.keys(updates) },
  });

  res.status(200).json({ success: true, data: { donation: updated } });
};

function user_isNotAdmin(req) {
  return req.user.role !== 'ADMIN';
}

exports.cancelDonation = async (req, res) => {
  const donation = await Donation.findById(req.params.id);
  assertEditable(donation, req.user);
  if (donation.status === 'COMPLETED') throw new AppError('Cannot cancel a completed donation.', 400);
  if (donation.status === 'CANCELLED') throw new AppError('Donation is already cancelled.', 400);
  if (CLAIMED_STATES.includes(donation.status) && user_isNotAdmin(req)) {
    throw new AppError('Cannot cancel a claimed donation. Contact admin.', 400);
  }

  // If an NGO already holds a claim (admin override), release it and tell the NGO.
  const activeClaim = await Claim.findOneAndUpdate(
    { donation: donation._id, status: { $in: CLAIMED_STATES } },
    { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Donation cancelled by administrator' },
    { new: true }
  );
  if (activeClaim) {
    await createNotification({
      userId: activeClaim.ngo,
      type: 'DONATION_CANCELLED',
      title: 'Claimed donation cancelled',
      message: `"${donation.title}" was cancelled and your claim has been released.`,
      link: '/ngo/claims',
      entityType: 'Donation',
      entityId: donation._id,
    });
  }

  donation.status = 'CANCELLED';
  donation.cancelledAt = new Date();
  donation.cancelReason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
  donation.claimedBy = null;
  await donation.save();

  res.status(200).json({ success: true, message: 'Donation cancelled', data: { donation } });
};

exports.deleteDonation = async (req, res) => {
  const donation = await Donation.findById(req.params.id);
  assertEditable(donation, req.user);
  if (donation.status === 'COMPLETED') throw new AppError('Cannot delete a completed donation.', 400);
  if (CLAIMED_STATES.includes(donation.status) && user_isNotAdmin(req)) {
    throw new AppError('Cannot delete a donation that an NGO has claimed.', 400);
  }
  donation.isDeleted = true;
  donation.deletedAt = new Date();
  await donation.save();
  res.status(200).json({ success: true, message: 'Donation deleted.' });
};

exports.getMyDonations = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const query = { donor: req.user._id, isDeleted: false };
  const status = oneOf(str(req.query.status), enums('status'));
  if (status) query.status = status;

  const [donations, total] = await Promise.all([
    Donation.find(query).populate('claimedBy', 'name email phone').sort('-createdAt').skip(skip).limit(limit),
    Donation.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { donations, pagination: buildPagination(total, page, limit) } });
};

exports.claimDonation = async (req, res) => {
  const result = await donationService.claimDonation(req.params.id, req.user._id);
  res.status(200).json({ success: true, message: 'Donation claimed successfully', data: result });
};

exports.verifyPickup = async (req, res) => {
  const result = await donationService.verifyPickupCode(req.params.id, req.body.code, req.user, {
    receivedQuantity: req.body.receivedQuantity,
  });
  res.status(200).json({ success: true, message: 'Pickup verified!', data: result });
};

exports.addImages = async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation || donation.isDeleted) throw new AppError('Donation not found.', 404);
    if (donation.donor.toString() !== req.user._id.toString()) throw new AppError('Unauthorized.', 403);

    const files = req.files || [];
    if (donation.images.length + files.length > MAX_IMAGES) {
      throw new AppError(`A donation can have at most ${MAX_IMAGES} photos.`, 400);
    }

    donation.images.push(
      ...files.map((f, i) => ({
        url: getFileUrl(f),
        publicId: getFileKey(f),
        isPrimary: donation.images.length === 0 && i === 0,
      }))
    );
    await donation.save();
    res.status(200).json({ success: true, data: { images: donation.images } });
  } catch (err) {
    await cleanupUploadedFiles(req);
    throw err;
  }
};

exports.removeImage = async (req, res) => {
  const donation = await Donation.findById(req.params.id);
  if (!donation || donation.isDeleted) throw new AppError('Donation not found.', 404);
  if (donation.donor.toString() !== req.user._id.toString()) throw new AppError('Unauthorized.', 403);

  const image = donation.images.find((img) => img._id.toString() === req.params.imageId);
  if (!image) throw new AppError('Image not found.', 404);

  donation.images = donation.images.filter((img) => img._id.toString() !== req.params.imageId);
  if (image.isPrimary && donation.images.length) donation.images[0].isPrimary = true;
  await donation.save();
  await deleteStoredFile(image); // actually remove the file from disk / Cloudinary
  res.status(200).json({ success: true, message: 'Image removed.' });
};
