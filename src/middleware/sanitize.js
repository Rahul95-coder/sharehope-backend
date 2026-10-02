/**
 * Strips NoSQL-injection and prototype-pollution vectors from user input.
 *
 * Removes any key that starts with "$" (Mongo operators), contains "." (path
 * traversal into documents) or is a prototype key. Applied to body, query and
 * params. Multipart bodies are parsed later by multer, so upload routes also
 * call `sanitizeBody` after the upload middleware.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const clean = (value, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 10) return value;
  if (Array.isArray(value)) {
    value.forEach((v) => clean(v, depth + 1));
    return value;
  }
  Object.keys(value).forEach((key) => {
    if (key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) {
      delete value[key];
    } else {
      clean(value[key], depth + 1);
    }
  });
  return value;
};

const sanitizeBody = (req, res, next) => {
  if (req.body) clean(req.body);
  next();
};

const sanitizeRequest = (req, res, next) => {
  if (req.body) clean(req.body);
  if (req.query) clean(req.query);
  if (req.params) clean(req.params);
  next();
};

module.exports = { sanitizeRequest, sanitizeBody, clean };
