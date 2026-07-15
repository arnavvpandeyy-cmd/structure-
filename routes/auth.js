/* ─── routes/auth.js ─────────────────────────────────────────── */
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

// In-memory demo users (replaces DB for quick local setup)
// Password: Test@1234  (bcrypt hash generated fresh on this machine)
const DEMO_USERS = [
  {
    id: 1, phone: '9876543210', email: 'patient@demo.com',
    password_hash: '$2a$10$oSlERk2VK0389cJ.WWjaeea.VkMBdFzk19P.byESLXlBvsguK2jOu',
    name: 'Ramesh Subramaniam', role: 'patient', profile_id: 1, blood_group: 'B+'
  },
  {
    id: 2, phone: '9876543211', email: 'doctor@demo.com',
    password_hash: '$2a$10$oSlERk2VK0389cJ.WWjaeea.VkMBdFzk19P.byESLXlBvsguK2jOu',
    name: 'Dr. Priya Menon', role: 'doctor', profile_id: 1, dept: 'General Medicine'
  },
  {
    id: 3, phone: '9876543212', email: 'admin@demo.com',
    password_hash: '$2a$10$oSlERk2VK0389cJ.WWjaeea.VkMBdFzk19P.byESLXlBvsguK2jOu',
    name: 'Dr. M. Sawant', role: 'admin', profile_id: 1, hospital_id: 1
  }
];

// Store refresh tokens in memory (for demo — use Redis/DB in production)
const refreshTokens = new Set();

function generateTokens(user) {
  const payload = {
    id: user.id, role: user.role, name: user.name,
    profileId: user.profile_id, hospitalId: user.hospital_id
  };
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET  || 'dev_secret',         { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'dev_refresh',  { expiresIn: '7d'  });
  refreshTokens.add(refreshToken);
  return { accessToken, refreshToken };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: 'Phone/email and password required' });

    const user = DEMO_USERS.find(u =>
      u.phone === identifier || u.email === identifier
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const { accessToken, refreshToken } = generateTokens(user);
    res.json({
      accessToken, refreshToken,
      user: { id: user.id, name: user.name, role: user.role,
              phone: user.phone, profileId: user.profile_id }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !refreshTokens.has(refreshToken))
    return res.status(401).json({ error: 'Invalid refresh token' });
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'dev_refresh');
    const accessToken = jwt.sign(
      { id: decoded.id, role: decoded.role, name: decoded.name, profileId: decoded.profileId },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '15m' }
    );
    res.json({ accessToken });
  } catch {
    refreshTokens.delete(refreshToken);
    res.status(401).json({ error: 'Refresh token expired' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) refreshTokens.delete(refreshToken);
  res.json({ message: 'Logged out' });
});

module.exports = router;
