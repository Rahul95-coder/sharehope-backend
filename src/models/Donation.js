const mongoose = require('mongoose');

const donationImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, default: '' },
  isPrimary: { type: Boolean, default: false },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const donationSchema = new mongoose.Schema({
  donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: [120, 'Title is too long (max 120 characters)'] },
  category: {
    type: String,
    enum: ['COOKED_FOOD', 'PACKAGED_FOOD', 'GROCERIES', 'FRUITS', 'VEGETABLES', 'BAKERY', 'DAIRY', 'ESSENTIALS', 'CLOTHING', 'LINENS', 'OTHER'],
    required: true,
  },
  description: { type: String, trim: true, maxlength: [1000, 'Description is too long (max 1000 characters)'] },
  quantity: { type: Number, required: true, min: [0.1, 'Quantity must be at least 0.1'], max: [100000, 'Quantity is unrealistically large'] },
  unit: { type: String, required: true, enum: ['KG', 'GRAMS', 'LITERS', 'PIECES', 'PACKETS', 'BOXES', 'PORTIONS', 'BUNDLES', 'OTHER'] },
  foodType: {
    type: String,
    enum: ['VEG', 'NONVEG', 'NOT_APPLICABLE'],
    default: 'NOT_APPLICABLE',
  },
  expiryDateTime: { type: Date, required: true },
  pickupDeadline: { type: Date },
  status: {
    type: String,
    enum: ['DRAFT', 'PENDING', 'AVAILABLE', 'CLAIMED', 'DISPATCHED', 'IN_TRANSIT', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING',
  },
  urgency: {
    type: String,
    enum: ['NORMAL', 'URGENT', 'CRITICAL', 'EXPIRED'],
    default: 'NORMAL',
  },
  images: [donationImageSchema],
  pickupAddress: {
    addressLine: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  storageCondition: {
    type: String,
    enum: ['ROOM_TEMPERATURE', 'REFRIGERATED', 'FROZEN', 'DRY_STORAGE', 'OTHER'],
    default: 'ROOM_TEMPERATURE',
  },
  temperatureGuideline: { type: String, default: '', maxlength: 300 },
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  claimedAt: { type: Date, default: null },
  // Legacy field. The pickup code now lives on the Claim and is only shown to the claiming NGO.
  // select:false keeps it out of every donation response (feed, detail, donor views).
  pickupCode: { type: String, default: null, select: false },
  pickupCodeExpiry: { type: Date, default: null },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  expiredAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: '', maxlength: 300 },
  adminNotes: { type: String, default: '' },
  estimatedMeals: { type: Number, default: 0 },
  actualQuantityReceived: { type: Number, default: null },
  isSeedData: { type: Boolean, default: false },
}, {
  timestamps: true,
});

donationSchema.index({ donor: 1 });
donationSchema.index({ claimedBy: 1 });
donationSchema.index({ status: 1 });
donationSchema.index({ category: 1 });
donationSchema.index({ expiryDateTime: 1 });
donationSchema.index({ 'pickupAddress.city': 1 });
donationSchema.index({ createdAt: -1 });
donationSchema.index({ urgency: 1 });
donationSchema.index({ isDeleted: 1 });

// Compound index for NGO discovery
donationSchema.index({ status: 1, isDeleted: 1, expiryDateTime: 1 });

const Donation = mongoose.model('Donation', donationSchema);
module.exports = Donation;
