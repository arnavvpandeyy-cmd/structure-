/* ============================================================
   utils/pagination.js — Cursor / Offset Pagination Helper
   ============================================================ */

/**
 * Build LIMIT + OFFSET SQL clauses from query params.
 * @param {object} query - req.query
 * @param {number} defaultLimit
 * @param {number} maxLimit
 */
const paginate = (query, defaultLimit = 20, maxLimit = 100) => {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * Wrap a result set with pagination metadata.
 * @param {Array}  rows   - Result rows
 * @param {number} total  - Total matching rows (from COUNT(*))
 * @param {number} page
 * @param {number} limit
 */
const paginatedResponse = (rows, total, page, limit) => ({
  data: rows,
  meta: {
    total,
    page,
    limit,
    totalPages : Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  },
});

/**
 * Add common sort validation.
 * @param {string} sortBy     - Requested sort field from query
 * @param {string[]} allowed  - Allowed sort fields
 * @param {string} defaultSort
 */
const safeSort = (sortBy, allowed, defaultSort = 'created_at') => {
  return allowed.includes(sortBy) ? sortBy : defaultSort;
};

module.exports = { paginate, paginatedResponse, safeSort };
