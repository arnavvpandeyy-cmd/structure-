/* ============================================================
   controllers/adminController.js — Admin Dashboard Logic
   ============================================================ */

const { query } = require('../config/db');
const { asyncHandler, createError } = require('../middleware/errorHandler');
const { validationResult } = require('express-validator');
const { emitAdminMetrics } = require('../config/socket');

// ── GET /api/admin/overview ───────────────────────────────────
const getOverview = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;

  const [tokens, beds, discharges, labs, referrals, escalations] = await Promise.all([
    // OPD token totals today
    query(
      `SELECT
         COUNT(*)                                         AS opd_registered,
         COUNT(*) FILTER (WHERE status='done')            AS opd_seen,
         COUNT(*) FILTER (WHERE status='waiting')         AS opd_waiting,
         AVG(EXTRACT(EPOCH FROM (called_at - issued_at))/60)
           FILTER (WHERE called_at IS NOT NULL)           AS avg_wait_mins
       FROM queue_tokens WHERE hospital_id=$1 AND session_date=CURRENT_DATE`,
      [hospitalId]
    ),
    // Beds
    query(
      `SELECT total_beds,
              SUM(occupied) AS occupied, SUM(vacant) AS vacant
       FROM v_ward_occupancy WHERE hospital_id=$1`,
      [hospitalId]
    ),
    // Discharges
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status='resolved') AS discharge_today,
         COUNT(*) FILTER (WHERE status='open')     AS discharge_pending
       FROM escalations WHERE hospital_id=$1 AND type='discharge-blocker'
         AND created_at >= CURRENT_DATE`,
      [hospitalId]
    ),
    // Lab TAT
    query(
      `SELECT AVG(EXTRACT(EPOCH FROM (lt.completed_at - lo.created_at))/3600) AS avg_tat_hrs
       FROM lab_orders lo
       JOIN lab_tests lt ON lt.order_id = lo.id
       WHERE lo.hospital_id IS NULL                    -- hospital-wide
         AND lt.completed_at IS NOT NULL
         AND lo.order_date = CURRENT_DATE`,
      []
    ),
    // Open referrals
    query(
      `SELECT COUNT(*) AS open_referrals FROM referrals r
       JOIN patients p ON p.id = r.patient_id
       WHERE p.hospital_id = $1 AND r.status = 'open'`,
      [hospitalId]
    ),
    // Critical escalations
    query(
      `SELECT COUNT(*) AS critical FROM escalations WHERE hospital_id=$1 AND severity='critical' AND status='open'`,
      [hospitalId]
    ),
  ]);

  const t = tokens.rows[0];
  const b = beds.rows[0];
  const d = discharges.rows[0];

  res.json({
    date          : new Date().toISOString().split('T')[0],
    opdRegistered : parseInt(t.opd_registered)  || 0,
    opdSeen       : parseInt(t.opd_seen)         || 0,
    opdWaiting    : parseInt(t.opd_waiting)      || 0,
    avgWaitMins   : Math.round(parseFloat(t.avg_wait_mins) || 0),
    bedsTotal     : parseInt(b.total_beds)       || 0,
    bedsOccupied  : parseInt(b.occupied)         || 0,
    bedsVacant    : parseInt(b.vacant)           || 0,
    dischargeToday  : parseInt(d.discharge_today)   || 0,
    dischargePending: parseInt(d.discharge_pending) || 0,
    labTatAvgHrs  : parseFloat(labs.rows[0]?.avg_tat_hrs || 0).toFixed(1),
    referralsOpen : parseInt(referrals.rows[0].open_referrals),
    criticalAlerts: parseInt(escalations.rows[0].critical),
  });
});

// ── GET /api/admin/wait-trend ─────────────────────────────────
const getWaitTrend = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  // Hourly average wait time for today
  const result = await query(
    `SELECT
       EXTRACT(HOUR FROM issued_at) AS hour,
       AVG(EXTRACT(EPOCH FROM (called_at - issued_at))/60)
         FILTER (WHERE called_at IS NOT NULL) AS avg_wait_mins,
       COUNT(*) AS total_tokens
     FROM queue_tokens
     WHERE hospital_id = $1 AND session_date = CURRENT_DATE
     GROUP BY hour ORDER BY hour`,
    [hospitalId]
  );

  // Format nicely
  const formatted = result.rows.map(r => ({
    time    : `${String(parseInt(r.hour)).padStart(2,'0')}:00`,
    wait    : Math.round(parseFloat(r.avg_wait_mins) || 0),
    tokens  : parseInt(r.total_tokens),
  }));

  res.json(formatted);
});

// ── GET /api/admin/patient-flow ───────────────────────────────
const getPatientFlow = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const result = await query(
    `SELECT
       COUNT(*)                                                          AS registered,
       COUNT(*) FILTER (WHERE status IN ('done','in-consultation'))      AS reached_doctor,
       COUNT(*) FILTER (WHERE status = 'done')                          AS consultation_complete,
       -- Avg time from issue to called
       AVG(EXTRACT(EPOCH FROM (called_at - issued_at))/60)
         FILTER (WHERE called_at IS NOT NULL)                            AS avg_wait_before_consult,
       -- Avg time from called to complete
       AVG(EXTRACT(EPOCH FROM (completed_at - called_at))/60)
         FILTER (WHERE completed_at IS NOT NULL AND called_at IS NOT NULL) AS avg_consult_duration
     FROM queue_tokens
     WHERE hospital_id = $1 AND session_date = CURRENT_DATE`,
    [hospitalId]
  );

  const r = result.rows[0];
  res.json({
    registered          : parseInt(r.registered),
    reachedDoctor       : parseInt(r.reached_doctor),
    consultationComplete: parseInt(r.consultation_complete),
    avgWaitBeforeConsult: Math.round(parseFloat(r.avg_wait_before_consult) || 0),
    avgConsultDuration  : Math.round(parseFloat(r.avg_consult_duration) || 0),
  });
});

// ── GET /api/admin/opd-load ───────────────────────────────────
const getOpdLoad = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const result = await query(
    `SELECT
       dept.id, dept.name,
       COALESCE(SUM(lq.total_tokens), 0)   AS registered,
       COALESCE(SUM(lq.tokens_done), 0)    AS seen,
       COALESCE(SUM(lq.tokens_waiting), 0) AS waiting,
       COUNT(DISTINCT d.id) FILTER (WHERE d.is_available) AS doctors_on,
       -- Flag status based on wait per doctor
       CASE
         WHEN COALESCE(SUM(lq.tokens_waiting),0) / NULLIF(COUNT(DISTINCT d.id) FILTER (WHERE d.is_available),0) > 30
           THEN 'critical'
         WHEN COALESCE(SUM(lq.tokens_waiting),0) / NULLIF(COUNT(DISTINCT d.id) FILTER (WHERE d.is_available),0) > 15
           THEN 'high'
         WHEN COALESCE(SUM(lq.tokens_waiting),0) / NULLIF(COUNT(DISTINCT d.id) FILTER (WHERE d.is_available),0) > 8
           THEN 'medium'
         ELSE 'normal'
       END AS status
     FROM departments dept
     LEFT JOIN doctors d         ON d.dept_id = dept.id
     LEFT JOIN v_live_queue lq   ON lq.doctor_id = d.id AND lq.session_date = CURRENT_DATE
     WHERE dept.hospital_id = $1 AND dept.is_active = TRUE
     GROUP BY dept.id
     ORDER BY waiting DESC`,
    [hospitalId]
  );
  res.json(result.rows);
});

// ── GET /api/admin/beds ───────────────────────────────────────
const getBedOccupancy = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const [summary, wards] = await Promise.all([
    query(
      `SELECT total_beds, SUM(occupied) AS occupied, SUM(vacant) AS vacant, SUM(reserved) AS reserved
       FROM v_ward_occupancy WHERE hospital_id=$1`,
      [hospitalId]
    ),
    query(
      `SELECT ward_id, ward_name, specialty, total_beds, occupied, vacant, reserved,
              -- discharge ready count from escalations
              (SELECT COUNT(*) FROM escalations e
               JOIN patients p ON p.id = e.patient_id
               JOIN beds b2    ON b2.patient_id = p.id
               JOIN wards w2   ON w2.id = b2.ward_id
               WHERE w2.id = v.ward_id AND e.type='discharge-blocker' AND e.status='open') AS discharge_ready,
              -- critical patients
              (SELECT COUNT(*) FROM escalations e
               JOIN patients p ON p.id = e.patient_id
               JOIN beds b2    ON b2.patient_id = p.id
               JOIN wards w2   ON w2.id = b2.ward_id
               WHERE w2.id = v.ward_id AND e.severity='critical' AND e.status='open') AS critical
       FROM v_ward_occupancy v
       WHERE hospital_id = $1
       ORDER BY ward_name`,
      [hospitalId]
    ),
  ]);

  res.json({ summary: summary.rows[0], wards: wards.rows });
});

// ── PUT /api/admin/beds/:id/status ────────────────────────────
const updateBedStatus = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });
  await query(
    `UPDATE beds SET status=$1, updated_at=NOW() WHERE id=$2`,
    [req.body.status, req.params.id]
  );
  res.json({ message: 'Bed status updated' });
});

// ── GET /api/admin/discharge-blockers ─────────────────────────
const getDischargeBlockers = asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM v_discharge_blockers ORDER BY days_admitted DESC', []);
  res.json(result.rows);
});

// ── POST /api/admin/discharge-blockers/:id/escalate ───────────
const escalateBlocker = asyncHandler(async (req, res) => {
  const { escalateTo } = req.body;
  await query(
    `UPDATE escalations SET severity='critical', owner=COALESCE($1, owner)
     WHERE id=$2 AND type='discharge-blocker'`,
    [escalateTo || null, req.params.id]
  );
  res.json({ message: 'Blocker escalated' });
});

// ── PUT /api/admin/discharge-blockers/:id/resolve ─────────────
const resolveBlocker = asyncHandler(async (req, res) => {
  await query(
    `UPDATE escalations SET status='resolved', resolved_by=$1, resolved_at=NOW() WHERE id=$2`,
    [req.user.userId, req.params.id]
  );
  res.json({ message: 'Discharge blocker resolved' });
});

// ── GET /api/admin/lab-status ─────────────────────────────────
const getLabStatus = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const result = await query(
    `SELECT
       lt.category,
       COUNT(lo.id)                                             AS total_today,
       COUNT(lo.id) FILTER (WHERE lo.status='ready')           AS completed,
       COUNT(lo.id) FILTER (WHERE lo.status='ordered')         AS pending,
       COUNT(lo.id) FILTER (WHERE lo.status='processing')      AS processing,
       ROUND(AVG(EXTRACT(EPOCH FROM (lt.completed_at - lo.created_at))/3600)
         FILTER (WHERE lt.completed_at IS NOT NULL)::NUMERIC, 1) AS avg_tat_hrs
     FROM lab_orders lo
     JOIN lab_tests lt ON lt.order_id = lo.id
     WHERE lo.order_date = CURRENT_DATE
     GROUP BY lt.category ORDER BY pending DESC NULLS LAST`,
    []
  );
  res.json(result.rows);
});

// ── GET /api/admin/referrals ──────────────────────────────────
const getReferrals = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const result = await query(
    `SELECT r.id, r.urgency, r.reason, r.status, r.referred_at, r.responded_at,
            p.name    AS patient,
            fd.name   AS from_dept,
            td.name   AS to_dept,
            fd_doc.name AS from_doctor
     FROM referrals r
     JOIN patients    p      ON p.id = r.patient_id
     JOIN departments fd     ON fd.id = r.from_dept_id
     JOIN departments td     ON td.id = r.to_dept_id
     JOIN doctors     fd_doc ON fd_doc.id = r.from_doctor_id
     WHERE p.hospital_id = $1
     ORDER BY CASE r.urgency WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
              r.referred_at DESC
     LIMIT 50`,
    [hospitalId]
  );
  res.json(result.rows);
});

// ── GET /api/admin/escalations ────────────────────────────────
const getEscalations = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const result = await query(
    `SELECT e.id, e.type, e.description, e.severity, e.owner, e.status, e.created_at,
            dept.name AS dept_name, p.name AS patient_name
     FROM escalations e
     LEFT JOIN departments dept ON dept.id = e.dept_id
     LEFT JOIN patients    p    ON p.id = e.patient_id
     WHERE e.hospital_id = $1
     ORDER BY CASE e.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
              e.created_at DESC
     LIMIT 100`,
    [hospitalId]
  );
  res.json(result.rows);
});

// ── PUT /api/admin/escalations/:id/resolve ────────────────────
const resolveEscalation = asyncHandler(async (req, res) => {
  await query(
    `UPDATE escalations SET status='resolved', resolved_by=$1, resolved_at=NOW() WHERE id=$2`,
    [req.user.userId, req.params.id]
  );

  // Emit updated metrics
  const io = req.app.get('io');
  emitAdminMetrics(io, req.user.hospitalId, { type: 'escalation_resolved', escalationId: req.params.id });

  res.json({ message: 'Escalation resolved' });
});

// ── GET /api/admin/staffing ───────────────────────────────────
const getStaffingPressure = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const result = await query(
    `SELECT dept.id, dept.name,
            COUNT(d.id)                                                        AS doctors_rostered,
            COUNT(d.id) FILTER (WHERE d.is_available)                          AS doctors_available,
            COALESCE(SUM(lq.tokens_waiting), 0)                                AS patients_waiting,
            CASE WHEN COUNT(d.id) FILTER (WHERE d.is_available) > 0
              THEN ROUND(COALESCE(SUM(lq.tokens_waiting), 0)::NUMERIC /
                   COUNT(d.id) FILTER (WHERE d.is_available), 1)
              ELSE NULL
            END AS patients_per_available_doctor
     FROM departments dept
     LEFT JOIN doctors d       ON d.dept_id = dept.id
     LEFT JOIN v_live_queue lq ON lq.doctor_id = d.id AND lq.session_date = CURRENT_DATE
     WHERE dept.hospital_id = $1 AND dept.is_active = TRUE
     GROUP BY dept.id
     ORDER BY patients_per_available_doctor DESC NULLS FIRST`,
    [hospitalId]
  );
  res.json(result.rows);
});

// ── GET /api/admin/programmes ─────────────────────────────────
const getProgrammeCompliance = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const result = await query(
    `SELECT
       prog.id, prog.name, prog.code, prog.target,
       COUNT(pe.id) FILTER (WHERE pe.status='active')    AS enrolled,
       COUNT(pe.id) FILTER (WHERE pe.status='completed') AS completed,
       COUNT(pe.id) FILTER (WHERE pe.status='defaulted') AS defaulted,
       -- Patients with overdue follow-up
       COUNT(pe.id) FILTER (WHERE pe.next_visit_date < CURRENT_DATE
                              AND pe.status='active')     AS overdue,
       ROUND(100.0 * COUNT(pe.id) / NULLIF(prog.target,0), 0) AS pct_of_target
     FROM programmes prog
     LEFT JOIN programme_enrolments pe ON pe.programme_id = prog.id
     WHERE prog.hospital_id = $1 AND prog.is_active = TRUE
     GROUP BY prog.id
     ORDER BY prog.name`,
    [hospitalId]
  );
  res.json(result.rows);
});

// ── GET /api/admin/notices ────────────────────────────────────
const getNotices = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const result = await query(
    `SELECT id, target, title, body, is_urgent, from_name, created_at
     FROM notices WHERE hospital_id=$1 AND is_active=TRUE
     ORDER BY is_urgent DESC, created_at DESC LIMIT 50`,
    [hospitalId]
  );
  res.json(result.rows);
});

// ── POST /api/admin/notices ───────────────────────────────────
const createNotice = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const hospitalId = req.user.hospitalId;
  const { title, body, target, targetDept, isUrgent, fromName } = req.body;

  const result = await query(
    `INSERT INTO notices (hospital_id, from_role, from_name, target, target_dept, title, body, is_urgent)
     VALUES ($1,'admin',$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [hospitalId, fromName || 'Administration', target, targetDept || null,
     title, body || null, isUrgent || false]
  );

  // Emit to admin room
  const io = req.app.get('io');
  emitAdminMetrics(io, hospitalId, { type: 'new_notice', notice: result.rows[0] });

  res.status(201).json({ message: 'Notice created', notice: result.rows[0] });
});

