/**
 * File upload handling (local disk by default, Cloudinary when configured).
 *
 * Security notes:
 *  - The stored file extension comes from the *validated MIME type*, never from
 *    the client-supplied filename (a ".html" file labelled image/png used to be
 *    served back as HTML from /uploads = stored XSS).
 *  - For local storage the first bytes of every file are checked against the
 *    expected "magic number" (a spoofed Content-Type is not enough).
 *  - Images and documents use separate allow-lists.
 *  - Only the URL/key is stored in the DB - never an absolute disk path.
 */
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AppError = require('../utils/AppError');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
const SUBDIRS = ['images', 'documents', 'avatars'];

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const DOC_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const useCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

if (useCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
  SUBDIRS.forEach((dir) => fs.mkdirSync(path.join(UPLOAD_ROOT, dir), { recursive: true }));
}

const maxFileSize = () => parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Storage engines
// ---------------------------------------------------------------------------

const makeDiskStorage = (subdir) =>
  multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, subdir)),
    filename: (req, file, cb) => {
      const ext = MIME_EXT[file.mimetype] || '';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });

/** Minimal multer storage engine that streams to Cloudinary (SDK v2). */
class CloudinaryStorage {
  constructor(folder) {
    this.folder = folder;
  }

  _handleFile(req, file, cb) {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `sharehope/${this.folder}`,
        resource_type: 'auto',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      },
      (err, result) => {
        if (err) return cb(err);
        return cb(null, {
          path: result.secure_url,
          filename: result.public_id,
          size: result.bytes,
        });
      }
    );
    file.stream.on('error', cb);
    file.stream.pipe(stream);
  }

  _removeFile(req, file, cb) {
    cloudinary.uploader.destroy(file.filename, () => cb(null));
  }
}

const makeFilter = (allowed) => (req, file, cb) => {
  if (allowed.includes(file.mimetype)) return cb(null, true);
  return cb(new AppError(`File type "${file.mimetype}" is not allowed. Allowed: ${allowed.join(', ')}`, 400));
};

const makeUploader = (subdir, allowed, maxFiles) =>
  multer({
    storage: useCloudinary ? new CloudinaryStorage(subdir) : makeDiskStorage(subdir),
    fileFilter: makeFilter(allowed),
    limits: { fileSize: maxFileSize(), files: maxFiles },
  });

const uploadImages = makeUploader('images', IMAGE_MIMES, 8);
const uploadDocuments = makeUploader('documents', DOC_MIMES, 5);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Public URL (Cloudinary) or web path (local) - safe to store in the DB. */
const getFileUrl = (file) => {
  if (!file) return null;
  if (useCloudinary) return file.path;
  const sub = path.basename(file.destination || 'images');
  return `/uploads/${sub}/${file.filename}`;
};

/** Cloudinary public_id, or the local filename. */
const getFileKey = (file) => (file ? file.filename || '' : '');

const listFiles = (req) => {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return req.file ? [req.file] : [];
};

const MAGIC = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP',
  'application/pdf': (b) => b.slice(0, 4).toString() === '%PDF',
};

const readHead = async (filePath, length = 12) => {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(length);
    await handle.read(buf, 0, length, 0);
    return buf;
  } finally {
    await handle.close();
  }
};

const unlinkQuiet = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (_) {
    /* already gone */
  }
};

/** Deletes files that multer already wrote (used when a request fails later). */
const cleanupUploadedFiles = async (req) => {
  const files = listFiles(req);
  if (!files.length) return;
  if (useCloudinary) {
    await Promise.all(files.map((f) => cloudinary.uploader.destroy(f.filename).catch(() => {})));
    return;
  }
  await Promise.all(files.map((f) => f.path && unlinkQuiet(f.path)));
};

/** Express middleware: rejects files whose real content does not match their declared type. */
const verifyUploadedFiles = async (req, res, next) => {
  if (useCloudinary) return next();
  const files = listFiles(req);
  for (const f of files) {
    const check = MAGIC[f.mimetype];
    let ok = false;
    try {
      ok = check ? check(await readHead(f.path)) : false;
    } catch (_) {
      ok = false;
    }
    if (!ok) {
      await cleanupUploadedFiles(req);
      return next(new AppError(`"${f.originalname}" is not a valid ${f.mimetype} file.`, 400));
    }
  }
  return next();
};

/** Resolves a stored "/uploads/..." web path to a disk path, refusing path traversal. */
const resolveLocalPath = (webPath) => {
  if (typeof webPath !== 'string' || !webPath.startsWith('/uploads/')) return null;
  const full = path.resolve(UPLOAD_ROOT, webPath.replace(/^\/uploads\//, ''));
  return full.startsWith(UPLOAD_ROOT + path.sep) ? full : null;
};

/** Deletes a previously stored file by its DB record ({ url, publicId }). */
const deleteStoredFile = async ({ url, publicId } = {}) => {
  const local = resolveLocalPath(url);
  if (local) return unlinkQuiet(local);
  if (useCloudinary && publicId) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (e) {
      console.error('[uploads] Cloudinary delete error:', e.message);
    }
  }
  return undefined;
};

module.exports = {
  // `upload` kept for backwards compatibility: accepts images + documents.
  upload: makeUploader('images', DOC_MIMES.concat(IMAGE_MIMES.filter((m) => !DOC_MIMES.includes(m))), 8),
  uploadImages,
  uploadDocuments,
  verifyUploadedFiles,
  cleanupUploadedFiles,
  getFileUrl,
  getFileKey,
  deleteStoredFile,
  resolveLocalPath,
  useCloudinary,
  cloudinary,
  UPLOAD_ROOT,
};
