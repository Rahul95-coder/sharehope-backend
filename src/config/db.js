const mongoose = require('mongoose');
const dns = require('dns');

const DEFAULT_DB_NAME = () => process.env.MONGODB_DB_NAME || 'sharehope';
const DEFAULT_LOCAL_URI = () => `mongodb://127.0.0.1:27017/${DEFAULT_DB_NAME()}`;

let currentSource = null;
let listenersAttached = false;
let dnsPatched = false;

// ---------------------------------------------------------------------------
// URI helpers
// ---------------------------------------------------------------------------

/** Characters allowed unescaped in the userinfo part of a URI (RFC 3986). */
const SAFE_USERINFO = /^[A-Za-z0-9\-._~!$&'()*+,;=]*$/;

const needsEncoding = (part) => {
  // A value that already contains only valid %XX escapes + safe chars is treated as pre-encoded.
  const withoutEscapes = part.replace(/%[0-9A-Fa-f]{2}/g, '');
  return !SAFE_USERINFO.test(withoutEscapes);
};

const encodePart = (part) => (needsEncoding(part) ? encodeURIComponent(part) : part);


const normalizeMongoUri = (raw, dbName = DEFAULT_DB_NAME()) => {
  const notes = [];
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Connection string is empty.');

  let uri = raw.trim();
  if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
    uri = uri.slice(1, -1).trim();
    notes.push('removed surrounding quotes');
  }
  if (/<password>|<username>|<db_password>/i.test(uri)) {
    throw new Error('Connection string still contains a <username>/<password> placeholder.');
  }

  const m = uri.match(/^(mongodb(?:\+srv)?):\/\/(.*)$/i);
  if (!m) throw new Error('Connection string must start with mongodb:// or mongodb+srv://');

  const scheme = m[1].toLowerCase();
  const rest = m[2];

  // Credentials end at the LAST "@" (hostnames can never contain "@").
  const at = rest.lastIndexOf('@');
  let credentials = '';
  let hostAndRest = rest;
  if (at !== -1) {
    const rawCred = rest.slice(0, at);
    hostAndRest = rest.slice(at + 1);

    const colon = rawCred.indexOf(':');
    const user = colon === -1 ? rawCred : rawCred.slice(0, colon);
    const pass = colon === -1 ? null : rawCred.slice(colon + 1);

    const encUser = encodePart(user);
    const encPass = pass === null ? null : encodePart(pass);
    if (encUser !== user || (pass !== null && encPass !== pass)) {
      notes.push('auto-encoded special characters in the username/password');
    }
    credentials = `${encUser}${encPass === null ? '' : `:${encPass}`}@`;
  }

  // Split "host[,host2]/database?options"
  const firstDelim = hostAndRest.search(/[/?]/);
  let hosts = firstDelim === -1 ? hostAndRest : hostAndRest.slice(0, firstDelim);
  const tail = firstDelim === -1 ? '' : hostAndRest.slice(firstDelim);

  let pathPart = '';
  let query = '';
  if (tail.startsWith('/')) {
    const q = tail.indexOf('?');
    pathPart = q === -1 ? tail.slice(1) : tail.slice(1, q);
    query = q === -1 ? '' : tail.slice(q + 1);
  } else if (tail.startsWith('?')) {
    query = tail.slice(1);
  }

  if (!hosts) throw new Error('Connection string has no host.');

  if (!pathPart) {
    pathPart = dbName;
    notes.push(`no database name in the URI - using "${dbName}"`);
  }

  if (scheme === 'mongodb' && /(^|,)localhost(?=[:,]|$)/i.test(hosts)) {
    hosts = hosts.replace(/(^|,)localhost(?=[:,]|$)/gi, '$1127.0.0.1');
    notes.push('using 127.0.0.1 instead of localhost (avoids IPv6 connection refusals)');
  }

  const out = `${scheme}://${credentials}${hosts}/${pathPart}${query ? `?${query}` : ''}`;
  return { uri: out, notes };
};

/** Hides credentials so a URI can be logged safely. */
const maskUri = (uri) => String(uri).replace(/(mongodb(?:\+srv)?:\/\/)[^/]*@/i, '$1***:***@');

/** Removes anything that looks like a connection string from an error message. */
const scrub = (text) =>
  String(text || '').replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, 'mongodb://<hidden>');

