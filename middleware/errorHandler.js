/* ============================================================
   middleware/errorHandler.js — Global Error Handler
   ============================================================ */

const errorHandler = (err, req, res, next) => {
  // Postgres unique violation (23505) → 409
  if (err.code === '23505') {
    const field = err.detail?.match(/\(([^)]+)\)/)?.[1] ?? 'field';
    return res.status(409).json({ error: `${field} already exists` });
  }

  // Postgres foreign key violation (23503) → 400
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found' });
  }

  // Postgres not-null violation (23502) → 400
  if (err.code === '23502') {
    const col = err.column ?? 'field';
    return res.status(400).json({ error: `${col} is required` });
  }

  // JWT errors (shouldn't reach here if auth middleware is correct)
  if (err.name === 'JsonWebTokenError')  return res.status(401).json({ error: 'Invalid token' });
  if (err.name === 'TokenExpiredError')  return res.status(401).json({ error: 'Token expired' });

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(422).json({ error: 'Validation failed', details: err.details });
  }

  // Known operational errors
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Unknown — log and return 500
  console.error('[ERROR]', {
    message: err.message,
    stack  : process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path   : req.path,
    method : req.method,
  });

  res.status(500).json({
    error  : 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { detail: err.message }),
  });
};

/**
 * Wrap async route handlers to forward errors to errorHandler.
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Create an operational error with a status code.
 */
const createError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

module.exports = errorHandler;
module.exports.asyncHandler = asyncHandler;
module.exports.createError  = createError;
