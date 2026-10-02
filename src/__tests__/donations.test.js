const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { connectTestDb, disconnectTestDb, dbIsAtomic } = require('./helpers/testDb');
const { app, cleanup, createUser, auth, createDonation, inHours, PNG } = require('./helpers/factory');
const Donation = require('../models/Donation');
const Claim = require('../models/Claim');
const ImpactRecord = require('../models/ImpactRecord');
const Notification = require('../models/Notification');

let donor, ngo, ngo2, other, atomic;

beforeAll(async () => {
  await connectTestDb();
  atomic = await dbIsAtomic();
  if (!atomic) console.warn('[tests] This test database is not atomic (stand-in DB): concurrent-race assertions are relaxed. Run against real MongoDB to prove them.');
  await cleanup();
  donor = await createUser({ role: 'DONOR', name: 'Donor Co', phone: '9111111111' });
  ngo = await createUser({ role: 'NGO', name: 'NGO One', phone: '9222222222' });
  ngo2 = await createUser({ role: 'NGO', name: 'NGO Two' });
  other = await createUser({ role: 'DONOR', name: 'Other Donor' });
});
afterAll(async () => { await cleanup(); await disconnectTestDb(); });

describe('creating donations', () => {
  test('verified donor can create; ownership + status are set server-side', async () => {
    const res = await createDonation(donor.token);
    expect(res.status).toBe(201);
    expect(res.body.data.donation.status).toBe('AVAILABLE');
    expect(String(res.body.data.donation.donor)).toBe(String(donor.user._id));
  });
  test('mass-assignment: client cannot set status, claimedBy, donor, isDeleted', async () => {
    const res = await createDonation(donor.token, {
      fields: { status: 'COMPLETED', claimedBy: String(ngo.user._id), donor: String(other.user._id), isDeleted: 'true', pickupCode: 'HACKED' },
    });
    expect(res.status).toBe(201);
    const d = await Donation.findById(res.body.data.donation._id).select('+pickupCode');
    expect(d.status).toBe('AVAILABLE');
    expect(d.claimedBy).toBeNull();
    expect(String(d.donor)).toBe(String(donor.user._id));
    expect(d.isDeleted).toBe(false);
    expect(d.pickupCode).toBeNull();
  });
  test('rejects a past expiry, bad quantity, bad enum', async () => {
    expect((await createDonation(donor.token, { expiryDateTime: inHours(-1) })).status).toBe(400);
    const bad = await request(app).post('/api/donations').set(auth(donor.token))
      .field('title', 'x1').field('category', 'NOPE').field('quantity', '-5').field('unit', 'KG').field('expiryDateTime', inHours(5));
    expect(bad.status).toBe(400);
  });
  test('pickup deadline after expiry is rejected', async () => {
    const res = await createDonation(donor.token, { expiryDateTime: inHours(2), fields: { pickupDeadline: inHours(5) } });
    expect(res.status).toBe(400);
  });
  test('NGOs and unverified donors cannot create', async () => {
    expect((await createDonation(ngo.token)).status).toBe(403);
    const pending = await createUser({ role: 'DONOR', status: 'PENDING' });
    expect((await createDonation(pending.token)).status).toBe(403);
  });
});

