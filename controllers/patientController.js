/* ============================================================
   controllers/patientController.js — Patient Dashboard Logic
   ============================================================ */

const { query, transaction } = require('../config/db');
const { asyncHandler, createError } = require('../middleware/errorHandler');
const { validationResult } = require('express-validator');
const { sendSMS, smsTemplates } = require('../utils/sms');

// ── Helper: get patient ID for the logged-in user ─────────────
const getPatientId = async (userId) => {
  const r = await query('SELECT id, phone FROM patients WHERE user_id = $1', [userId]);
  if (!r.rows[0]) throw createError('Patient profile not found', 404);
  return r.rows[0];
};

// ── GET /api/patient/dashboard ────────────────────────────────
const getDashboard = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const patientId = patient.id;

  const [tokenRes, apptRes, tasksRes, noticesRes, reportRes] = await Promise.all([
    // Active queue token today
    query(
      `SELECT qt.token_number, qt.status, qt.dept_id,
              d.name AS doctor_name, d.room,
              dept.name AS dept_name,
              -- Patients waiting ahead
              (SELECT COUNT(*) FROM queue_tokens q2
               WHERE q2.doctor_id = qt.doctor_id
                 AND q2.session_date = CURRENT_DATE
                 AND q2.status = 'waiting'
                 AND q2.token_number < qt.token_number) AS ahead
       FROM queue_tokens qt
       JOIN doctors d    ON d.id = qt.doctor_id
       JOIN departments dept ON dept.id = qt.dept_id
       WHERE qt.patient_id = $1
         AND qt.session_date = CURRENT_DATE
         AND qt.status NOT IN ('done','absent','cancelled')
       ORDER BY qt.issued_at DESC LIMIT 1`,
      [patientId]
    ),
    // Next appointment
    query(
      `SELECT a.id, a.appt_date, a.appt_time, a.visit_type, a.status,
              d.name AS doctor_name, dept.name AS dept_name, d.room
       FROM appointments a
       JOIN doctors d     ON d.id = a.doctor_id
       JOIN departments dept ON dept.id = a.dept_id
       WHERE a.patient_id = $1 AND a.appt_date >= CURRENT_DATE
         AND a.status NOT IN ('cancelled','no-show')
       ORDER BY a.appt_date, a.appt_time LIMIT 1`,
      [patientId]
    ),
    // Pending tasks count
    query('SELECT COUNT(*) AS count FROM patient_tasks WHERE patient_id = $1 AND is_done = FALSE', [patientId]),
    // Unread notices
    query(
      `SELECT COUNT(*) AS count FROM notices n
       WHERE n.hospital_id = $1
         AND n.is_active = TRUE
         AND n.target IN ('all','patients')
         AND NOT EXISTS (
           SELECT 1 FROM notice_reads nr
           WHERE nr.notice_id = n.id AND nr.user_id = $2
         )`,
      [req.user.hospitalId, req.user.userId]
    ),
    // Lab reports ready
    query(
      `SELECT COUNT(*) AS count FROM lab_orders
       WHERE patient_id = $1 AND status = 'ready'`,
      [patientId]
    ),
  ]);

  res.json({
    patientId,
    token        : tokenRes.rows[0]  || null,
    nextAppt     : apptRes.rows[0]   || null,
    pendingTasks : parseInt(tasksRes.rows[0].count),
    unreadNotices: parseInt(noticesRes.rows[0].count),
    reportsReady : parseInt(reportRes.rows[0].count),
  });
});

// ── GET /api/patient/queue-status ─────────────────────────────
const getQueueStatus = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);

  const result = await query(
    `SELECT qt.token_number, qt.status, qt.issued_at, qt.called_at,
            d.name AS doctor_name, d.room,
            dept.name AS dept_name, dept.id AS dept_id,
            (SELECT COUNT(*) FROM queue_tokens q2
             WHERE q2.doctor_id = qt.doctor_id
               AND q2.session_date = CURRENT_DATE
               AND q2.status = 'waiting'
               AND q2.token_number < qt.token_number) AS ahead,
            lq.current_token, lq.tokens_done
     FROM queue_tokens qt
     JOIN doctors d         ON d.id = qt.doctor_id
     JOIN departments dept  ON dept.id = qt.dept_id
     LEFT JOIN v_live_queue lq ON lq.doctor_id = qt.doctor_id AND lq.session_date = CURRENT_DATE
     WHERE qt.patient_id = $1 AND qt.session_date = CURRENT_DATE
     ORDER BY qt.issued_at DESC LIMIT 1`,
    [patient.id]
  );

  if (!result.rows[0]) {
    return res.json({ message: 'No active token today', token: null });
  }

  const row = result.rows[0];
  res.json({
    token       : row.token_number,
    status      : row.status,
    doctorName  : row.doctor_name,
    room        : row.room,
    deptName    : row.dept_name,
    currentToken: row.current_token,
    ahead       : parseInt(row.ahead),
    estWaitMins : Math.max(0, parseInt(row.ahead) * 5),
    tokensDone  : row.tokens_done,
  });
});

