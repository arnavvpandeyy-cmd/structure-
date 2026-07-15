/* ============================================================
   controllers/authController.js — Auth Business Logic
   ============================================================ */

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { validationResult } = require('express-validator');
const { query, transaction } = require('../config/db');
const { asyncHandler, createError } = require('../middleware/errorHandler');

// ── Helpers ────────────────────────────────────────────────────
const generateAccessToken = (user) =>
  jwt.sign(
    { userId: user.id, role: user.role, hospitalId: user.hospital_id },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );

const generateRefreshToken = (user) =>
  jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// ── POST /api/auth/login ───────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Validation failed', details: errors.array() });
  }

  const { identifier, password } = req.body;

  // Find user by email or phone
  const result = await query(
    `SELECT u.*, 
            CASE u.role
              WHEN 'patient' THEN p.id
              WHEN 'doctor'  THEN d.id
              ELSE NULL
            END AS profile_id,
            CASE u.role
              WHEN 'patient' THEN p.name
              WHEN 'doctor'  THEN d.name
              ELSE 'Administrator'
            END AS display_name
     FROM users u
     LEFT JOIN patients p ON p.user_id = u.id
     LEFT JOIN doctors  d ON d.user_id = u.id
     WHERE (u.email = $1 OR u.phone = $1) AND u.is_active = TRUE`,
    [identifier.trim()]
  );

  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate tokens
  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store refresh token hash in DB
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, hashToken(refreshToken), expiresAt]
  );

  // Update last login
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  res.json({
    accessToken,
    refreshToken,
    user: {
      id         : user.id,
      profileId  : user.profile_id,
      displayName: user.display_name,
      role       : user.role,
      hospitalId : user.hospital_id,
    },
  });
});

// ── POST /api/auth/refresh ─────────────────────────────────────
const refresh = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Refresh token required' });

  const { refreshToken } = req.body;

  // Verify the refresh token
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  // Check it exists and isn't revoked
  const stored = await query(
    `SELECT rt.*, u.role, u.hospital_id, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.user_id = $1
       AND rt.token_hash = $2
       AND rt.revoked = FALSE
       AND rt.expires_at > NOW()`,
    [decoded.userId, hashToken(refreshToken)]
  );

  if (!stored.rows[0] || !stored.rows[0].is_active) {
    return res.status(401).json({ error: 'Refresh token revoked or expired' });
  }

  const user = stored.rows[0];
  const newAccessToken = generateAccessToken({ id: decoded.userId, role: user.role, hospital_id: user.hospital_id });

  res.json({ accessToken: newAccessToken });
});

// ── POST /api/auth/logout ──────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  // Revoke all refresh tokens for this user
  await query(
    'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE',
    [req.user.userId]
  );
  res.json({ message: 'Logged out successfully' });
});

// ── POST /api/auth/change-password ────────────────────────────
const changePassword = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Validation failed', details: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;
  const { userId } = req.user;

  const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const user   = result.rows[0];

  if (!user) throw createError('User not found', 404);

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

  const newHash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);

  // Revoke all refresh tokens (force re-login everywhere)
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [userId]);

  res.json({ message: 'Password changed successfully. Please log in again.' });
});

module.exports = { login, refresh, logout, changePassword };
