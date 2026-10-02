// Integration: real connection attempts. A closed port plays the role of "Atlas is down".
const mongoose = require('mongoose');
const { connectDB, disconnectDB, getDbInfo } = require('../config/db');

const KEYS = ['MONGODB_URI', 'MONGODB_ATLAS_URI', 'MONGODB_LOCAL_URI', 'NODE_ENV', 'DB_ALLOW_FALLBACK', 'DB_SERVER_SELECTION_TIMEOUT_MS', 'DB_MODE'];
let saved;
const DEAD = 'mongodb://127.0.0.1:27999/sharehope_test';           // nothing listens here
const GOOD = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/sharehope_test';

beforeEach(() => {
  saved = {}; KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  process.env.DB_SERVER_SELECTION_TIMEOUT_MS = '1200';
});
afterEach(async () => {
  await disconnectDB().catch(() => {});
  KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  process.env.NODE_ENV = 'test';
});

test('auto mode: preferred DB down -> falls back to the local DB', async () => {
  process.env.MONGODB_ATLAS_URI = DEAD;
  process.env.MONGODB_LOCAL_URI = GOOD;
  const { source } = await connectDB({ mode: 'auto', silent: true });
  expect(source.label).toBe('MONGODB_LOCAL_URI');
  expect(getDbInfo().state).toBe('connected');
});

test('auto mode: preferred DB healthy -> used, no fallback', async () => {
  process.env.MONGODB_ATLAS_URI = GOOD;
  process.env.MONGODB_LOCAL_URI = DEAD;
  const { source } = await connectDB({ mode: 'auto', silent: true });
  expect(source.label).toBe('MONGODB_ATLAS_URI');
});

test('atlas mode never falls back to local', async () => {
  process.env.MONGODB_ATLAS_URI = DEAD;
  process.env.MONGODB_LOCAL_URI = GOOD;
  await expect(connectDB({ mode: 'atlas', silent: true })).rejects.toMatchObject({ isDbConnectError: true });
});

test('local mode never touches the Atlas URI', async () => {
  process.env.MONGODB_ATLAS_URI = DEAD;
  process.env.MONGODB_LOCAL_URI = GOOD;
  const { source } = await connectDB({ mode: 'local', silent: true });
  expect(source.label).toBe('MONGODB_LOCAL_URI');
});

test('production: no silent fallback (could hide real data behind an empty local DB)', async () => {
  process.env.NODE_ENV = 'production';
  process.env.MONGODB_ATLAS_URI = DEAD;
  process.env.MONGODB_LOCAL_URI = GOOD;
  await expect(connectDB({ mode: 'auto', silent: true })).rejects.toThrow(/Could not connect/);
});

test('failure report includes actionable hints and never leaks credentials', async () => {
  process.env.MONGODB_LOCAL_URI = 'mongodb://dbuser:S3cr3t%40pw@127.0.0.1:27999/sharehope_test';
  let err;
  try { await connectDB({ mode: 'local', silent: true }); } catch (e) { err = e; }
  expect(err.message).toMatch(/hint:/i);
  expect(err.message).not.toMatch(/S3cr3t/);
});
