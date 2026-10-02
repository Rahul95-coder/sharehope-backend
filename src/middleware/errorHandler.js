const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  const isProd = process.env.NODE_ENV === 'production';

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
    statusCode = 409;
  }

  // Mongoose validation
  if (err.name === 'ValidationError' && err.errors) {
    message = Object.values(err.errors).map((e) => e.message).join(', ');
    statusCode = 400;
  }

  // Mongoose bad ObjectId / type
  if (err.name === 'CastError') {
    message = `Invalid ${err.path}.`;
    statusCode = 400;
  }

  // JWT
  if (err.name === 'JsonWebTokenError') {
    message = 'Invalid token';
    statusCode = 401;
  }
  if (err.name === 'TokenExpiredError') {
    message = 'Token expired';
    statusCode = 401;
  }

  // Upload errors (multer)
  if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round((parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760) / 1048576);
      message = `File is too large (max ${mb} MB).`;
    } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Too many files or an unexpected file field.';
    }
  }

  // Malformed / oversized JSON body
  if (err.type === 'entity.parse.failed') {
    message = 'Request body is not valid JSON.';
    statusCode = 400;
  }
  if (err.type === 'entity.too.large') {
    message = 'Request body is too large.';
    statusCode = 413;
  }

  // Never leak internals for unexpected (5xx) errors in production.
  if (statusCode >= 500 && isProd && !err.isOperational) {
    message = 'Internal Server Error';
  }

  // Log every server error (previously nothing was logged in production).
  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} ->`, err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(!isProd && statusCode >= 500 && { stack: err.stack }),
  });
};

module.exports = errorHandler;
