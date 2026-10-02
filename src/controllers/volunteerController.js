const VolunteerShift = require('../models/VolunteerShift');
const volunteerService = require('../services/volunteerService');
const AppError = require('../utils/AppError');
const { str, escapeRegex, oneOf, parsePagination, buildPagination } = require('../utils/query');
const { cleanString, cleanAddress } = require('../utils/pick');

const enums = (path) => VolunteerShift.schema.path(path).enumValues;

const parseShiftBody = (body, { partial = false } = {}) => {
  const out = {};
  const text = (k, max) => {
    const v = cleanString(body[k], max);
    if (v !== undefined) out[k] = v;
  };
  text('title', 120);
  text('description', 1000);
  text('coordinatorNotes', 1000);
  if (body.activityType !== undefined) out.activityType = body.activityType;
  if (body.urgency !== undefined) out.urgency = body.urgency;
  const loc = cleanAddress(body.location);
  if (loc) out.location = loc;
  ['startTime', 'endTime'].forEach((k) => {
    if (body[k] !== undefined) {
      const d = new Date(body[k]);
      if (Number.isNaN(d.getTime())) throw new AppError(`${k} is not a valid date.`, 400);
      out[k] = d;
    }
  });
  if (body.capacity !== undefined) {
    const c = parseInt(body.capacity, 10);
    if (!Number.isFinite(c) || c < 1 || c > 1000) throw new AppError('Capacity must be between 1 and 1000.', 400);
    out.capacity = c;
  }
  if (Array.isArray(body.requiredSkills)) {
    out.requiredSkills = body.requiredSkills.filter((s) => typeof s === 'string').map((s) => s.slice(0, 60));
  }
  if (body.estimatedFoodKg !== undefined) {
    const k = Number(body.estimatedFoodKg);
    if (Number.isFinite(k) && k >= 0) out.estimatedFoodKg = k;
  }
  if (!partial && out.startTime && out.endTime && out.endTime <= out.startTime) {
    throw new AppError('End time must be after start time.', 400);
  }
  return out;
};

exports.getShifts = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const query = { isDeleted: false, startTime: { $gte: new Date() } };
  query.status = oneOf(str(req.query.status), enums('status')) || 'OPEN';
  const city = str(req.query.city, 60);
  const activityType = oneOf(str(req.query.activityType), enums('activityType'));
  const urgency = oneOf(str(req.query.urgency), enums('urgency'));
  if (city) query['location.city'] = { $regex: escapeRegex(city), $options: 'i' };
  if (activityType) query.activityType = activityType;
  if (urgency) query.urgency = urgency;

  const [shifts, total] = await Promise.all([
    VolunteerShift.find(query).select('-assignedVolunteers').populate('createdBy', 'name').sort('startTime').skip(skip).limit(limit),
    VolunteerShift.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { shifts, pagination: buildPagination(total, page, limit) } });
};

exports.getShiftById = async (req, res) => {
  const isAdmin = req.user && req.user.role === 'ADMIN';
  const shift = await VolunteerShift.findById(req.params.id).populate('assignedVolunteers.volunteer', 'name email phone');
  if (!shift || shift.isDeleted) throw new AppError('Shift not found.', 404);

  const out = shift.toObject();
  if (!isAdmin) {
    // Other volunteers' names / emails / phones are private: expose only headcount.
    out.registeredCount = out.assignedVolunteers.filter((a) => a.status !== 'CANCELLED').length;
    if (req.user) {
      out.assignedVolunteers = out.assignedVolunteers
        .filter((a) => a.volunteer && String(a.volunteer._id) === String(req.user._id))
        .map((a) => ({ _id: a._id, status: a.status, signedUpAt: a.signedUpAt }));
    } else {
      delete out.assignedVolunteers;
    }
  }
  res.status(200).json({ success: true, data: { shift: out } });
};

exports.createShift = async (req, res) => {
  const data = parseShiftBody(req.body);
  const shift = await VolunteerShift.create({
    ...data,
    spotsRemaining: data.capacity, // was required from the client before; now derived
    createdBy: req.user._id,
  });
  res.status(201).json({ success: true, message: 'Shift created.', data: { shift } });
};

exports.updateShift = async (req, res) => {
  const existing = await VolunteerShift.findById(req.params.id);
  if (!existing || existing.isDeleted) throw new AppError('Shift not found.', 404);

  const data = parseShiftBody(req.body, { partial: true });
  if (data.capacity !== undefined) {
    const taken = existing.assignedVolunteers.filter((a) => a.status !== 'CANCELLED').length;
    if (data.capacity < taken) throw new AppError(`Capacity cannot be below the ${taken} volunteers already registered.`, 400);
    data.spotsRemaining = data.capacity - taken;
    data.status = data.spotsRemaining === 0 ? 'FULL' : existing.status === 'FULL' ? 'OPEN' : existing.status;
  }
  const start = data.startTime || existing.startTime;
  const end = data.endTime || existing.endTime;
  if (end <= start) throw new AppError('End time must be after start time.', 400);

  const shift = await VolunteerShift.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true });
  res.status(200).json({ success: true, data: { shift } });
};

exports.joinShift = async (req, res) => {
  const shift = await volunteerService.joinShift(req.params.id, req.user._id);
  res.status(200).json({ success: true, message: 'Registered for shift.', data: { shift } });
};

exports.cancelShiftRegistration = async (req, res) => {
  const reason = cleanString(req.body.cancelReason, 300) || '';
  const result = await volunteerService.cancelShift(req.params.id, req.user._id, reason);
  res.status(200).json({
    success: true,
    message: 'Shift registration cancelled.',
    data: { isLateCancellation: result.isLate, estimatedFoodKg: result.estimatedKg },
  });
};

exports.getMyShifts = async (req, res) => {
  const now = new Date();
  const past = req.query.past === 'true' || req.query.past === '1';
  const timeFilter = past ? { endTime: { $lt: now } } : { startTime: { $gte: now } };
  const uid = req.user._id.toString();

  // Bug fixed: the old query had two separate conditions on the assignedVolunteers array
  // ('volunteer' = me AND 'status' != CANCELLED). MongoDB evaluates those independently across
  // the array, so a shift matched if I appeared anywhere and ANY other volunteer had not cancelled.
  // We fetch shifts that include me and then check both facts on MY assignment.
  const candidates = await VolunteerShift.find({
    isDeleted: false,
    'assignedVolunteers.volunteer': req.user._id,
    ...timeFilter,
  }).sort(past ? '-startTime' : 'startTime');

  const shifts = candidates
    .filter((s) => s.assignedVolunteers.some((a) => a.volunteer.toString() === uid && a.status !== 'CANCELLED'))
    .map((s) => {
      const o = s.toObject();
      delete o.assignedVolunteers; // never expose other volunteers
      return o;
    });

  res.status(200).json({ success: true, data: { shifts } });
};

exports.markAttendance = async (req, res) => {
  const { volunteerId, attended } = req.body;
  if (!volunteerId) throw new AppError('volunteerId required.', 400);
  const shift = await volunteerService.markAttendance(req.params.id, volunteerId, attended !== false);
  res.status(200).json({ success: true, data: { shift } });
};

exports.deleteShift = async (req, res) => {
  const shift = await VolunteerShift.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
  if (!shift) throw new AppError('Shift not found.', 404);
  res.status(200).json({ success: true, message: 'Shift deleted.' });
};
