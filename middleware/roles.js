/* ============================================================
   middleware/roles.js — Role-Based Access Control
   ============================================================ */

/**
 * requireRole(...roles)
 * Middleware factory. Must be used AFTER verifyToken.
 *
 * Usage:
 *   router.get('/dashboard', verifyToken, requireRole('patient'), handler)
 *   router.post('/queue/:id/call', verifyToken, requireRole('doctor'), handler)
 *   router.get('/overview', verifyToken, requireRole('admin'), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: `Access denied. Required role: ${roles.join(' or ')}`,
    });
  }
  next();
};

module.exports = requireRole;
