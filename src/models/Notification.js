const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: [
      'VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'VERIFICATION_SUSPENDED',
      'DONATION_CREATED', 'DONATION_AVAILABLE', 'DONATION_CLAIMED', 'DONATION_EXPIRED',
      'DONATION_EXPIRING_SOON', 'DONATION_COMPLETED', 'DONATION_CANCELLED',
      'CLAIM_STATUS_CHANGE', 'PICKUP_REMINDER', 'PICKUP_CONFIRMED',
      'SHIFT_REMINDER', 'SHIFT_CANCELLED', 'SHIFT_RESCHEDULED',
      'VOLUNTEER_ATTENDANCE', 'NEARBY_DONATION', 'GENERAL',
    ],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  link: { type: String, default: null },
  entityType: { type: String, default: null },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