// ── GET /api/patient/appointments ─────────────────────────────
const getAppointments = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result = await query(
    `SELECT a.id, a.appt_date, a.appt_time, a.visit_type, a.status, a.notes,
            d.name AS doctor_name, d.designation, d.room,
            dept.name AS dept_name, dept.floor_info
     FROM appointments a
     JOIN doctors d     ON d.id = a.doctor_id
     JOIN departments dept ON dept.id = a.dept_id
     WHERE a.patient_id = $1
     ORDER BY a.appt_date DESC, a.appt_time DESC`,
    [patient.id]
  );
  res.json(result.rows);
});

// ── POST /api/patient/appointments ────────────────────────────
const bookAppointment = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const patient = await getPatientId(req.user.userId);
  const { doctorId, deptId, apptDate, apptTime, visitType = 'consultation', notes } = req.body;

  const result = await query(
    `INSERT INTO appointments (patient_id, doctor_id, dept_id, hospital_id, appt_date, appt_time, visit_type, notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
     RETURNING id, appt_date, appt_time, status`,
    [patient.id, doctorId, deptId, req.user.hospitalId, apptDate, apptTime || null, visitType, notes || null]
  );

  res.status(201).json({ message: 'Appointment booked', appointment: result.rows[0] });
});

// ── DELETE /api/patient/appointments/:id ──────────────────────
const cancelAppointment = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result  = await query(
    `UPDATE appointments SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND patient_id = $2 AND status != 'completed'
     RETURNING id`,
    [req.params.id, patient.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Appointment not found or already completed' });
  res.json({ message: 'Appointment cancelled' });
});

// ── GET /api/patient/reports ──────────────────────────────────
const getReports = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result  = await query(
    `SELECT lo.id, lo.order_date, lo.status, lo.priority,
            d.name AS ordered_by,
            ARRAY_AGG(lt.test_name ORDER BY lt.id) AS test_names
     FROM lab_orders lo
     JOIN doctors d ON d.id = lo.ordered_by
     LEFT JOIN lab_tests lt ON lt.order_id = lo.id
     WHERE lo.patient_id = $1
     GROUP BY lo.id, d.name
     ORDER BY lo.order_date DESC`,
    [patient.id]
  );
  res.json(result.rows);
});

// ── GET /api/patient/reports/:id ──────────────────────────────
const getReportDetail = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const [orderRes, testsRes] = await Promise.all([
    query(
      `SELECT lo.id, lo.order_date, lo.status, lo.priority,
              d.name AS ordered_by, dept.name AS dept_name
       FROM lab_orders lo
       JOIN doctors d    ON d.id = lo.ordered_by
       JOIN departments dept ON dept.id = d.dept_id
       WHERE lo.id = $1 AND lo.patient_id = $2`,
      [req.params.id, patient.id]
    ),
    query(
      `SELECT test_name, test_code, category, result_value, result_unit, reference_range, flag, completed_at
       FROM lab_tests WHERE order_id = $1 ORDER BY id`,
      [req.params.id]
    ),
  ]);

  if (!orderRes.rows[0]) return res.status(404).json({ error: 'Report not found' });
  res.json({ ...orderRes.rows[0], tests: testsRes.rows });
});

// ── GET /api/patient/prescriptions ────────────────────────────
const getPrescriptions = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result  = await query(
    `SELECT * FROM v_active_prescriptions WHERE patient_id = $1 ORDER BY prescribed_date DESC`,
    [patient.id]
  );
  res.json(result.rows);
});

// ── GET /api/patient/tasks ────────────────────────────────────
const getTasks = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result  = await query(
    `SELECT t.id, t.title, t.due_date, t.priority, t.is_done, t.done_at, t.created_at,
            d.name AS created_by
     FROM patient_tasks t
     LEFT JOIN doctors d ON d.id = t.created_by
     WHERE t.patient_id = $1
     ORDER BY t.is_done ASC, t.priority DESC, t.due_date ASC NULLS LAST`,
    [patient.id]
  );
  res.json(result.rows);
});

