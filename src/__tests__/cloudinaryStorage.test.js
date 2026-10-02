// The custom Cloudinary multer engine, tested against a mocked SDK (no network).
const { PassThrough } = require('stream');

const load = () => {
  let mod;
  process.env.CLOUDINARY_CLOUD_NAME = 'demo';
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';
  jest.isolateModules(() => { mod = require('../config/cloudinary'); });
  return mod;
};
afterAll(() => { ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].forEach((k) => delete process.env[k]); });

test('cloud mode is enabled when the three variables are set; URL helpers use Cloudinary values', () => {
  const m = load();
  expect(m.useCloudinary).toBe(true);
  expect(m.getFileUrl({ path: 'https://res.cloudinary.com/demo/image/upload/a.png' })).toBe('https://res.cloudinary.com/demo/image/upload/a.png');
  expect(m.getFileKey({ filename: 'sharehope/images/abc' })).toBe('sharehope/images/abc');
});

test('storage engine streams the file to upload_stream and maps the result for multer', async () => {
  const m = load();
  const uploaded = [];
  m.cloudinary.uploader.upload_stream = (opts, cb) => {
    const sink = new PassThrough();
    sink.on('data', (c) => uploaded.push(c));
    sink.on('end', () => cb(null, { secure_url: 'https://cdn/x.png', public_id: 'sharehope/images/x', bytes: 5 }));
    return sink;
  };
  const destroyed = [];
  m.cloudinary.uploader.destroy = (id, cb) => { destroyed.push(id); cb(); };

  const storage = m.uploadImages.storage;
  const stream = new PassThrough();
  const info = await new Promise((resolve, reject) => {
    storage._handleFile({}, { stream, mimetype: 'image/png' }, (err, i) => (err ? reject(err) : resolve(i)));
    stream.end(Buffer.from('hello'));
  });
  expect(info).toEqual({ path: 'https://cdn/x.png', filename: 'sharehope/images/x', size: 5 });
  expect(Buffer.concat(uploaded).toString()).toBe('hello');

  await new Promise((r) => storage._removeFile({}, { filename: 'sharehope/images/x' }, r));
  expect(destroyed).toEqual(['sharehope/images/x']);
});

test('upload errors are passed to multer instead of crashing', async () => {
  const m = load();
  m.cloudinary.uploader.upload_stream = (opts, cb) => { const s = new PassThrough(); s.on('end', () => cb(new Error('cloud down'))); s.resume(); return s; };
  const stream = new PassThrough();
  const err = await new Promise((resolve) => {
    m.uploadImages.storage._handleFile({}, { stream }, (e) => resolve(e));
    stream.end('x');
  });
  expect(err.message).toBe('cloud down');
});
