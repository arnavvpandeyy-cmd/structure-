/* ============================================================
   controllers/publicController.js — No-Auth Public API
   ============================================================ */

const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/public/hospitals/:id
const getHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await query(
    `SELECT id, name, short_name, district, state, address,
            contact_phone, email, total_beds, opd_hours
     FROM hospitals WHERE id = $1 AND is_active = TRUE`,
    [id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Hospital not found' });
  res.json(result.rows[0]);
});

// GET /api/public/departments?hospitalId=1
const getDepartments = asyncHandler(async (req, res) => {
  const hospitalId = req.query.hospitalId || process.env.DEFAULT_HOSPITAL_ID || 1;
  const result = await query(
    `SELECT d.id, d.name, d.abbreviation, d.floor_info,
            d.opd_days, d.opd_start, d.opd_end,
            COUNT(doc.id) FILTER (WHERE doc.is_available) AS doctors_available
     FROM departments d
     LEFT JOIN doctors doc ON doc.dept_id = d.id
     WHERE d.hospital_id = $1 AND d.is_active = TRUE
     GROUP BY d.id
     ORDER BY d.name`,
    [hospitalId]
  );
  res.json(result.rows);
});

// GET /api/public/departments/:id/queue
const getDeptQueue = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get all doctors and their live queue state for this dept today
  const result = await query(
    `SELECT d.id            AS doctor_id,
            d.name          AS doctor_name,
            d.designation,
            d.room,
            d.is_available,
            COALESCE(lq.total_tokens, 0)   AS tokens_total,
            COALESCE(lq.tokens_done, 0)    AS tokens_done,
            COALESCE(lq.tokens_waiting, 0) AS tokens_waiting,
            COALESCE(lq.current_token, 0)  AS current_token,
            COALESCE(lq.next_token, 0)     AS next_token,
            -- estimated wait: 5 min avg per patient
            GREATEST(0, COALESCE(lq.tokens_waiting, 0) * 5) AS est_wait_mins
     FROM doctors d
     LEFT JOIN v_live_queue lq ON lq.doctor_id = d.id AND lq.session_date = CURRENT_DATE
     WHERE d.dept_id = $1
     ORDER BY d.name`,
    [id]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'Department not found' });
  }

  res.json({
    deptId: id,
    date  : new Date().toISOString().split('T')[0],
    doctors: result.rows,
  });
});

// GET /api/public/doctors?dept=med&hospitalId=1
const getDoctorsOnDuty = asyncHandler(async (req, res) => {
  const hospitalId = req.query.hospitalId || process.env.DEFAULT_HOSPITAL_ID || 1;
  const deptFilter = req.query.dept;

  const params = [hospitalId];
  let deptClause = '';
  if (deptFilter) {
    params.push(deptFilter);
    deptClause = `AND d.dept_id = $${params.length}`;
  }

  const result = await query(
    `SELECT d.id, d.name, d.designation, d.room, d.schedule, d.is_available,
            dept.name  AS dept_name,
            dept.id    AS dept_id,
            dept.floor_info,
            COALESCE(lq.tokens_waiting, 0) AS waiting,
            COALESCE(lq.current_token, 0)  AS current_token
     FROM doctors d
     JOIN departments dept ON dept.id = d.dept_id
     LEFT JOIN v_live_queue lq ON lq.doctor_id = d.id AND lq.session_date = CURRENT_DATE
     WHERE d.hospital_id = $1 ${deptClause}
     ORDER BY dept.name, d.name`,
    params
  );

  res.json(result.rows);
});

// GET /api/public/opd-status?hospitalId=1
const getOpdStatus = asyncHandler(async (req, res) => {
  const hospitalId = req.query.hospitalId || process.env.DEFAULT_HOSPITAL_ID || 1;

  const [totals, depts] = await Promise.all([
    query(
      `SELECT
         COUNT(qt.id)                                           AS total_tokens_today,
         COUNT(qt.id) FILTER (WHERE qt.status = 'done')        AS total_seen,
         COUNT(qt.id) FILTER (WHERE qt.status = 'waiting')     AS total_waiting,
         AVG(EXTRACT(EPOCH FROM (qt.called_at - qt.issued_at))/60)
           FILTER (WHERE qt.called_at IS NOT NULL)             AS avg_wait_mins
       FROM queue_tokens qt
       WHERE qt.hospital_id = $1 AND qt.session_date = CURRENT_DATE`,
      [hospitalId]
    ),
    query(
      `SELECT d.id, d.name, d.abbreviation,
              COALESCE(SUM(lq.tokens_waiting), 0) AS waiting,
              COALESCE(SUM(lq.tokens_done), 0)    AS seen,
              BOOL_OR(doc.is_available)            AS has_available_doctor
       FROM departments d
       LEFT JOIN doctors doc ON doc.dept_id = d.id
       LEFT JOIN v_live_queue lq ON lq.doctor_id = doc.id AND lq.session_date = CURRENT_DATE
       WHERE d.hospital_id = $1 AND d.is_active = TRUE
       GROUP BY d.id
       ORDER BY waiting DESC`,
      [hospitalId]
    ),
  ]);

  const t = totals.rows[0];
  res.json({
    date          : new Date().toISOString().split('T')[0],
    totalToday    : parseInt(t.total_tokens_today) || 0,
    totalSeen     : parseInt(t.total_seen)         || 0,
    totalWaiting  : parseInt(t.total_waiting)      || 0,
    avgWaitMins   : Math.round(parseFloat(t.avg_wait_mins) || 0),
    departments   : depts.rows,
  });
});

module.exports = { getHospital, getDepartments, getDeptQueue, getDoctorsOnDuty, getOpdStatus };
