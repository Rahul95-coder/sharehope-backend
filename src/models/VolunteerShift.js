const mongoose = require('mongoose');

const shiftAssignmentSchema = new mongoose.Schema({
  volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  signedUpAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['REGISTERED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED'],
    default: 'REGISTERED',
  },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: '' },
  isLateCancellation: { type: Boolean, default: false },
  attendedAt: { type: Date, default: null },
  hoursLogged: { type: Number, default: 0 },
}, { _id: true });

const volunteerShiftSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  activityType: {
    type: String,
    enum: ['KITCHEN_PREP', 'VAN_TRANSPORT', 'BAKERY_SURPLUS_ROUTE', 'FOOD_SORTING', 'PACKING', 'DELIVERY', 'PICKUP', 'OTHER'],
    required: true,
  },
  location: {
    addressLine: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  capacity: { type: Number, required: true, min: 1 },
  spotsRemaining: { type: Number, required: true, min: 0 },
  requiredSkills: { type: [String], default: [] },
  urgency: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
  },
  status: {
    type: String,
    enum: ['OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    default: 'OPEN',
  },
  assignedVolunteers: [shiftAssignmentSchema],
  relatedDonation: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation', default: null },
  coordinatorNotes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  estimatedFoodKg: { type: Number, default: 0 },
  actualFoodKg: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
  isSeedData: { type: Boolean, default: false },
}, {
  timestamps: true,
});

volunteerShiftSchema.index({ status: 1 });
volunteerShiftSchema.index({ startTime: 1 });
volunteerShiftSchema.index({ 'location.city': 1 });
volunteerShiftSchema.index({ activityType: 1 });
volunteerShiftSchema.index({ isDeleted: 1 });

const VolunteerShift = mongoose.model('VolunteerShift', volunteerShiftSchema);
module.exports = VolunteerShift;
