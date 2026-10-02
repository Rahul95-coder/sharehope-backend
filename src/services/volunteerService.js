const mongoose = require('mongoose');
const VolunteerShift = require('../models/VolunteerShift');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { createNotification } = require('../utils/notificationHelper');
const AuditLog = require('../models/AuditLog');

const isActive = (a) => a.status !== 'CANCELLED';

const joinShift = async (shiftId, volunteerId) => {
  const existing = await VolunteerShift.findById(shiftId);
  if (!existing || existing.isDeleted) throw new AppError('Shift not found.', 404);
  if (new Date(existing.startTime) < new Date()) throw new AppError('Shift has already started.', 400);
  if (existing.assignedVolunteers.some((a) => a.volunteer.toString() === volunteerId.toString() && isActive(a))) {
    throw new AppError('You have already registered for this shift.', 400);
  }

  // Atomic spot reservation: the filter (spots left + open + not started) and the decrement happen
  // in ONE operation, so two volunteers can never take the last spot. (Previously: read, check,
  // then save - which let both succeed.)
  const entryId = new mongoose.Types.ObjectId();
  const shift = await VolunteerShift.findOneAndUpdate(
    { _id: shiftId, isDeleted: false, status: 'OPEN', spotsRemaining: { $gt: 0 }, startTime: { $gt: new Date() } },
    { $push: { assignedVolunteers: { _id: entryId, volunteer: volunteerId } }, $inc: { spotsRemaining: -1 } },
    { new: true }
  );

  if (!shift) {
    const fresh = await VolunteerShift.findById(shiftId);
    if (fresh && (fresh.status === 'FULL' || fresh.spotsRemaining <= 0)) throw new AppError('Shift is full.', 400);
    throw new AppError('Shift is not open for registration.', 400);
  }

  // Compensation for a same-user double click: if two concurrent requests both passed the
  // pre-check above, keep one registration and give the spot back.
  const mine = shift.assignedVolunteers.filter((a) => a.volunteer.toString() === volunteerId.toString() && isActive(a));
  if (mine.length > 1) {
    await VolunteerShift.updateOne(
      { _id: shiftId },
      { $pull: { assignedVolunteers: { _id: entryId } }, $inc: { spotsRemaining: 1 } }
    );
    throw new AppError('You have already registered for this shift.', 400);
  }

  if (shift.spotsRemaining <= 0 && shift.status === 'OPEN') {
    await VolunteerShift.updateOne({ _id: shiftId, status: 'OPEN', spotsRemaining: { $lte: 0 } }, { status: 'FULL' });
    shift.status = 'FULL';
  }

  await User.updateOne({ _id: volunteerId }, { $inc: { shiftsScheduled: 1 } });

  await createNotification({
    userId: volunteerId,
    type: 'SHIFT_REMINDER',
    title: 'Shift Registered!',
    message: `You have registered for the shift: "${shift.title}" on ${new Date(shift.startTime).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
    link: '/volunteer/my-shifts',
    entityType: 'VolunteerShift',
    entityId: shift._id,
  });

  return shift;
};

const cancelShift = async (shiftId, volunteerId, cancelReason = '') => {
  const shift = await VolunteerShift.findById(shiftId);
  if (!shift) throw new AppError('Shift not found.', 404);

  const assignment = shift.assignedVolunteers.find(
    (a) => a.volunteer.toString() === volunteerId.toString() && a.status === 'REGISTERED'
  );
  if (!assignment) throw new AppError('You are not registered for this shift or already cancelled.', 400);

  if (new Date(shift.startTime) < new Date()) throw new AppError('This shift has already started.', 400);

  const hoursUntilShift = (new Date(shift.startTime) - new Date()) / (1000 * 60 * 60);
  const isLate = hoursUntilShift < 24;

  assignment.status = 'CANCELLED';
  assignment.cancelledAt = new Date();
  assignment.cancelReason = cancelReason;
  assignment.isLateCancellation = isLate;
  shift.spotsRemaining = Math.min(shift.capacity, shift.spotsRemaining + 1);
  if (shift.status === 'FULL') shift.status = 'OPEN';
  await shift.save();

  const volunteer = await User.findById(volunteerId);
  volunteer.shiftsCancelled += 1;
  if (isLate) volunteer.lateCancellations += 1;
  // Recalculate reliability
  const total = volunteer.shiftsScheduled;
  if (total > 0) {
    const completedRatio = volunteer.shiftsCompleted / total;
    const latePenalty = (volunteer.lateCancellations * 2 + volunteer.noShows * 5) / Math.max(total, 1);
    volunteer.reliabilityScore = Math.max(0, Math.round((completedRatio - latePenalty) * 100));
  }
  await volunteer.save();

  return { shift, isLate, estimatedKg: shift.estimatedFoodKg };
};

const markAttendance = async (shiftId, volunteerId, attended) => {
  const shift = await VolunteerShift.findById(shiftId);
  if (!shift) throw new AppError('Shift not found.', 404);

  const assignment = shift.assignedVolunteers.find(
    (a) => a.volunteer.toString() === volunteerId.toString()
  );
  if (!assignment) throw new AppError('Volunteer not found in this shift.', 404);

  if (!['REGISTERED', 'CONFIRMED'].includes(assignment.status)) {
    throw new AppError(`Attendance was already recorded for this volunteer (${assignment.status}).`, 400);
  }

  const hours = (new Date(shift.endTime) - new Date(shift.startTime)) / (1000 * 60 * 60);

  if (attended) {
    assignment.status = 'ATTENDED';
    assignment.attendedAt = new Date();
    assignment.hoursLogged = hours;

    const volunteer = await User.findById(volunteerId);
    volunteer.shiftsCompleted += 1;
    volunteer.totalVolunteerHours += hours;
    volunteer.totalKgSaved += shift.estimatedFoodKg / Math.max(shift.assignedVolunteers.filter(a => a.status === 'ATTENDED').length + 1, 1);
    const total = volunteer.shiftsScheduled;
    if (total > 0) {
      const completedRatio = volunteer.shiftsCompleted / total;
      const latePenalty = (volunteer.lateCancellations * 2 + volunteer.noShows * 5) / Math.max(total, 1);
      volunteer.reliabilityScore = Math.max(0, Math.min(100, Math.round((completedRatio - latePenalty) * 100)));
    }
    await volunteer.save();
  } else {
    assignment.status = 'NO_SHOW';
    const volunteer = await User.findById(volunteerId);
    volunteer.noShows += 1;
    const total = volunteer.shiftsScheduled;
    if (total > 0) {
      const completedRatio = volunteer.shiftsCompleted / total;
      const latePenalty = (volunteer.lateCancellations * 2 + volunteer.noShows * 5) / Math.max(total, 1);
      volunteer.reliabilityScore = Math.max(0, Math.round((completedRatio - latePenalty) * 100));
    }
    await volunteer.save();
  }

  await shift.save();
  return shift;
};

module.exports = { joinShift, cancelShift, markAttendance };
