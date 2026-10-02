const Donation = require('../models/Donation');
const Claim = require('../models/Claim');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { getUrgency } = require('../utils/urgencyHelper');
const { calculateImpact } = require('../utils/impactCalculator');
const { generatePickupCode } = require('../utils/pickupCode');
const { createNotification } = require('../utils/notificationHelper');
const { safeEqual } = require('../utils/safeCompare');
const { cleanString, cleanAddress } = require('../utils/pick');
const { getFileUrl, getFileKey } = require('../config/cloudinary');
const AuditLog = require('../models/AuditLog');
const ImpactRecord = require('../models/ImpactRecord');

const ACTIVE_CLAIM_STATUSES = ['CLAIMED', 'DISPATCHED', 'IN_TRANSIT'];

/** Whitelists + sanitises donation fields coming from a request body. */
const pickDonationFields = (body) => {
  const out = {};
  const text = (key, max) => {
    const v = cleanString(body[key], max);
    if (v !== undefined) out[key] = v;
  };
  text('title', 120);
  text('description', 1000);
  text('category', 40);
  text('unit', 20);
  text('foodType', 20);
  text('storageCondition', 30);
  text('temperatureGuideline', 300);
  const address = cleanAddress(body.pickupAddress);
  if (address) out.pickupAddress = address;
  return out;
};

const createDonation = async (donorId, data, files) => {
  const donor = await User.findById(donorId);
  if (!donor || donor.status !== 'VERIFIED') {
    throw new AppError('Only verified donors can create donations.', 403);
  }

  const quantity = Number(data.quantity);
  const expiryDateTime = new Date(data.expiryDateTime);
  const fields = pickDonationFields(data);

  const pickupDeadline = data.pickupDeadline ? new Date(data.pickupDeadline) : undefined;
  if (pickupDeadline && pickupDeadline > expiryDateTime) {
    throw new AppError('Pickup deadline cannot be after the food expiry time.', 400);
  }

  // Fall back to the donor's registered address when none was supplied.
  if (!fields.pickupAddress || !fields.pickupAddress.city) {
    const a = donor.address || {};
    fields.pickupAddress = { ...(fields.pickupAddress || {}), addressLine: a.addressLine, city: a.city, state: a.state, pincode: a.pincode };
  }

  const impact = calculateImpact(quantity, fields.unit);
  const images = (files || []).map((f, i) => ({
    url: getFileUrl(f),
    publicId: getFileKey(f),
    isPrimary: i === 0,
  }));

  const donation = await Donation.create({
    ...fields,
    quantity,
    expiryDateTime,
    pickupDeadline,
    donor: donorId,
    status: 'AVAILABLE',
    urgency: getUrgency(expiryDateTime),
    images,
    estimatedMeals: impact.meals,
  });

  await AuditLog.create({
    actor: donorId,
    actorEmail: donor.email,
    actorRole: 'DONOR',
    action: 'DONATION_CREATED',
    entity: 'Donation',
    entityId: donation._id,
    metadata: { title: donation.title, category: donation.category },
  });

  return donation;
};

