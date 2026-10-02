const mongoose = require('mongoose');
const { normalizeMongoUri } = require('../../config/db');

/**
 * Tests ALWAYS use a dedicated database and refuse to run against Atlas.
 * (The old tests connected to MONGODB_ATLAS_URI and deleted data in your real database.)
 * Override with MONGODB_TEST_URI. Default: mongodb://127.0.0.1:27017/sharehope_test
 */
const connectTestDb = async () => {
  const raw = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/sharehope_test';
  const { uri } = normalizeMongoUri(raw, 'sharehope_test');
  if (/mongodb\.net|mongodb\+srv/i.test(uri) && process.env.ALLOW_TEST_ON_ATLAS !== 'true') {
    throw new Error('Refusing to run tests against a remote Atlas database. Use a local MONGODB_TEST_URI.');
  }
  if (!/sharehope_test|_test|test/i.test(uri.split('/').pop())) {
    throw new Error('Test database name must contain "test" (safety check).');
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
};

const disconnectTestDb = () => mongoose.disconnect();

/**
 * Real MongoDB (Atlas / mongod) applies a conditional update to exactly one of many concurrent
 * writers. Some MongoDB-compatible stand-ins (e.g. FerretDB on SQLite) do not. Race-condition tests
 * are only meaningful when the database itself is atomic, so they probe first.
 */
const dbIsAtomic = async () => {
  const col = mongoose.connection.db.collection('__atomic_probe');
  try {
    for (let round = 0; round < 6; round += 1) {
      await col.deleteMany({});
      await col.insertOne({ _id: 1, s: 'A' });
      const rs = await Promise.all(
        Array.from({ length: 8 }, (_, i) => col.updateOne({ _id: 1, s: 'A' }, { $set: { s: 'B', by: i } }))
      );
      if (rs.filter((r) => r.modifiedCount === 1).length > 1) return false;
    }
    return true;
  } finally {
    await col.drop().catch(() => {});
  }
};

module.exports = { connectTestDb, disconnectTestDb, dbIsAtomic };
