const cron = require('node-cron');
const Donation = require('../models/Donation');
const Notification = require('../models/Notification');
const { createBulkNotifications } = require('../utils/notificationHelper');

const HOUR = 60 * 60 * 1000;
let running = false; // prevents two overlapping runs if one takes longer than the interval

/** Creates a notification per donation only once (the job runs every 15 min). */
const notifyOnce = async (donations, type, build) => {
  if (!donations.length) return 0;
  const already = await Notification.find({ type, entityId: { $in: donations.map((d) => d._id) } }).distinct('entityId');
  const seen = new Set(already.map(String));
  const fresh = donations.filter((d) => d.donor && !seen.has(String(d._id)));
  if (!fresh.length) return 0;
  await createBulkNotifications(
    fresh.map((d) => ({ user: d.donor, type, entityType: 'Donation', entityId: d._id, ...build(d) }))
  );
  return fresh.length;
};

const runExpiryCheck = async () => {
  if (running) return;
  running = true;
  try {
    const now = new Date();

    // 1) Expire overdue batches that nobody claimed (bulk, not one save() per document).
    const overdue = await Donation.find(
      { status: { $in: ['AVAILABLE', 'PENDING'] }, expiryDateTime: { $lte: now }, isDeleted: false },
      'donor title'
    );
    if (overdue.length) {
      await Donation.updateMany(
        { _id: { $in: overdue.map((d) => d._id) }, status: { $in: ['AVAILABLE', 'PENDING'] } },
        { status: 'EXPIRED', urgency: 'EXPIRED', expiredAt: now }
      );
      await notifyOnce(overdue, 'DONATION_EXPIRED', (d) => ({
        title: 'Donation expired',
        message: `Your donation "${d.title}" expired before an NGO could collect it.`,
        link: `/donor/donations/${d._id}`,
      }));
    }

    // 2) Refresh urgency buckets with three bulk updates.
    const live = { status: 'AVAILABLE', isDeleted: false };
    await Donation.updateMany(
      { ...live, expiryDateTime: { $gt: now, $lte: new Date(now.getTime() + 2 * HOUR) }, urgency: { $ne: 'CRITICAL' } },
      { urgency: 'CRITICAL' }
    );
    await Donation.updateMany(
      { ...live, expiryDateTime: { $gt: new Date(now.getTime() + 2 * HOUR), $lte: new Date(now.getTime() + 6 * HOUR) }, urgency: { $ne: 'URGENT' } },
      { urgency: 'URGENT' }
    );
    await Donation.updateMany(
      { ...live, expiryDateTime: { $gt: new Date(now.getTime() + 6 * HOUR) }, urgency: { $ne: 'NORMAL' } },
      { urgency: 'NORMAL' }
    );

    // 3) Warn donors once when a still-unclaimed batch is within 2 hours of expiry.
    const expiringSoon = await Donation.find(
      { ...live, expiryDateTime: { $gt: now, $lte: new Date(now.getTime() + 2 * HOUR) } },
      'donor title'
    );
    const warned = await notifyOnce(expiringSoon, 'DONATION_EXPIRING_SOON', (d) => ({
      title: 'Donation expiring soon!',
      message: `Your donation "${d.title}" expires within 2 hours and has not been claimed yet.`,
      link: `/donor/donations/${d._id}`,
    }));

    if (overdue.length || warned) {
      console.log(`[Expiry Job] expired: ${overdue.length}, expiry warnings sent: ${warned}`);
    }
  } catch (err) {
    console.error('[Expiry Job] Error:', err.message);
  } finally {
    running = false;
  }
};

const startExpiryJob = () => {
  let expr = process.env.EXPIRY_CHECK_CRON || '*/15 * * * *';
  if (!cron.validate(expr)) {
    console.warn(`[Expiry Job] invalid EXPIRY_CHECK_CRON "${expr}" - using */15 * * * *`);
    expr = '*/15 * * * *';
  }
  cron.schedule(expr, runExpiryCheck);
  console.log(`[Expiry Job] started (${expr})`);
  runExpiryCheck();
};

module.exports = { startExpiryJob, runExpiryCheck };