// ── PUT /api/patient/tasks/:id/complete ───────────────────────
const completeTask = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result  = await query(
    `UPDATE patient_tasks SET is_done = TRUE, done_at = NOW()
     WHERE id = $1 AND patient_id = $2 AND is_done = FALSE
     RETURNING id, title`,
    [req.params.id, patient.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Task not found' });
  res.json({ message: 'Task marked complete', task: result.rows[0] });
});

// ── GET /api/patient/bills ────────────────────────────────────
const getBills = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result  = await query(
    `SELECT id, description, amount, is_paid, payment_date, pmjay_covered, waiver_amount, created_at
     FROM bills WHERE patient_id = $1 ORDER BY created_at DESC`,
    [patient.id]
  );
  const totals = result.rows.reduce(
    (acc, b) => ({
      total    : acc.total + parseFloat(b.amount),
      paid     : acc.paid + (b.is_paid ? parseFloat(b.amount) : 0),
      pending  : acc.pending + (!b.is_paid ? parseFloat(b.amount) : 0),
    }),
    { total: 0, paid: 0, pending: 0 }
  );
  res.json({ bills: result.rows, totals });
});

// ── GET /api/patient/messages ─────────────────────────────────
const getMessages = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result  = await query(
    `SELECT n.id, n.title, n.body, n.is_urgent, n.from_name, n.created_at,
            EXISTS(SELECT 1 FROM notice_reads nr
                   WHERE nr.notice_id = n.id AND nr.user_id = $2) AS is_read
     FROM notices n
     WHERE n.hospital_id = $1
       AND n.is_active = TRUE
       AND n.target IN ('all','patients')
     ORDER BY n.is_urgent DESC, n.created_at DESC
     LIMIT 50`,
    [req.user.hospitalId, req.user.userId]
  );
  res.json(result.rows);
});

// ── PUT /api/patient/messages/:id/read ────────────────────────
const markMessageRead = asyncHandler(async (req, res) => {
  await query(
    `INSERT INTO notice_reads (notice_id, user_id) VALUES ($1, $2)
     ON CONFLICT (notice_id, user_id) DO NOTHING`,
    [req.params.id, req.user.userId]
  );
  res.json({ message: 'Marked as read' });
});

// ── GET /api/patient/documents ────────────────────────────────
const getDocuments = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result  = await query(
    `SELECT id, name, file_type, uploaded_at FROM patient_documents WHERE patient_id = $1 ORDER BY uploaded_at DESC`,
    [patient.id]
  );
  res.json(result.rows);
});

// ── GET /api/patient/health-record ────────────────────────────
const getHealthRecord = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result  = await query(
    `SELECT c.id, c.visit_date, c.subjective, c.objective, c.assessment, c.plan,
            c.diagnosis_icd, c.follow_up_date, c.is_complete,
            d.name AS doctor_name, dept.name AS dept_name
     FROM consultations c
     JOIN doctors d     ON d.id = c.doctor_id
     JOIN departments dept ON dept.id = c.dept_id
     WHERE c.patient_id = $1
     ORDER BY c.visit_date DESC`,
    [patient.id]
  );
  res.json(result.rows);
});

// ── GET /api/patient/profile ──────────────────────────────────
const getProfile = asyncHandler(async (req, res) => {
  const patient = await getPatientId(req.user.userId);
  const result  = await query(
    `SELECT p.id, p.name, p.age, p.gender, p.dob, p.blood_group,
            p.phone, p.address, p.abha_id, p.pmjay_id, p.created_at,
            u.email, u.last_login
     FROM patients p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1`,
    [patient.id]
  );
  res.json(result.rows[0]);
});

// ── PUT /api/patient/profile ──────────────────────────────────
const updateProfile = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const patient = await getPatientId(req.user.userId);
  const { address, phone } = req.body;

  await query(
    `UPDATE patients SET
       address    = COALESCE($1, address),
       phone      = COALESCE($2, phone),
       updated_at = NOW()
     WHERE id = $3`,
    [address || null, phone || null, patient.id]
  );

  res.json({ message: 'Profile updated' });
});

module.exports = {
  getDashboard, getQueueStatus, getAppointments, bookAppointment, cancelAppointment,
  getReports, getReportDetail, getPrescriptions,
  getTasks, completeTask,
  getBills, getMessages, markMessageRead, getDocuments, getHealthRecord,
  getProfile, updateProfile,
};
