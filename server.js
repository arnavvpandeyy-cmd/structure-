/* ============================================================
   CHIKITSAALYE BACKEND — server.js
   Main Express + Socket.IO server entry point
   ============================================================ */
require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// ── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..')));

// ── Routes ───────────────────────────────────────────────────
const authRoutes   = require('./routes/auth');
const publicRoutes = require('./routes/public');
const patientRoutes= require('./routes/patient');
const doctorRoutes = require('./routes/doctor');
const adminRoutes  = require('./routes/admin');

app.use('/api/auth',    authRoutes);
app.use('/api/public',  publicRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor',  doctorRoutes);
app.use('/api/admin',   adminRoutes);

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '1.0.0' });
});

// ── Catch-all: serve frontend ─────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── Socket.IO ─────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join:patient',  ({ patientId })  => { if (patientId)  socket.join(`patient:${patientId}`); });
  socket.on('join:doctor',   ({ doctorId })   => { if (doctorId)   socket.join(`doctor:${doctorId}`);  });
  socket.on('join:admin',    ({ hospitalId }) => { if (hospitalId) socket.join(`admin:${hospitalId}`); });

  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// Make io accessible in routes
app.set('io', io);

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n✅ Chikitsaalye backend running at http://localhost:${PORT}`);
  console.log(`📄 Frontend served at         http://localhost:${PORT}`);
  console.log(`🔌 API available at           http://localhost:${PORT}/api`);
  console.log(`\n📌 Demo login (if DB seeded):`);
  console.log(`   Patient  → 9876543210 / Test@1234`);
  console.log(`   Doctor   → 9876543211 / Test@1234`);
  console.log(`   Admin    → 9876543212 / Test@1234\n`);
});