// ── DELETE /api/admin/notices/:id ─────────────────────────────
const deleteNotice = asyncHandler(async (req, res) => {
  await query(
    'UPDATE notices SET is_active=FALSE WHERE id=$1 AND hospital_id=$2',
    [req.params.id, req.user.hospitalId]
  );
  res.json({ message: 'Notice removed' });
});

// ── GET /api/admin/departments ────────────────────────────────
const getDepartments = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT d.id, d.name, d.abbreviation, d.floor_info, d.opd_days,
            COUNT(doc.id) AS total_doctors,
            COUNT(doc.id) FILTER (WHERE doc.is_available) AS available_doctors
     FROM departments d
     LEFT JOIN doctors doc ON doc.dept_id = d.id
     WHERE d.hospital_id = $1 AND d.is_active = TRUE
     GROUP BY d.id ORDER BY d.name`,
    [req.user.hospitalId]
  );
  res.json(result.rows);
});

// ── GET /api/admin/doctors ────────────────────────────────────
const getDoctors = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT d.id, d.name, d.designation, d.room, d.schedule, d.is_available,
            dept.name AS dept_name, dept.id AS dept_id
     FROM doctors d
     JOIN departments dept ON dept.id = d.dept_id
     WHERE d.hospital_id = $1
     ORDER BY dept.name, d.name`,
    [req.user.hospitalId]
  );
  res.json(result.rows);
});

