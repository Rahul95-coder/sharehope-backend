const { validationResult } = require('express-validator');
const { cleanupUploadedFiles } = require('../config/cloudinary');

/** Returns 400 with a field-level error list; removes any files already uploaded for this request. */
const validate = async (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  await cleanupUploadedFiles(req);
  const list = errors.array().map((e) => ({ field: e.path, message: e.msg }));
  return res.status(400).json({
    success: false,
    // First message is surfaced so the UI toast is actually helpful.
    message: list[0] ? list[0].message : 'Validation failed',
    errors: list,
  });
};

module.exports = validate;
