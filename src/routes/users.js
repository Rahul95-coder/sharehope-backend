const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { protect, protectAllowQueryToken, authorize } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const { uploadDocuments, verifyUploadedFiles, getFileUrl, getFileKey, cleanupUploadedFiles, resolveLocalPath } = require('../config/cloudinary');

const MAX_DOCUMENTS = 10;

// Upload verification documents (donors / NGOs)
router.post(
  '/documents',
  protect,
  authorize('DONOR', 'NGO', 'VOLUNTEER'),
  uploadDocuments.array('documents', 5),
  verifyUploadedFiles,
  async (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) throw new AppError('Please attach at least one document.', 400);

      const user = await User.findById(req.user._id);
      if (user.verificationDocuments.length + files.length > MAX_DOCUMENTS) {
        throw new AppError(`You can upload at most ${MAX_DOCUMENTS} documents.`, 400);
      }
      user.verificationDocuments.push(
        ...files.map((f) => ({
          name: String(f.originalname || 'Document').slice(0, 120),
          url: getFileUrl(f),
          publicId: getFileKey(f),
        }))
      );
      await user.save();
      res.status(200).json({ success: true, data: { documents: user.verificationDocuments } });
    } catch (err) {
      await cleanupUploadedFiles(req);
      throw err;
    }
  }
);

// Verification documents are private: only the owner or an admin may open them.
// (They are intentionally NOT served by the public /uploads static route.)
router.get('/documents/file/:filename', protectAllowQueryToken, async (req, res) => {
  const filename = path.basename(req.params.filename);
  const webPath = `/uploads/documents/${filename}`;

  if (req.user.role !== 'ADMIN') {
    const owner = await User.exists({ _id: req.user._id, 'verificationDocuments.url': webPath });
    if (!owner) throw new AppError('Document not found.', 404);
  }
  const diskPath = resolveLocalPath(webPath);
  if (!diskPath || !fs.existsSync(diskPath)) throw new AppError('Document not found.', 404);

  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(diskPath);
});

// Verified donors list (public) - names/locations only
router.get('/donors', async (req, res) => {
  const donors = await User.find({ role: 'DONOR', status: 'VERIFIED', isDeleted: false })
    .select('name donorType address.city address.state')
    .limit(50);
  res.status(200).json({ success: true, data: { donors } });
});

// Verified NGOs list (public)
router.get('/ngos', async (req, res) => {
  const ngos = await User.find({ role: 'NGO', status: 'VERIFIED', isDeleted: false })
    .select('name mission address.city address.state')
    .limit(50);
  res.status(200).json({ success: true, data: { ngos } });
});

module.exports = router;