const claimDonation = async (donationId, ngoId) => {
  const ngo = await User.findById(ngoId);
  if (!ngo || ngo.status !== 'VERIFIED' || ngo.role !== 'NGO') {
    throw new AppError('Only verified NGOs can claim donations.', 403);
  }

  const now = new Date();

  // Single atomic step: availability AND expiry are part of the filter, so two NGOs can never
  // both win and an expired batch can never be claimed. (updateOne is atomic; modifiedCount tells
  // us whether WE won. This form also works on every MongoDB-compatible server.)
  const won = await Donation.updateOne(
    { _id: donationId, status: 'AVAILABLE', isDeleted: false, expiryDateTime: { $gt: now } },
    { $set: { status: 'CLAIMED', claimedBy: ngoId, claimedAt: now } }
  );

  if (won.modifiedCount !== 1) {
    const existing = await Donation.findOne({ _id: donationId, isDeleted: false });
    if (!existing) throw new AppError('Donation not found.', 404);
    if (existing.status === 'EXPIRED' || new Date(existing.expiryDateTime) <= now) {
      throw new AppError('This donation has expired.', 400);
    }
    throw new AppError('This donation is no longer available.', 400);
  }
  const donation = await Donation.findById(donationId);
  // Defence in depth: confirm the batch really is ours before creating the claim.
  if (!donation || String(donation.claimedBy) !== String(ngoId)) {
    throw new AppError('This donation is no longer available.', 400);
  }

  const pickupCode = generatePickupCode();
  let claim;
  try {
    claim = await Claim.create({
      donation: donation._id,
      ngo: ngoId,
      pickupCode,
      estimatedPickupTime: donation.pickupDeadline,
    });
  } catch (err) {
    // Do not leave the donation stuck as CLAIMED if the claim record failed.
    await Donation.updateOne(
      { _id: donation._id, status: 'CLAIMED', claimedBy: ngoId },
      { status: 'AVAILABLE', claimedBy: null, claimedAt: null }
    );
    throw err;
  }

  // The donor is told WHO claimed - never the code. The code is what the NGO team shows in
  // person; if the donor could read it, "verification" would prove nothing.
  await createNotification({
    userId: donation.donor,
    type: 'DONATION_CLAIMED',
    title: 'Your donation was claimed!',
    message: `${ngo.name} has claimed your donation: "${donation.title}". Ask their team for the pickup code when they arrive.`,
    link: '/donor/claims',
    entityType: 'Donation',
    entityId: donation._id,
  });

  await AuditLog.create({
    actor: ngoId,
    actorEmail: ngo.email,
    actorRole: 'NGO',
    action: 'DONATION_CLAIMED',
    entity: 'Donation',
    entityId: donation._id,
    metadata: { ngoName: ngo.name },
  });

  return { donation, claim };
};

const updateClaimStatus = async (claimId, ngoId, newStatus, extraData = {}) => {
  if (!['DISPATCHED', 'IN_TRANSIT', 'CANCELLED', 'COMPLETED'].includes(newStatus)) {
    throw new AppError('Invalid status.', 400);
  }
  if (newStatus === 'COMPLETED') {
    // Completion is proven by the donor entering the NGO's pickup code (verifyPickupCode).
    throw new AppError('A pickup is completed when the donor confirms your pickup code.', 400);
  }

  const claim = await Claim.findById(claimId).populate('donation');
  if (!claim) throw new AppError('Claim not found.', 404);
  if (claim.ngo.toString() !== ngoId.toString()) throw new AppError('Unauthorized.', 403);

  const validTransitions = {
    CLAIMED: ['DISPATCHED', 'CANCELLED'],
    DISPATCHED: ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['CANCELLED'],
  };
  if (!validTransitions[claim.status]?.includes(newStatus)) {
    throw new AppError(`Cannot transition from ${claim.status} to ${newStatus}`, 400);
  }

  const now = new Date();
  const update = { status: newStatus };
  const donationUpdate = { status: newStatus };

  if (newStatus === 'DISPATCHED') update.dispatchedAt = now;
  if (newStatus === 'IN_TRANSIT') update.inTransitAt = now;
  if (newStatus === 'CANCELLED') {
    update.cancelledAt = now;
    update.cancelReason = cleanString(extraData.cancelReason, 300) || '';
    const stillFresh = claim.donation && new Date(claim.donation.expiryDateTime) > now;
    donationUpdate.status = stillFresh ? 'AVAILABLE' : 'EXPIRED';
    donationUpdate.claimedBy = null;
    donationUpdate.claimedAt = null;
    donationUpdate.pickupCode = null;
    if (!stillFresh) donationUpdate.expiredAt = now;
  }

  // Compare-and-set on the current status: a double click / second tab cannot apply twice.
  const updated = await Claim.findOneAndUpdate({ _id: claimId, ngo: ngoId, status: claim.status }, update, { new: true });
  if (!updated) throw new AppError('This claim was just updated elsewhere. Please refresh and try again.', 409);

  if (claim.donation) {
    await Donation.updateOne({ _id: claim.donation._id }, donationUpdate);
    await createNotification({
      userId: claim.donation.donor,
      type: 'CLAIM_STATUS_CHANGE',
      title: 'Pickup update',
      message:
        newStatus === 'CANCELLED'
          ? `The NGO released your donation "${claim.donation.title}". ${donationUpdate.status === 'AVAILABLE' ? 'It is available for other NGOs again.' : 'It has expired.'}`
          : `Pickup for "${claim.donation.title}" is now ${newStatus.replace('_', ' ').toLowerCase()}.`,
      link: '/donor/claims',
      entityType: 'Donation',
      entityId: claim.donation._id,
    });
  }

  return Claim.findById(claimId).populate('donation').populate('ngo', 'name email phone address');
};

