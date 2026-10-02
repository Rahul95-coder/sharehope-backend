const request = require('supertest');
const { connectTestDb, disconnectTestDb } = require('./helpers/testDb');
const { app, cleanup, createUser, auth } = require('./helpers/factory');

beforeAll(connectTestDb);
afterAll(async () => { await cleanup(); await disconnectTestDb(); });

const reg = (o = {}) => request(app).post('/api/auth/register').send({
  name: 'Reg Test', email: `reg${Date.now()}${Math.random().toString(36).slice(2, 6)}@sectest.com`,
  password: 'Test@1234', role: 'DONOR', phone: '9876543210', donorType: 'RESTAURANT', ...o,
});

describe('registration', () => {
  test('registers a donor, hides the password hash and internal fields', async () => {
    const res = await reg();
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.adminNotes).toBeUndefined();
    expect(res.body.data.user.status).toBe('PENDING');
  });
  test('cannot register as ADMIN', async () => {
    expect((await reg({ role: 'ADMIN' })).status).toBe(400);
  });
  test('ignores injected privileged fields (status / role escalation)', async () => {
    const res = await reg({ status: 'VERIFIED', isDeleted: false, adminNotes: 'hacked', reliabilityScore: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data.user.status).toBe('PENDING');
  });
  test('blank phone is accepted (it used to fail validation)', async () => {
    expect((await reg({ phone: '' })).status).toBe(201);
  });
  test('weak passwords are rejected with a helpful message', async () => {
    const short = await reg({ password: 'Ab1' });
    expect(short.status).toBe(400);
    expect(short.body.message).toMatch(/8-72/);
    expect((await reg({ password: 'abcdefghij' })).body.message).toMatch(/number/);
  });
  test('invalid email gets the email message (message was attached to the wrong validator)', async () => {
    const res = await reg({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid email/i);
  });
  test('duplicate email -> 409', async () => {
    const email = `dup${Date.now()}@sectest.com`;
    await reg({ email });
    expect((await reg({ email })).status).toBe(409);
  });
});

describe('login & session', () => {
  test('unknown email and wrong password give the same answer', async () => {
    const { user } = await createUser();
    const a = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong@1234' });
    const b = await request(app).post('/api/auth/login').send({ email: 'ghost@sectest.com', password: 'Wrong@1234' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });
  test('NoSQL operator objects in the login body are rejected', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: '' }, password: { $ne: '' } });
    expect(res.status).toBe(400);
  });
  test('/me requires a token and never exposes adminNotes', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const { token, user } = await createUser({ adminNotes: 'internal note' });
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.adminNotes).toBeUndefined();
  });
  test('tokens signed with another algorithm / secret are rejected', async () => {
    const jwt = require('jsonwebtoken');
    const bad = jwt.sign({ id: '507f1f77bcf86cd799439011' }, 'some-other-secret');
    expect((await request(app).get('/api/auth/me').set(auth(bad))).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"id":"507f1f77bcf86cd799439011"}').toString('base64url')}.`;
    expect((await request(app).get('/api/auth/me').set(auth(none))).status).toBe(401);
  });
  test('suspended users are locked out', async () => {
    const { token, user } = await createUser();
    user.status = 'SUSPENDED'; await user.save();
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(403);
  });
  test('change-password enforces policy and rejects the old password afterwards', async () => {
    const { token, user } = await createUser();
    const weak = await request(app).patch('/api/auth/change-password').set(auth(token)).send({ currentPassword: 'Test@1234', newPassword: 'short' });
    expect(weak.status).toBe(400);
    const ok = await request(app).patch('/api/auth/change-password').set(auth(token)).send({ currentPassword: 'Test@1234', newPassword: 'NewPass@5678' });
    expect(ok.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'Test@1234' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'NewPass@5678' })).status).toBe(200);
  });
  test('profile update only changes whitelisted fields', async () => {
    const { token } = await createUser();
    const res = await request(app).patch('/api/auth/profile').set(auth(token))
      .send({ name: 'New Name', role: 'ADMIN', status: 'VERIFIED', address: { city: 'Surat' } });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('New Name');
    expect(res.body.data.user.role).toBe('DONOR');
    expect(res.body.data.user.address.city).toBe('Surat');
    expect(res.body.data.user.address.state).toBe('Gujarat'); // partial update keeps other fields
  });
});
