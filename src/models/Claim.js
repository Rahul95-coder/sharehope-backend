const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema({
  donation: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation', required: true },
  ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['CLAIMED', 'DISPATCHED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'],
    default: 'CLAIMED',
  },
  claimedAt: { type: Date, default: Date.now },
  dispatchedAt: { type: Date, default: null },
  inTransitAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: '' },
  pickupCode: { type: String, default: null },
  pickupCodeVerified: { type: Boolean, default: false },
  pickupCodeVerifiedAt: { type: Date, default: null },
  receivedQuantity: { type: Number, default: null },
  receiverName: { type: String, default: '' },
  pickupNotes: { type: String, default: '' },
  pickupProofUrl: { type: String, default: null },
  pickupProofPublicId: { type: String, default: null },
  estimatedPickupTime: { type: Date, default: null },
  actualPickupTime: { type: Date, default: null },
}, {
  timestamps: true,
});

claimSchema.index({ donation: 1 });
claimSchema.index({ ngo: 1 });
claimSchema.index({ status: 1 });
claimSchema.index({ donation: 1, status: 1 });

const Claim = mongoose.model('Claim', claimSchema);
module.exports = Claim;