const describeUri = (uri) => {
  const m = String(uri).match(/^mongodb(\+srv)?:\/\/(?:.*@)?([^/?@]+)\/([^?]*)/i);
  if (!m) return { kind: 'remote', host: 'unknown', db: 'unknown' };
  const isSrv = !!m[1];
  const host = m[2];
  const first = host.split(',')[0].split(':')[0].toLowerCase();
  let kind = 'remote';
  if (isSrv || first.endsWith('.mongodb.net')) kind = 'atlas';
  else if (['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal'].includes(first)) kind = 'local';
  return { kind, host, db: decodeURIComponent(m[3] || '') || DEFAULT_DB_NAME() };
};

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

const resolveMode = (explicit) => {
  const arg = process.argv.find((a) => a.startsWith('--db='));
  const value = (explicit || (arg && arg.split('=')[1]) || process.env.DB_MODE || 'auto').toLowerCase();
  return ['auto', 'atlas', 'local'].includes(value) ? value : 'auto';
};

const isProd = () => process.env.NODE_ENV === 'production';

const allowFallback = () => {
  const v = process.env.DB_ALLOW_FALLBACK;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return !isProd();
};

const buildCandidates = (mode) => {
  const e = process.env;
  const raw = [];
  const add = (label, value) => {
    if (typeof value === 'string' && value.trim()) raw.push({ label, value });
  };

  if (mode === 'atlas') {
    add('MONGODB_ATLAS_URI', e.MONGODB_ATLAS_URI);
    add('MONGODB_URI', e.MONGODB_URI);
  } else if (mode === 'local') {
    add('MONGODB_LOCAL_URI', e.MONGODB_LOCAL_URI);
    if (!raw.length) add('default local', DEFAULT_LOCAL_URI());
  } else {
    add('MONGODB_URI', e.MONGODB_URI);
    add('MONGODB_ATLAS_URI', e.MONGODB_ATLAS_URI);
    add('MONGODB_LOCAL_URI', e.MONGODB_LOCAL_URI);
    // The implicit default is only a last resort when NOTHING is configured (dev only).
    if (!raw.length && !isProd()) add('default local', DEFAULT_LOCAL_URI());
  }

  const seen = new Set();
  const candidates = [];
  const problems = [];
  for (const item of raw) {
    try {
      const { uri, notes } = normalizeMongoUri(item.value);
      if (seen.has(uri)) continue;
      seen.add(uri);
      candidates.push({ label: item.label, uri, notes, ...describeUri(uri) });
    } catch (err) {
      problems.push(`${item.label}: ${err.message}`);
    }
  }
  return { candidates, problems };
};

// ---------------------------------------------------------------------------
// Errors -> human hints
// ---------------------------------------------------------------------------

const explainError = (err, candidate) => {
  const msg = String(err && err.message ? err.message : err);
  const low = msg.toLowerCase();

  if (err && err.name === 'MongoParseError') {
    return 'The connection string is malformed. If your password has special characters (@ : / ? # %) they must be URL-encoded, e.g. "@" -> "%40".';
  }
  if (low.includes('bad auth') || low.includes('authentication failed') || low.includes('auth failed')) {
    return 'Authentication failed: wrong database username/password (or the user has no access to this database). Check Atlas -> Database Access.';
  }
  if (low.includes('querysrv') || (low.includes('enotfound') && candidate.kind === 'atlas')) {
    return 'DNS lookup for the Atlas cluster failed. Check the cluster hostname, your internet/VPN, or try switching your DNS to 8.8.8.8 / 1.1.1.1 (some ISPs block SRV lookups). You can also use the non-SRV "standard connection string" from Atlas.';
  }
  if (
    low.includes('whitelist') ||
    low.includes('could not connect to any servers in your mongodb atlas') ||
    (candidate.kind === 'atlas' && low.includes('server selection'))
  ) {
    return 'Atlas is not reachable from this machine. Add your current IP in Atlas -> Network Access (or 0.0.0.0/0 for testing), and make sure the cluster is not paused.';
  }
  if (low.includes('econnrefused') && candidate.kind === 'local') {
    return 'Local MongoDB is not running. Start it (Windows: run "net start MongoDB" in an Administrator terminal, or start mongod / MongoDB Compass; macOS: "brew services start mongodb-community"; Linux: "sudo systemctl start mongod").';
  }
  if (low.includes('etimedout') || low.includes('timed out') || low.includes('server selection')) {
    return 'Connection timed out - check that the host/port is reachable and not blocked by a firewall/VPN.';
  }
  return null;
};

