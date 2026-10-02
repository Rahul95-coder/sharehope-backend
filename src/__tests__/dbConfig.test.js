// Pure unit tests (no database needed): URI normalisation and database selection.
const { normalizeMongoUri, buildCandidates, describeUri, maskUri } = require('../config/db');

const ENV_KEYS = ['MONGODB_URI', 'MONGODB_ATLAS_URI', 'MONGODB_LOCAL_URI', 'NODE_ENV', 'MONGODB_DB_NAME'];
let saved;
beforeEach(() => { saved = {}; ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }); });
afterEach(() => { ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

describe('normalizeMongoUri', () => {
  test('encodes a password that contains "@" (the original startup crash)', () => {
    const { uri } = normalizeMongoUri('mongodb+srv://user:Pa@ss1234@cluster0.abcde.mongodb.net');
    expect(uri).toBe('mongodb+srv://user:Pa%40ss1234@cluster0.abcde.mongodb.net/sharehope');
  });
  test('encodes all reserved characters', () => {
    const { uri } = normalizeMongoUri('mongodb+srv://u:a@b:c/d?e#f@h.mongodb.net/db');
    expect(uri).toContain('u:a%40b%3Ac%2Fd%3Fe%23f@h.mongodb.net/db');
  });
  test('does not double-encode an already encoded password', () => {
    expect(normalizeMongoUri('mongodb+srv://u:Pa%40ss@h.mongodb.net/db').uri).toBe('mongodb+srv://u:Pa%40ss@h.mongodb.net/db');
  });
  test('adds the database name when missing, keeps query options', () => {
    expect(normalizeMongoUri('mongodb+srv://u:p@h.mongodb.net/?retryWrites=true').uri)
      .toBe('mongodb+srv://u:p@h.mongodb.net/sharehope?retryWrites=true');
  });
  test('uses 127.0.0.1 instead of localhost', () => {
    expect(normalizeMongoUri('mongodb://localhost:27017/x').uri).toBe('mongodb://127.0.0.1:27017/x');
  });
  test('strips wrapping quotes', () => {
    expect(normalizeMongoUri('"mongodb://127.0.0.1:27017/x"').uri).toBe('mongodb://127.0.0.1:27017/x');
  });
  test('rejects placeholders, empty and non-mongo strings', () => {
    expect(() => normalizeMongoUri('mongodb+srv://<username>:<password>@c.mongodb.net')).toThrow(/placeholder/);
    expect(() => normalizeMongoUri('')).toThrow();
    expect(() => normalizeMongoUri('http://x')).toThrow(/mongodb/);
  });
  test('mask hides credentials, describe classifies', () => {
    expect(maskUri('mongodb+srv://u:secret@h.mongodb.net/db')).not.toMatch(/secret/);
    expect(describeUri('mongodb+srv://u:p@h.mongodb.net/db').kind).toBe('atlas');
    expect(describeUri('mongodb://127.0.0.1:27017/db').kind).toBe('local');
  });
});

describe('database selection', () => {
  beforeEach(() => {
    process.env.MONGODB_ATLAS_URI = 'mongodb+srv://u:p%40x@c.mongodb.net/prod';
    process.env.MONGODB_LOCAL_URI = 'mongodb://localhost:27017/dev';
  });
  const kinds = (mode) => buildCandidates(mode).candidates.map((c) => c.kind);

  test('auto: Atlas first, local as fallback', () => expect(kinds('auto')).toEqual(['atlas', 'local', 'local'].slice(0, 2)));
  test('atlas mode never includes local', () => expect(kinds('atlas')).toEqual(['atlas']));
  test('local mode never includes Atlas', () => expect(kinds('local')).toEqual(['local']));
  test('local mode works with nothing configured (default local URI)', () => {
    delete process.env.MONGODB_LOCAL_URI;
    const c = buildCandidates('local').candidates;
    expect(c).toHaveLength(1);
    expect(c[0].uri).toBe('mongodb://127.0.0.1:27017/sharehope');
  });
  test('explicit MONGODB_URI (Render) takes priority in auto mode', () => {
    process.env.MONGODB_URI = 'mongodb+srv://r:p@render.mongodb.net/live';
    expect(buildCandidates('auto').candidates[0].db).toBe('live');
  });
  test('production never adds the implicit local default', () => {
    delete process.env.MONGODB_LOCAL_URI; delete process.env.MONGODB_ATLAS_URI;
    process.env.NODE_ENV = 'production';
    expect(buildCandidates('auto').candidates).toHaveLength(0);
  });
  test('a broken URI is reported but does not block the others', () => {
    process.env.MONGODB_ATLAS_URI = 'mongodb+srv://<username>:<password>@c.mongodb.net';
    const r = buildCandidates('auto');
    expect(r.problems.join()).toMatch(/placeholder/);
    expect(r.candidates.map((c) => c.kind)).toEqual(['local']);
  });
});
