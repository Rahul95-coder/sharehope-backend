/**
 * Small helpers for safely reading query-string input.
 *
 * Express (qs) turns `?status[$ne]=x` into an object. Passing that into a
 * Mongo filter is a NoSQL-injection vector, and passing raw text into $regex
 * lets a user craft catastrophic-backtracking patterns (ReDoS).
 */

/** Returns the value only if it is a plain, trimmed, non-empty string. */
const str = (value, maxLength = 100) => {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v) return undefined;
  return v.slice(0, maxLength);
};

/** Escapes RegExp metacharacters so user text is matched literally. */
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns the value if it is one of the allowed values, otherwise undefined. */
const oneOf = (value, allowed) => (typeof value === 'string' && allowed.includes(value) ? value : undefined);

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

/** Safe pagination: page >= 1, 1 <= limit <= maxLimit. */
const parsePagination = (query, { defaultLimit = 10, maxLimit = 50 } = {}) => {
  const page = Math.max(1, toInt(query.page, 1));
  const limit = Math.min(maxLimit, Math.max(1, toInt(query.limit, defaultLimit)));
  return { page, limit, skip: (page - 1) * limit };
};

const buildPagination = (total, page, limit) => ({
  total,
  page,
  limit,
  pages: Math.ceil(total / limit),
});

module.exports = { str, escapeRegex, oneOf, toInt, parsePagination, buildPagination };