// ── PUT /api/admin/doctors/:id/availability ───────────────────
const setDoctorAvailability = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  await query(
    'UPDATE doctors SET is_available=$1, updated_at=NOW() WHERE id=$2 AND hospital_id=$3',
    [req.body.available, req.params.id, req.user.hospitalId]
  );

  // Emit queue update for dept
  const doctorRes = await query('SELECT dept_id FROM doctors WHERE id=$1', [req.params.id]);
  if (doctorRes.rows[0]) {
    const io = req.app.get('io');
    const { emitQueueUpdate } = require('../config/socket');
    emitQueueUpdate(io, doctorRes.rows[0].dept_id, {
      type     : 'doctor_availability_changed',
      doctorId : req.params.id,
      available: req.body.available,
    });
  }

  res.json({ message: `Doctor ${req.body.available ? 'marked available' : 'marked unavailable'}` });
});

module.exports = {
  getOverview, getWaitTrend, getPatientFlow,
  getOpdLoad, getBedOccupancy, updateBedStatus,
  getDischargeBlockers, escalateBlocker, resolveBlocker,
  getLabStatus, getReferrals,
  getEscalations, resolveEscalation,
  getStaffingPressure, getProgrammeCompliance,
  getNotices, createNotice, deleteNotice,
  getDepartments, getDoctors, setDoctorAvailability,
};
