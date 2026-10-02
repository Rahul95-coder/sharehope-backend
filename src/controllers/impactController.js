const ImpactRecord = require('../models/ImpactRecord');
const Donation = require('../models/Donation');
const Claim = require('../models/Claim');
const User = require('../models/User');

exports.getPublicStats = async (req, res) => {
  const [donationStats, userStats, impactStats, volunteerStats] = await Promise.all([
    Donation.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { isDeleted: false, status: 'VERIFIED' } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    ImpactRecord.aggregate([
      { $group: { _id: null, totalKg: { $sum: '$quantityKg' }, totalMeals: { $sum: '$estimatedMeals' }, totalFamilies: { $sum: '$estimatedFamilies' } } },
    ]),
    User.aggregate([
      { $match: { role: 'VOLUNTEER', isDeleted: false } },
      { $group: { _id: null, totalHours: { $sum: '$totalVolunteerHours' }, totalKgSaved: { $sum: '$totalKgSaved' }, count: { $sum: 1 } } },
    ]),
  ]);

  const dStats = {};
  donationStats.forEach((d) => { dStats[d._id] = d.count; });
  const uStats = {};
  userStats.forEach((u) => { uStats[u._id] = u.count; });
  const impact = impactStats[0] || { totalKg: 0, totalMeals: 0, totalFamilies: 0 };
  const vStats = volunteerStats[0] || { totalHours: 0, totalKgSaved: 0, count: 0 };

  res.status(200).json({
    success: true,
    data: {
      totalDonations: Object.values(dStats).reduce((a, b) => a + b, 0),
      completedDonations: dStats['COMPLETED'] || 0,
      availableDonations: dStats['AVAILABLE'] || 0,
      verifiedDonors: uStats['DONOR'] || 0,
      verifiedNGOs: uStats['NGO'] || 0,
      volunteers: vStats.count,
      totalKgRescued: Math.round((impact.totalKg || 0) * 10) / 10,
      totalMealsProvided: impact.totalMeals || 0,
      familiesSupported: impact.totalFamilies || 0,
      volunteerHours: Math.round(vStats.totalHours || 0),
    },
  });
};

exports.getMyDonorImpact = async (req, res) => {
  const [records, donationStats] = await Promise.all([
    ImpactRecord.aggregate([
      { $match: { donor: req.user._id } },
      { $group: { _id: null, totalKg: { $sum: '$quantityKg' }, totalMeals: { $sum: '$estimatedMeals' }, totalFamilies: { $sum: '$estimatedFamilies' }, count: { $sum: 1 } } },
    ]),
    Donation.aggregate([
      { $match: { donor: req.user._id, isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  const stats = records[0] || { totalKg: 0, totalMeals: 0, totalFamilies: 0, count: 0 };
  const dStats = {};
  donationStats.forEach((d) => { dStats[d._id] = d.count; });
  res.status(200).json({ success: true, data: { ...stats, donationStats: dStats } });
};

exports.getMyNGOImpact = async (req, res) => {
  const [records, claimStats] = await Promise.all([
    ImpactRecord.aggregate([
      { $match: { ngo: req.user._id } },
      { $group: { _id: null, totalKg: { $sum: '$quantityKg' }, totalMeals: { $sum: '$estimatedMeals' }, totalFamilies: { $sum: '$estimatedFamilies' }, count: { $sum: 1 } } },
    ]),
    Claim.aggregate([
      { $match: { ngo: req.user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  const stats = records[0] || { totalKg: 0, totalMeals: 0, totalFamilies: 0, count: 0 };
  const cStats = {};
  claimStats.forEach((c) => { cStats[c._id] = c.count; });
  res.status(200).json({ success: true, data: { ...stats, claimStats: cStats } });
};

exports.getMyVolunteerImpact = async (req, res) => {
  const user = await User.findById(req.user._id);
  res.status(200).json({
    success: true,
    data: {
      shiftsCompleted: user.shiftsCompleted,
      shiftsCancelled: user.shiftsCancelled,
      totalVolunteerHours: Math.round(user.totalVolunteerHours * 10) / 10,
      totalKgSaved: Math.round(user.totalKgSaved * 10) / 10,
      reliabilityScore: user.reliabilityScore,
    },
  });
};
