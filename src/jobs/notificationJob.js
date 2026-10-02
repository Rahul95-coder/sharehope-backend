const cron = require('node-cron');
const VolunteerShift = require('../models/VolunteerShift');
const { createBulkNotifications } = require('../utils/notificationHelper');

const runShiftReminders = async () => {
  try {
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const upcomingShifts = await VolunteerShift.find({
      status: { $in: ['OPEN', 'FULL'] },
      startTime: { $lte: oneDayFromNow, $gte: now },
      isDeleted: false,
    });

    const notifications = [];
    for (const shift of upcomingShifts) {
      const isUrgent = new Date(shift.startTime) <= twoHoursFromNow;
      for (const assignment of shift.assignedVolunteers) {
        if (assignment.status === 'REGISTERED') {
          notifications.push({
            user: assignment.volunteer,
            type: 'SHIFT_REMINDER',
            title: isUrgent ? 'Shift starting soon!' : 'Upcoming shift reminder',
            message: `Reminder: Your shift "${shift.title}" starts on ${new Date(shift.startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
            link: `/volunteer/my-shifts`,
            entityType: 'VolunteerShift',
            entityId: shift._id,
          });
        }
      }
    }

    if (notifications.length > 0) {
      await createBulkNotifications(notifications);
      console.log(`[Notification Job] Sent ${notifications.length} shift reminders.`);
    }
  } catch (err) {
    console.error('[Notification Job] Error:', err.message);
  }
};

const startNotificationJob = () => {
  let cronExpr = process.env.NOTIFICATION_CRON || '0 8 * * *';
  if (!cron.validate(cronExpr)) {
    console.warn(`[Notification Job] invalid NOTIFICATION_CRON "${cronExpr}" - using 0 8 * * *`);
    cronExpr = '0 8 * * *';
  }
  cron.schedule(cronExpr, runShiftReminders, { timezone: 'Asia/Kolkata' });
  console.log(`[Notification Job] started (${cronExpr}, Asia/Kolkata)`);
};

module.exports = { startNotificationJob };