const recordImpact = async (donation, ngoId, quantity) => {
  const exists = await ImpactRecord.exists({ donation: donation._id });
  if (exists) return;
  const impact = calculateImpact(quantity || donation.quantity, donation.unit);
  await ImpactRecord.create({
    donation: donation._id,
    donor: donation.donor,
    ngo: ngoId,
    category: donation.category,
    quantityKg: impact.kgs,
    estimatedMeals: impact.meals,
    estimatedFamilies: impact.families,
  });
};

const verifyPickupCode = async (donationId, code, actor, extra = {}) => {
  if (typeof code !== 'string' || !code.trim()) throw new AppError('Pickup code is required.', 400);

  const donation = await Donation.findOne({ _id: donationId, isDeleted: false });
  if (!donation) throw new AppError('Donation not found.', 404);

  const isAdmin = actor.role === 'ADMIN';
  if (!isAdmin && donation.donor.toString() !== actor._id.toString()) {
    throw new AppError('Only the donor can verify pickup.', 403);
  }

  const claim = await Claim.findOne({ donation: donationId, status: { $in: ACTIVE_CLAIM_STATUSES } });
  if (!claim) throw new AppError('No active claim for this donation.', 404);

  if (!safeEqual(claim.pickupCode, code.trim().toUpperCase())) {
    throw new AppError('Invalid pickup code.', 400);
  }

  const now = new Date();
  const received = Number(extra.receivedQuantity);
  const hasReceived = Number.isFinite(received) && received > 0;

  const done = await Claim.findOneAndUpdate(
    { _id: claim._id, status: { $in: ACTIVE_CLAIM_STATUSES } },
    {
      status: 'COMPLETED',
      completedAt: now,
      actualPickupTime: now,
      pickupCodeVerified: true,
      pickupCodeVerifiedAt: now,
      ...(hasReceived && { receivedQuantity: received }),
    },
    { new: true }
  );
  if (!done) throw new AppError('This pickup was already completed.', 409);

  donation.status = 'COMPLETED';
  donation.completedAt = now;
  if (hasReceived) donation.actualQuantityReceived = received;
  await donation.save();

  // Impact is recorded here (it used to be recorded only on a path the UI never uses,
  // so verified pickups never counted towards the impact statistics).
  await recordImpact(donation, claim.ngo, hasReceived ? received : undefined);

  await Promise.all([
    createNotification({
      userId: claim.ngo,
      type: 'PICKUP_CONFIRMED',
      title: 'Pickup confirmed',
      message: `The donor confirmed the handoff of "${donation.title}". Thank you for rescuing this food!`,
      link: '/ngo/history',
      entityType: 'Donation',
      entityId: donation._id,
    }),
    AuditLog.create({
      actor: actor._id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'PICKUP_CONFIRMED',
      entity: 'Donation',
      entityId: donation._id,
      metadata: { claimId: claim._id },
    }),
  ]);

  const safeClaim = done.toObject();
  delete safeClaim.pickupCode;
  return { donation, claim: safeClaim };
};

module.exports = {
  createDonation,
  claimDonation,
  updateClaimStatus,
  verifyPickupCode,
  pickDonationFields,
  ACTIVE_CLAIM_STATUSES,
};