// ---------------------------------------------------------------------------
// Connecting
// ---------------------------------------------------------------------------

const connectOptions = () => ({
  serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT_MS, 10) || 8000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
});

const isSrvDnsFailure = (err) => {
  const msg = String(err && err.message).toLowerCase();
  return msg.includes('querysrv') || msg.includes('querytxt');
};

const attachListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;
  // Only noisy once we are connected; during startup failures are reported (with hints) by connectDB.
  mongoose.connection.on('error', (err) => currentSource && console.error('[db] connection error:', scrub(err.message)));
  mongoose.connection.on('disconnected', () => currentSource && console.warn('[db] disconnected - the driver will try to reconnect'));
  mongoose.connection.on('reconnected', () => console.log('[db] reconnected'));
};

const attemptConnect = async (candidate) => {
  try {
    return await mongoose.connect(candidate.uri, connectOptions());
  } catch (err) {
    // Some ISPs / routers refuse SRV lookups. Retry once through public DNS.
    if (candidate.kind === 'atlas' && isSrvDnsFailure(err) && !dnsPatched) {
      dnsPatched = true;
      const servers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      dns.setServers(servers);
      console.warn(`[db] SRV lookup failed via system DNS - retrying through ${servers.join(', ')}`);
      await mongoose.disconnect().catch(() => {});
      return mongoose.connect(candidate.uri, connectOptions());
    }
    throw err;
  }
};

/**
 * Connects to MongoDB. Resolves with { conn, source }.
 * Rejects (never calls process.exit itself) so callers decide what to do.
 *
 * options: { mode, silent }
 */
const connectDB = async (options = {}) => {
  const mode = resolveMode(options.mode);
  const { candidates, problems } = buildCandidates(mode);
  const log = options.silent ? () => {} : console.log;
  const warn = options.silent ? () => {} : console.warn;

  attachListeners();
  problems.forEach((p) => warn(`[db] ignoring ${p}`));

  if (!candidates.length) {
    const why = problems.length ? `\n  - ${problems.join('\n  - ')}` : '';
    throw new Error(
      `No usable MongoDB connection string for DB_MODE="${mode}". ` +
        `Set MONGODB_ATLAS_URI and/or MONGODB_LOCAL_URI in server/.env.${why}`
    );
  }

  const usable = allowFallback() ? candidates : candidates.slice(0, 1);
  const failures = [];

  for (let i = 0; i < usable.length; i += 1) {
    const c = usable[i];
    log(`[db] (${mode}) trying ${c.label} -> ${c.kind} ${maskUri(c.uri)}`);
    c.notes.forEach((n) => log(`[db]   note: ${n}`));
    try {
      const conn = await attemptConnect(c);
      currentSource = { label: c.label, kind: c.kind, host: conn.connection.host, name: conn.connection.name, mode };
      log(`[db] connected to ${c.kind.toUpperCase()} MongoDB "${conn.connection.name}" on ${conn.connection.host}`);
      if (i > 0) {
        warn(
          `[db] WARNING: preferred database was unavailable, so this run is using ${c.kind.toUpperCase()} MongoDB. ` +
            'Data here is NOT the same as in your other database.'
        );
      }
      return { conn, source: currentSource };
    } catch (err) {
      const hint = explainError(err, c);
      failures.push({ label: c.label, kind: c.kind, message: scrub(err.message), hint });
      warn(`[db] ${c.label} failed: ${scrub(err.message)}`);
      if (hint) warn(`[db]   -> ${hint}`);
      await mongoose.disconnect().catch(() => {});
    }
  }

  const summary = failures
    .map((f) => `${f.label} (${f.kind}): ${f.message}${f.hint ? `\n      hint: ${f.hint}` : ''}`)
    .join('\n  - ');
  const error = new Error(`Could not connect to any MongoDB database.\n  - ${summary}`);
  error.failures = failures;
  error.isDbConnectError = true;
  throw error;
};

const disconnectDB = async () => {
  currentSource = null; // silences the "disconnected" warning for an intentional shutdown
  await mongoose.disconnect();
};

const getDbInfo = () => ({
  state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
  source: currentSource,
});

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
module.exports.getDbInfo = getDbInfo;
module.exports.normalizeMongoUri = normalizeMongoUri;
module.exports.maskUri = maskUri;
module.exports.describeUri = describeUri;
module.exports.buildCandidates = buildCandidates;
module.exports.resolveMode = resolveMode;
module.exports.explainError = explainError;
