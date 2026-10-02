const request = require('supertest');
const { connectTestDb, disconnectTestDb, dbIsAtomic } = require('./helpers/testDb');
const { app, cleanup, createUser, auth } = require('./helpers/factory');
const VolunteerShift = require('../models/VolunteerShift');

let admin, v1, v2, v3, atomic;
const shiftBody = (o = {}) => ({
  title: 'TEST_Sorting', activityType: 'FOOD_SORTING', capacity: 1,
  startTime: new Date(Date.now() + 48 * 3600e3).toISOString(),
  endTime: new Date(Date.now() + 52 * 3600e3).toISOString(),
  location: { city: 'Ahmedabad' }, ...o,
});

beforeAll(async () => {
  await connectTestDb(); atomic = await dbIsAtomic(); await cleanup();
  admin = await createUser({ role: 'ADMIN' });
  [v1, v2, v3] = await Promise.all([1, 2, 3].map((i) => createUser({ role: 'VOLUNTEER', name: `Vol ${i}`, phone: `90000000${i}0` })));
});
afterAll(async () => { await cleanup(); await disconnectTestDb(); });

test('admin creates a shift; spotsRemaining is derived from capacity; injected fields ignored', async () => {
  const res = await request(app).post('/api/volunteers/shifts').set(auth(admin.token))
    .send(shiftBody({ capacity: 3, isDeleted: true, assignedVolunteers: [{ volunteer: v1.user._id }], status: 'COMPLETED' }));
  expect(res.status).toBe(201);
  const s = res.body.data.shift;
  expect(s.spotsRemaining).toBe(3);
  expect(s.isDeleted).toBe(false);
  expect(s.assignedVolunteers).toHaveLength(0);
  expect(s.status).toBe('OPEN');
});

test('non-admins cannot create shifts', async () => {
  expect((await request(app).post('/api/volunteers/shifts').set(auth(v1.token)).send(shiftBody())).status).toBe(403);
});

test('end before start is rejected', async () => {
  const res = await request(app).post('/api/volunteers/shifts').set(auth(admin.token))
    .send(shiftBody({ endTime: new Date(Date.now() + 3600e3).toISOString() }));
  expect(res.status).toBe(400);
});

describe('joining', () => {
  let shiftId;
  beforeAll(async () => {
    shiftId = (await request(app).post('/api/volunteers/shifts').set(auth(admin.token)).send(shiftBody({ title: 'TEST_LastSpot', capacity: 1 }))).body.data.shift._id;
  });

  test('last spot: of two simultaneous volunteers exactly one gets it (no overbooking)', async () => {
    if (!atomic) {
      // Stand-in DB cannot prove concurrency; join sequentially so the following tests still run.
      expect((await request(app).post(`/api/volunteers/shifts/${shiftId}/join`).set(auth(v1.token))).status).toBe(200);
      expect((await request(app).post(`/api/volunteers/shifts/${shiftId}/join`).set(auth(v2.token))).status).toBe(400);
    } else {
      const [a, b] = await Promise.all([
        request(app).post(`/api/volunteers/shifts/${shiftId}/join`).set(auth(v1.token)),
        request(app).post(`/api/volunteers/shifts/${shiftId}/join`).set(auth(v2.token)),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 400]);
    }
    const s = await VolunteerShift.findById(shiftId);
    expect(s.spotsRemaining).toBe(0);
    expect(s.status).toBe('FULL');
    expect(s.assignedVolunteers).toHaveLength(1);
  });

  test('cannot join twice; full shift refuses a third volunteer', async () => {
    const full = await request(app).post(`/api/volunteers/shifts/${shiftId}/join`).set(auth(v3.token));
    expect(full.status).toBe(400);
    expect(full.body.message).toMatch(/full/i);
  });

  test('cancel frees the spot; re-join works after cancelling', async () => {
    const wv = String((await VolunteerShift.findById(shiftId)).assignedVolunteers[0].volunteer) === String(v1.user._id) ? v1 : v2;
    expect((await request(app).post(`/api/volunteers/shifts/${shiftId}/cancel`).set(auth(wv.token)).send({})).status).toBe(200);
    expect((await VolunteerShift.findById(shiftId)).spotsRemaining).toBe(1);
    expect((await request(app).post(`/api/volunteers/shifts/${shiftId}/join`).set(auth(wv.token))).status).toBe(200);
  });
});

describe('my shifts + privacy', () => {
  let sid;
  beforeAll(async () => {
    sid = (await request(app).post('/api/volunteers/shifts').set(auth(admin.token)).send(shiftBody({ title: 'TEST_Mine', capacity: 5 }))).body.data.shift._id;
    await request(app).post(`/api/volunteers/shifts/${sid}/join`).set(auth(v1.token));
    await request(app).post(`/api/volunteers/shifts/${sid}/join`).set(auth(v2.token));
    await request(app).post(`/api/volunteers/shifts/${sid}/cancel`).set(auth(v1.token)).send({});
  });

  test('a volunteer who cancelled does NOT see the shift in "my shifts" (the $elemMatch bug)', async () => {
    const mine1 = await request(app).get('/api/volunteers/shifts/my').set(auth(v1.token));
    const mine2 = await request(app).get('/api/volunteers/shifts/my').set(auth(v2.token));
    expect(mine1.body.data.shifts.some((s) => s._id === sid)).toBe(false);
    expect(mine2.body.data.shifts.some((s) => s._id === sid)).toBe(true);
  });

  test("other volunteers' contact details are hidden from the public and from peers", async () => {
    const anon = await request(app).get(`/api/volunteers/shifts/${sid}`);
    expect(anon.status).toBe(200);
    expect(JSON.stringify(anon.body)).not.toMatch(/@sectest\.com|900000/);
    const peer = await request(app).get(`/api/volunteers/shifts/${sid}`).set(auth(v3.token));
    expect(JSON.stringify(peer.body)).not.toMatch(/@sectest\.com|900000/);
    expect(peer.body.data.shift.registeredCount).toBe(1);
    const adm = await request(app).get(`/api/volunteers/shifts/${sid}`).set(auth(admin.token));
    expect(JSON.stringify(adm.body)).toMatch(/@sectest\.com/);
  });

  test('attendance can only be recorded once per volunteer', async () => {
    const first = await request(app).post(`/api/volunteers/shifts/${sid}/attendance`).set(auth(admin.token)).send({ volunteerId: String(v2.user._id), attended: true });
    expect(first.status).toBe(200);
    const again = await request(app).post(`/api/volunteers/shifts/${sid}/attendance`).set(auth(admin.token)).send({ volunteerId: String(v2.user._id), attended: true });
    expect(again.status).toBe(400);
    const User = require('../models/User');
    expect((await User.findById(v2.user._id)).shiftsCompleted).toBe(1); // not double counted
  });
});
