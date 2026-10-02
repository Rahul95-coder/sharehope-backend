const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  addressLine: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  pincode: { type: String, default: '' },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
}, { _id: false });

const verificationDocumentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  publicId: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: [100, 'Name is too long (max 100 characters)'] },
  contactPersonName: { type: String, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 20 },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['ADMIN', 'DONOR', 'NGO', 'VOLUNTEER'],
    required: true,
  },
  status: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'],
    default: 'PENDING',
  },
  address: { type: addressSchema, default: () => ({}) },
  // Donor-specific
  donorType: {
    type: String,
    enum: ['RESTAURANT', 'HOTEL', 'BAKERY', 'CLOUD_KITCHEN', 'EVENT_ORGANIZER', 'CANTEEN', 'UNIVERSITY_HOSTEL', 'CORPORATE_CAFETERIA', 'OTHER'],
  },
  // NGO + Donor shared
  registrationNumber: { type: String, trim: true, maxlength: 60 },
  organizationDescription: { type: String, trim: true, maxlength: [1000, 'Description is too long (max 1000 characters)'] },
  // NGO-specific
  mission: { type: String, trim: true, maxlength: [500, 'Mission is too long (max 500 characters)'] },
  // Documents
  verificationDocuments: [verificationDocumentSchema],
  // Volunteer-specific
  availability: {
    type: [String],
    enum: ['WEEKDAY_MORNING', 'WEEKDAY_AFTERNOON', 'WEEKDAY_EVENING', 'WEEKEND_MORNING', 'WEEKEND_AFTERNOON', 'WEEKEND_EVENING', 'FLEXIBLE'],
    default: [],
  },
  skills: { type: [String], default: [] },
  preferredCategories: { type: [String], default: [] },
  transportAvailable: { type: Boolean, default: false },
  reliabilityScore: { type: Number, default: 100, min: 0, max: 100 },
  shiftsCompleted: { type: Number, default: 0 },
  shiftsCancelled: { type: Number, default: 0 },
  shiftsScheduled: { type: Number, default: 0 },
  lateCancellations: { type: Number, default: 0 },
  noShows: { type: Number, default: 0 },
  totalVolunteerHours: { type: Number, default: 0 },
  totalKgSaved: { type: Number, default: 0 },
  // Avatar
  avatar: { type: String, default: null },
  avatarPublicId: { type: String, default: null },
  // Soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  // Admin notes (internal - never returned to the user themselves, see toSelfObject)
  adminNotes: { type: String, default: '', maxlength: 1000 },
  // Marks demo users created by `npm run seed` so re-seeding never touches real users
  isSeedData: { type: Boolean, default: false, select: false },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  lastLoginAt: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      delete ret.passwordHash;
      return ret;
    },
  },
});

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ isDeleted: 1 });
userSchema.index({ 'address.city': 1 });

// Instance methods
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Object safe to send back to the account owner (no password hash, no internal admin fields).
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject({ transform: false });
  delete obj.passwordHash;
  delete obj.adminNotes;
  delete obj.isSeedData;
  return obj;
};

// Static methods
userSchema.statics.hashPassword = async function (password) {
  return bcrypt.hash(password, 12);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
