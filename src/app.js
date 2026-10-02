// Make sure server/.env is loaded (by absolute path) before anything reads process.env.
require('./config/env').loadEnv();
require('express-async-errors');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { sanitizeRequest } = require('./middleware/sanitize');
const { getDbInfo } = require('./config/db');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Behind Render/Netlify/NGINX the real client IP is in X-Forwarded-For. Without this every user
// shares one IP for rate limiting. TRUST_PROXY=0 disables it.
const trustProxy = process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : isProd ? 1 : 0;
if (trustProxy) app.set('trust proxy', trustProxy);
app.disable('x-powered-by');

// Security headers (images must be embeddable from the separately hosted frontend)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ---- CORS: exact-match allow-list --------------------------------------------------------
// Previously any origin containing the text "localhost" or ending in ".netlify.app" was accepted,
// so https://evil-localhost.com or anyone's *.netlify.app site could call the API.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const isOriginAllowed = (origin) => {
  if (!origin) return true; // curl, server-to-server, same-origin
  const clean = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(clean)) return true;
  let url;
  try {
    url = new URL(clean);
  } catch (_) {
    return false;
  }
  if (!isProd && LOCAL_HOSTS.has(url.hostname)) return true; // any local dev port
  if (process.env.ALLOW_NETLIFY_PREVIEWS === 'true' && url.protocol === 'https:' && url.hostname.endsWith('.netlify.app')) return true;
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: false, // auth uses a Bearer token, not cookies
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing (multipart bodies are handled per-route by multer)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitizeRequest);
app.use(compression());

if (process.env.NODE_ENV !== 'test') app.use(morgan(isProd ? 'combined' : 'dev'));

// ---- Static uploads: public images only ----------------------------------------------------
// /uploads/documents is deliberately NOT served - verification documents (registration
// certificates etc.) are private and go through an authenticated route instead.
const uploadsRoot = path.join(__dirname, '../uploads');
const staticOptions = {
  index: false,
  dotfiles: 'deny',
  maxAge: '7d',
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
};
app.use('/uploads/images', express.static(path.join(uploadsRoot, 'images'), staticOptions));
app.use('/uploads/avatars', express.static(path.join(uploadsRoot, 'avatars'), staticOptions));

// Rate limiting
app.use('/api', apiLimiter);

// Health check (used by Render). Returns 503 if the database is down.
app.get('/health', (req, res) => {
  const db = getDbInfo();
  const ok = db.state === 'connected';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    database: db.state,
    ...(!isProd && db.source ? { databaseSource: `${db.source.kind}:${db.source.name}` } : {}),
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/donations', require('./routes/donations'));
app.use('/api/claims', require('./routes/claims'));
app.use('/api/volunteers', require('./routes/volunteers'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/impact', require('./routes/impact'));
app.use('/api/admin', require('./routes/admin'));

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

app.use(errorHandler);

module.exports = app;
