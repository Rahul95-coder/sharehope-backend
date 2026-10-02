/**
 * Environment loading + validation.
 *
 * Why this file exists:
 *  - `dotenv.config()` with no path reads `.env` from the *current working
 *    directory*. Starting the server from the repo root (or from an IDE run
 *    configuration) silently skipped the file, leaving JWT_SECRET undefined and
 *    the DB URI pointing at defaults. We now always resolve `server/.env`
 *    relative to this file, so it works from any folder.
 *  - Secrets are validated once, at boot, with clear messages.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const ENV_PATH = path.join(__dirname, '../../.env');
let loaded = false;

const WEAK_SECRET_HINTS = [
  'change_in_production',
  'your_super_secret',
  'changeme',
  'secret_key',
  'sharehope_super',
];

const loadEnv = () => {
  if (loaded) return { path: ENV_PATH, found: fs.existsSync(ENV_PATH) };
  loaded = true;
  const found = fs.existsSync(ENV_PATH);
  // Never override variables already set by the shell / hosting platform.
  if (found) dotenv.config({ path: ENV_PATH });
  else dotenv.config();
  return { path: ENV_PATH, found };
};

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Validates configuration. Returns { warnings, errors }.
 * In production, errors are fatal (thrown by assertEnv).
 */
const validateEnv = () => {
  const warnings = [];
  const errors = [];

  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

  // ---- JWT secret -------------------------------------------------------
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (isProduction() || process.env.NODE_ENV === 'test') {
      if (process.env.NODE_ENV === 'test') {
        process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
      } else {
        errors.push('JWT_SECRET is not set.');
      }
    } else {
      process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
      warnings.push(
        'JWT_SECRET is not set - generated a temporary one. All logins will be invalidated on every restart. ' +
          'Set a permanent value in server/.env (see .env.example).'
      );
    }
  } else {
    const weak = secret.length < 32 || WEAK_SECRET_HINTS.some((h) => secret.toLowerCase().includes(h));
    if (weak) {
      const msg =
        'JWT_SECRET is short or looks like a placeholder. Generate a strong one with: ' +
        "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"";
      if (isProduction()) errors.push(msg);
      else warnings.push(msg);
    }
  }

  // ---- Database configuration ------------------------------------------
  const hasAnyDb =
    process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI || process.env.MONGODB_LOCAL_URI;
  if (!hasAnyDb) {
    if (isProduction()) errors.push('No database URI set. Provide MONGODB_URI (or MONGODB_ATLAS_URI).');
    else warnings.push('No MongoDB URI set - defaulting to mongodb://127.0.0.1:27017/sharehope (local).');
  }

  // ---- CORS / client URL -----------------------------------------------
  if (isProduction() && !process.env.CLIENT_URL) {
    errors.push('CLIENT_URL is not set. Set it to your deployed frontend origin (e.g. https://your-app.netlify.app).');
  }

  // ---- Port -------------------------------------------------------------
  if (process.env.PORT && Number.isNaN(parseInt(process.env.PORT, 10))) {
    errors.push(`PORT must be a number (got "${process.env.PORT}").`);
  }

  return { warnings, errors };
};

const assertEnv = () => {
  const result = validateEnv();
  if (result.errors.length && isProduction()) {
    const err = new Error(`Invalid environment configuration:\n - ${result.errors.join('\n - ')}`);
    err.isConfigError = true;
    throw err;
  }
  // Outside production, treat errors as warnings so the dev server can still start.
  if (!isProduction()) result.warnings.push(...result.errors.splice(0));
  return result;
};

module.exports = { loadEnv, validateEnv, assertEnv, ENV_PATH };