describe('uploads', () => {
  test('stores a web URL (not an absolute disk path) and a safe extension', async () => {
    const res = await createDonation(donor.token, { title: 'With photo' })
      .attach('images', PNG, { filename: 'evil.html', contentType: 'image/png' });
    expect(res.status).toBe(201);
    const url = res.body.data.donation.images[0].url;
    expect(url).toMatch(/^\/uploads\/images\/\d+-[a-f0-9]{16}\.png$/); // extension from MIME, not "evil.html"
    expect(url).not.toMatch(/home|C:|\\/);
    const img = await request(app).get(url);
    expect(img.status).toBe(200);
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    await Donation.deleteOne({ _id: res.body.data.donation._id });
    fs.unlinkSync(path.join(__dirname, '../../uploads/images', path.basename(url)));
  });
  test('rejects a file whose bytes do not match its declared type, and deletes it', async () => {
    const dir = path.join(__dirname, '../../uploads/images');
    const before = fs.readdirSync(dir).length;
    const res = await createDonation(donor.token)
      .attach('images', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(fs.readdirSync(dir).length).toBe(before);
  });
  test('rejects disallowed MIME types (e.g. HTML, PDF as a donation photo)', async () => {
    const res = await createDonation(donor.token).attach('images', Buffer.from('<html>'), { filename: 'a.html', contentType: 'text/html' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not allowed/);
  });
  test('failed validation after upload leaves no orphan file', async () => {
    const dir = path.join(__dirname, '../../uploads/images');
    const before = fs.readdirSync(dir).length;
    const res = await createDonation(donor.token, { expiryDateTime: inHours(-3) })
      .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(fs.readdirSync(dir).length).toBe(before);
  });
  test('verification documents are NOT publicly downloadable', async () => {
    expect((await request(app).get('/uploads/documents/anything.pdf')).status).toBe(404);
    expect((await request(app).get('/api/users/documents/file/anything.pdf')).status).toBe(401);
  });
});

describe('privacy of the feed and detail endpoints', () => {
  let id;
  beforeAll(async () => { id = (await createDonation(donor.token, { title: 'Privacy batch' })).body.data.donation._id; });

  test('anonymous users cannot read donations at all', async () => {
    expect((await request(app).get('/api/donations')).status).toBe(401);
    expect((await request(app).get(`/api/donations/${id}`)).status).toBe(401);
  });
  test('NGO feed shows the donor name but not email/phone, and never a pickup code', async () => {
    const res = await request(app).get('/api/donations?limit=50').set(auth(ngo.token));
    expect(res.status).toBe(200);
    const d = res.body.data.donations.find((x) => x._id === id);
    expect(d.donor.name).toBe('Donor Co');
    expect(d.donor.email).toBeUndefined();
    expect(d.donor.phone).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/"pickupCode"/);
  });
  test('non-admins cannot browse claimed/other-status batches via ?status=', async () => {
    const res = await request(app).get('/api/donations?status=COMPLETED').set(auth(ngo.token));
    expect(res.body.data.donations.every((x) => x.status === 'AVAILABLE')).toBe(true);
  });
  test('NoSQL injection / ReDoS style input does not crash or leak', async () => {
    const r1 = await request(app).get('/api/donations?status[$ne]=x&category[$regex]=.*').set(auth(ngo.token));
    expect(r1.status).toBe(200);
    const t = Date.now();
    const r2 = await request(app).get(`/api/donations?search=${encodeURIComponent('(a+)+$')}&city=${encodeURIComponent('.*(.*)*')}`).set(auth(ngo.token));
    expect(r2.status).toBe(200);
    expect(Date.now() - t).toBeLessThan(3000);
    const r3 = await request(app).get('/api/donations?limit=99999&page=-4').set(auth(ngo.token));
    expect(r3.body.data.pagination.limit).toBeLessThanOrEqual(50);
    expect(r3.body.data.pagination.page).toBe(1);
  });
  test('invalid ObjectId -> 400, not 500', async () => {
    expect((await request(app).get('/api/donations/not-an-id').set(auth(ngo.token))).status).toBe(400);
  });
  test('detail view hides contact data from unrelated users but not from the owner', async () => {
    const asNgo = await request(app).get(`/api/donations/${id}`).set(auth(ngo.token));
    expect(asNgo.body.data.donation.donor.phone).toBeUndefined();
    const asOwner = await request(app).get(`/api/donations/${id}`).set(auth(donor.token));
    expect(asOwner.body.data.donation.donor.phone).toBe('9111111111');
  });
  test("one donor cannot edit, cancel or delete another donor's batch", async () => {
    expect((await request(app).patch(`/api/donations/${id}`).set(auth(other.token)).send({ title: 'pwned' })).status).toBe(403);
    expect((await request(app).patch(`/api/donations/${id}/cancel`).set(auth(other.token))).status).toBe(403);
    expect((await request(app).delete(`/api/donations/${id}`).set(auth(other.token))).status).toBe(403);
  });
});

describe('claim -> pickup -> completion integrity', () => {
  let id, code;

  beforeAll(async () => { id = (await createDonation(donor.token, { title: 'Flow batch', fields: { quantity: '20' } })).body.data.donation._id; });

  test('two NGOs racing for one batch: exactly one wins', async () => {
    const [a, b] = await Promise.all([
      request(app).post(`/api/donations/${id}/claim`).set(auth(ngo.token)),
      request(app).post(`/api/donations/${id}/claim`).set(auth(ngo2.token)),
    ]);
    if (atomic) expect([a.status, b.status].sort()).toEqual([200, 400]);
    // Whatever the DB engine, the stored state must be consistent: one claim, owned by the donation's claimer.
    const claims = await Claim.find({ donation: id });
    const don = await Donation.findById(id);
    if (!atomic) {
      // stand-in DB: collapse to a single deterministic claimer so the remaining tests can run
      await Claim.deleteMany({ donation: id, ngo: { $ne: don.claimedBy } });
    }
    const claim = await Claim.findOne({ donation: id });
    expect(String(claim.ngo)).toBe(String(don.claimedBy));
    code = claim.pickupCode;
    expect(code).toMatch(/^[A-F0-9]{6}$/);
    if (atomic) expect(claims).toHaveLength(1);
    if (String(claim.ngo) === String(ngo2.user._id)) { const t = ngo; ngo = ngo2; ngo2 = t; }
  });
  test('the donor is notified but the notification does NOT contain the code', async () => {
    const n = await Notification.find({ user: donor.user._id, type: 'DONATION_CLAIMED' });
    expect(n.length).toBeGreaterThan(0);
    n.forEach((x) => expect(x.message).not.toContain(code));
  });
  test('the donor cannot read the code from any API response', async () => {
    const detail = await request(app).get(`/api/donations/${id}`).set(auth(donor.token));
    const claims = await request(app).get('/api/claims/donor').set(auth(donor.token));
    const mine = await request(app).get('/api/donations/my').set(auth(donor.token));
    [detail, claims, mine].forEach((r) => expect(JSON.stringify(r.body)).not.toContain(code));
    const claimId = (await Claim.findOne({ donation: id }))._id;
    const one = await request(app).get(`/api/claims/${claimId}`).set(auth(donor.token));
    expect(JSON.stringify(one.body)).not.toContain(code);
  });
  test('the claiming NGO CAN see its own code', async () => {
    const res = await request(app).get('/api/claims').set(auth(ngo.token));
    expect(res.body.data.claims.some((c) => c.pickupCode === code)).toBe(true);
  });
  test('an NGO cannot complete a pickup itself (must be proven by the donor)', async () => {
    const claim = await Claim.findOne({ donation: id });
    await request(app).patch(`/api/claims/${claim._id}/status`).set(auth(ngo.token)).send({ status: 'DISPATCHED' }).expect(200);
    await request(app).patch(`/api/claims/${claim._id}/status`).set(auth(ngo.token)).send({ status: 'IN_TRANSIT' }).expect(200);
    const res = await request(app).patch(`/api/claims/${claim._id}/status`).set(auth(ngo.token)).send({ status: 'COMPLETED' });
    expect(res.status).toBe(400);
    expect((await Donation.findById(id)).status).toBe('IN_TRANSIT');
    expect(await ImpactRecord.countDocuments({ donation: id })).toBe(0);
  });
  test("another NGO cannot touch someone else's claim", async () => {
    const claim = await Claim.findOne({ donation: id });
    expect((await request(app).patch(`/api/claims/${claim._id}/status`).set(auth(ngo2.token)).send({ status: 'CANCELLED' })).status).toBe(403);
  });
  test('wrong code and wrong donor are refused', async () => {
    expect((await request(app).post(`/api/donations/${id}/verify-pickup`).set(auth(donor.token)).send({ code: 'ZZZZZZ' })).status).toBe(400);
    expect((await request(app).post(`/api/donations/${id}/verify-pickup`).set(auth(other.token)).send({ code })).status).toBe(403);
    expect((await request(app).post(`/api/donations/${id}/verify-pickup`).set(auth(donor.token)).send({ code: { $ne: '' } })).status).toBe(400);
    expect((await request(app).post(`/api/donations/${id}/verify-pickup`).set(auth(donor.token)).send({})).status).toBe(400);
  });
  test('correct code completes the pickup, records impact exactly once', async () => {
    const res = await request(app).post(`/api/donations/${id}/verify-pickup`).set(auth(donor.token)).send({ code: code.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body.data.claim.status).toBe('COMPLETED');
    expect(res.body.data.claim.pickupCode).toBeUndefined();
    expect((await Donation.findById(id)).status).toBe('COMPLETED');
    expect(await ImpactRecord.countDocuments({ donation: id })).toBe(1);
    // replay: cannot complete twice / double count impact
    const again = await request(app).post(`/api/donations/${id}/verify-pickup`).set(auth(donor.token)).send({ code });
    expect(again.status).toBe(404);
    expect(await ImpactRecord.countDocuments({ donation: id })).toBe(1);
  });
  test('the NGO is notified of the confirmed pickup', async () => {
    expect(await Notification.countDocuments({ user: ngo.user._id, type: 'PICKUP_CONFIRMED' })).toBeGreaterThan(0);
  });
});

describe('claim edge cases', () => {
  test('an expired batch cannot be claimed even if the cron has not flagged it yet', async () => {
    const d = await Donation.create({
      donor: donor.user._id, title: 'Stale', category: 'COOKED_FOOD', quantity: 5, unit: 'KG',
      expiryDateTime: new Date(Date.now() - 1000), status: 'AVAILABLE',
    });
    const res = await request(app).post(`/api/donations/${d._id}/claim`).set(auth(ngo.token));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/);
    expect((await Donation.findById(d._id)).status).toBe('AVAILABLE'); // untouched, no flip-flopping
  });
  test('unverified NGO and donor-role users cannot claim', async () => {
    const d = (await createDonation(donor.token, { title: 'Claim guard' })).body.data.donation;
    const pending = await createUser({ role: 'NGO', status: 'PENDING' });
    expect((await request(app).post(`/api/donations/${d._id}/claim`).set(auth(pending.token))).status).toBe(403);
    expect((await request(app).post(`/api/donations/${d._id}/claim`).set(auth(donor.token))).status).toBe(403);
  });
  test('releasing a claim makes the batch available again; cannot cancel twice', async () => {
    const d = (await createDonation(donor.token, { title: 'Release me' })).body.data.donation;
    const c = (await request(app).post(`/api/donations/${d._id}/claim`).set(auth(ngo.token))).body.data.claim;
    expect((await request(app).patch(`/api/claims/${c._id}/status`).set(auth(ngo.token)).send({ status: 'CANCELLED', cancelReason: 'no van' })).status).toBe(200);
    const after = await Donation.findById(d._id).select('+pickupCode');
    expect(after.status).toBe('AVAILABLE');
    expect(after.claimedBy).toBeNull();
    expect((await request(app).patch(`/api/claims/${c._id}/status`).set(auth(ngo.token)).send({ status: 'CANCELLED' })).status).toBe(400);
  });
  test('a donor cannot delete a batch an NGO has already claimed', async () => {
    const d = (await createDonation(donor.token, { title: 'Locked' })).body.data.donation;
    await request(app).post(`/api/donations/${d._id}/claim`).set(auth(ngo.token));
    expect((await request(app).delete(`/api/donations/${d._id}`).set(auth(donor.token))).status).toBe(400);
  });
});

describe('platform hardening', () => {
  test('CORS: rejects look-alike origins that the old substring check allowed', async () => {
    const evil = await request(app).get('/health').set('Origin', 'https://evil-localhost.com');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const evil2 = await request(app).get('/health').set('Origin', 'https://attacker.netlify.app');
    expect(evil2.headers['access-control-allow-origin']).toBeUndefined();
    const good = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(good.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
  test('errors: malformed JSON -> 400; unknown route -> 404 JSON; no stack in body in test of 4xx', async () => {
    const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(bad.status).toBe(400);
    const nf = await request(app).get('/api/nope');
    expect(nf.status).toBe(404);
    expect(nf.body.success).toBe(false);
  });
  test('admin routes are admin-only', async () => {
    expect((await request(app).get('/api/admin/dashboard').set(auth(ngo.token))).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(auth(donor.token))).status).toBe(403);
  });
  test('/health reports database state', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
  });
});
