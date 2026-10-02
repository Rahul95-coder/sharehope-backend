const mongoose = require('mongoose');

const impactRecordSchema = new mongoose.Schema({
  donation: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation', default: null },
  donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  category: { type: String },
  quantityKg: { type: Number, default: 0 },
  estimatedMeals: { type: Number, default: 0 },
  estimatedFamilies: { type: Number, default: 0 },
  volunteerHours: { type: Number, default: 0 },
  recordDate: { type: Date, default: Date.now },
  notes: { type: String, default: '' },
}, {
  timestamps: true,
});

impactRecordSchema.index({ donor: 1 });
impactRecordSchema.index({ ngo: 1 });
impactRecordSchema.index({ recordDate: -1 });

const ImpactRecord = mongoose.model('ImpactRecord', impactRecordSchema);
module.exports = ImpactRecord;
