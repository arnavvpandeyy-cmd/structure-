/* ============================================================
   config/socket.js — Socket.IO Event Handlers
   Real-time queue updates pushed to patient dashboards.
   ============================================================ */

/**
 * Rooms:
 *   dept:{deptId}       — all clients watching a department queue
 *   patient:{patientId} — specific patient (token notifications)
 *   admin:{hospitalId}  — admin dashboard live metrics
 *   doctor:{doctorId}   — doctor's own queue state
 */

const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // ── Join a department queue room ──────────────────────────
    socket.on('join:dept', ({ deptId }) => {
      if (!deptId) return;
      socket.join(`dept:${deptId}`);
      console.log(`[Socket] ${socket.id} joined dept:${deptId}`);
    });

    // ── Leave a department queue room ─────────────────────────
    socket.on('leave:dept', ({ deptId }) => {
      socket.leave(`dept:${deptId}`);
    });

    // ── Join patient personal room ────────────────────────────
    socket.on('join:patient', ({ patientId }) => {
      if (!patientId) return;
      socket.join(`patient:${patientId}`);
    });

    // ── Join admin hospital room ──────────────────────────────
    socket.on('join:admin', ({ hospitalId }) => {
      if (!hospitalId) return;
      socket.join(`admin:${hospitalId}`);
    });

    // ── Join doctor room ──────────────────────────────────────
    socket.on('join:doctor', ({ doctorId }) => {
      if (!doctorId) return;
      socket.join(`doctor:${doctorId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
};

/**
 * Emit queue update to everyone watching a department.
 * Called from doctorController when a token is called.
 */
const emitQueueUpdate = (io, deptId, payload) => {
  io.to(`dept:${deptId}`).emit('queue:updated', payload);
};

/**
 * Emit a notification to a specific patient.
 * Called when: lab report ready, token about to be called.
 */
const emitPatientNotification = (io, patientId, payload) => {
  io.to(`patient:${patientId}`).emit('patient:notification', payload);
};

/**
 * Emit live metrics update to admin dashboard.
 */
const emitAdminMetrics = (io, hospitalId, payload) => {
  io.to(`admin:${hospitalId}`).emit('admin:metrics', payload);
};

/**
 * Emit a new alert to a doctor's room.
 */
const emitDoctorAlert = (io, doctorId, payload) => {
  io.to(`doctor:${doctorId}`).emit('doctor:alert', payload);
};

module.exports = { initSocket, emitQueueUpdate, emitPatientNotification, emitAdminMetrics, emitDoctorAlert };
