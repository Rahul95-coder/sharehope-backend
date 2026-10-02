/**
 * npm run db:check  - tests every configured MongoDB (Atlas + local) separately and explains failures.
 */
require('../config/env').loadEnv();
const mongoose = require('mongoose');
const { buildCandidates, maskUri, explainError } = require('../config/db');

const scrub = (t) => String(t).replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, 'mongodb://<hidden>');

(async () => {
  console.log('MongoDB connection check\n');
  const targets = [
    ['MONGODB_ATLAS_URI', 'atlas'],
    ['MONGODB_LOCAL_URI', 'local'],
    ['MONGODB_URI', 'auto'],
  ];
  let anyOk = false;

  for (const [envName, mode] of targets) {
    if (!process.env[envName] && !(mode === 'local')) continue;
    const { candidates, problems } = buildCandidates(mode === 'auto' ? 'auto' : mode);
    const c = candidates.find((x) => x.label === envName || (mode === 'local' && x.label === 'default local'));
    console.log(`-- ${envName}`);
    if (!c) {
      console.log(`   not usable: ${problems.join('; ') || 'not set'}\n`);
      continue;
    }
    console.log(`   target : ${c.kind} ${maskUri(c.uri)}`);
    c.notes.forEach((n) => console.log(`   note   : ${n}`));
    const started = Date.now();
    try {
      const conn = await mongoose.createConnection(c.uri, { serverSelectionTimeoutMS: 8000 }).asPromise();
      const ping = await conn.db.admin().ping();
      console.log(`   result : OK (${Date.now() - started} ms, ping=${JSON.stringify(ping)})`);
      const cols = await conn.db.listCollections().toArray();
      console.log(`   data   : ${cols.length} collection(s) in "${conn.name}"`);
      anyOk = true;
      await conn.close();
    } catch (err) {
      console.log(`   result : FAILED - ${scrub(err.message)}`);
      const hint = explainError(err, c);
      if (hint) console.log(`   hint   : ${hint}`);
    }
    console.log('');
  }

  console.log(anyOk ? 'At least one database is reachable - the app can start.' : 'No database is reachable - fix the hints above.');
  process.exit(anyOk ? 0 : 1);
})();
