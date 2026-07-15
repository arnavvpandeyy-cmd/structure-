/* ============================================================
   controllers/doctorController.js — Doctor Dashboard Logic
   ============================================================ */

const { query, transaction } = require('../config/db');
const { asyncHandler, createError } = require('../middleware/errorHandler');
const { validationResult } = require('express-validator');
const { emitQueueUpdate, emitPatientNotification } = require('../config/socket');
const { sendSMS, smsTemplates } = require('../utils/sms');

// ── Helper: get doctor record for the logged-in user ──────────
const getDoctorRecord = async (userId) => {
  const r = await query('SELECT id, dept_id, hospital_id, name FROM doctors WHERE user_id = $1', [userId]);
  if (!r.rows[0]) throw createError('Doctor profile not found', 404);
  return r.rows[0];
};

// ── GET /api/doctor/dashboard ─────────────────────────────────
const getDashboard = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);

  const [summary, alerts, tasks] = await Promise.all([
    query(
      `SELECT
         COALESCE(lq.total_tokens, 0)   AS opd_tokens_issued,
         COALESCE(lq.tokens_done, 0)    AS opd_seen,
         COALESCE(lq.tokens_waiting, 0) AS opd_remaining,
         (SELECT COUNT(*) FROM beds b
          JOIN wards w ON w.id = b.ward_id
          WHERE b.patient_id IS NOT NULL
            AND w.hospital_id = $2)     AS inpatients,
         (SELECT COUNT(*) FROM lab_orders lo
          JOIN consultations c ON c.id = lo.consultation_id
          WHERE c.doctor_id = $1
            AND lo.status = 'ordered'
            AND lo.order_date = CURRENT_DATE) AS pending_labs,
         (SELECT COUNT(*) FROM lab_orders lo
          JOIN consultations c ON c.id = lo.consultation_id
          WHERE c.doctor_id = $1 AND lo.status IN ('ready','critical')) AS ready_labs
       FROM v_live_queue lq
       WHERE lq.doctor_id = $1 AND lq.session_date = CURRENT_DATE`,
      [doctor.id, doctor.hospital_id]
    ),
    query(
      `SELECT e.id, e.description AS message, e.severity, e.created_at AS time,
              p.name AS patient, b.bed_number AS bed
       FROM escalations e
       LEFT JOIN patients p ON p.id = e.patient_id
       LEFT JOIN beds b     ON b.patient_id = p.id AND b.status = 'occupied'
       WHERE e.hospital_id = $1 AND e.status = 'open'
       ORDER BY e.severity DESC, e.created_at DESC
       LIMIT 10`,
      [doctor.hospital_id]
    ),
    query(
      `SELECT t.id, t.title, t.due_date, t.priority, t.is_done,
              p.name AS patient_name
       FROM patient_tasks t
       JOIN patients p ON p.id = t.patient_id
       WHERE t.created_by = $1 AND t.is_done = FALSE
       ORDER BY t.priority DESC, t.due_date ASC NULLS LAST
       LIMIT 10`,
      [doctor.id]
    ),
  ]);

  res.json({
    doctor  : { id: doctor.id, name: doctor.name, deptId: doctor.dept_id },
    today   : summary.rows[0] || {},
    alerts  : alerts.rows,
    pendingTasks: tasks.rows,
  });
});

// ── GET /api/doctor/queue ─────────────────────────────────────
const getQueue = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);

  const result = await query(
    `SELECT qt.id, qt.token_number, qt.status, qt.chief_complaint,
            qt.visit_type, qt.issued_at, qt.called_at,
            p.id AS patient_id, p.name AS patient_name, p.age,
            p.blood_group,
            -- Flag if patient has critical lab values today
            EXISTS(SELECT 1 FROM lab_orders lo
                   WHERE lo.patient_id = p.id
                     AND lo.status = 'critical') AS has_critical_lab
     FROM queue_tokens qt
     JOIN patients p ON p.id = qt.patient_id
     WHERE qt.doctor_id = $1
       AND qt.session_date = CURRENT_DATE
     ORDER BY qt.token_number ASC`,
    [doctor.id]
  );

  res.json({
    doctorId: doctor.id,
    date    : new Date().toISOString().split('T')[0],
    queue   : result.rows,
  });
});

// ── POST /api/doctor/queue/:tokenId/call ─────────────────────
const callToken = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const { tokenId } = req.params;

  const result = await transaction(async ({ query: tq }) => {
    // Mark any previous 'calling' token as still 'waiting' (safety)
    await tq(
      `UPDATE queue_tokens SET status = 'waiting'
       WHERE doctor_id = $1 AND session_date = CURRENT_DATE AND status = 'calling'`,
      [doctor.id]
    );

    // Set the requested token to 'calling'
    const r = await tq(
      `UPDATE queue_tokens SET status = 'calling', called_at = NOW()
       WHERE id = $1 AND doctor_id = $2 AND status IN ('waiting','calling')
       RETURNING id, token_number, patient_id, dept_id`,
      [tokenId, doctor.id]
    );
    if (!r.rows[0]) throw createError('Token not found or already processed', 404);
    return r.rows[0];
  });

  // Get patient phone and room for SMS
  const pRes = await query('SELECT phone FROM patients WHERE id = $1', [result.patient_id]);
  const dRes = await query('SELECT room FROM doctors WHERE id = $1', [doctor.id]);

  if (pRes.rows[0]?.phone) {
    await sendSMS(pRes.rows[0].phone, smsTemplates.tokenCalling(result.token_number, dRes.rows[0]?.room || 'OPD'));
  }

  // Emit real-time update to dept room
  const io = req.app.get('io');
  emitQueueUpdate(io, result.dept_id, {
    type        : 'token_called',
    token       : result.token_number,
    doctorId    : doctor.id,
    sessionDate : new Date().toISOString().split('T')[0],
  });
  emitPatientNotification(io, result.patient_id, {
    type   : 'your_token_called',
    token  : result.token_number,
    room   : dRes.rows[0]?.room,
    message: `Token ${result.token_number} — please come to ${dRes.rows[0]?.room || 'OPD'}`,
  });

  res.json({ message: 'Token called', token: result });
});

// ── POST /api/doctor/queue/:tokenId/complete ─────────────────
const completeToken = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const result = await query(
    `UPDATE queue_tokens SET status = 'done', completed_at = NOW()
     WHERE id = $1 AND doctor_id = $2 AND status IN ('calling','in-consultation','waiting')
     RETURNING id, token_number, patient_id, dept_id`,
    [req.params.tokenId, doctor.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Token not found' });

  const io = req.app.get('io');
  emitQueueUpdate(io, result.rows[0].dept_id, {
    type    : 'token_done',
    token   : result.rows[0].token_number,
    doctorId: doctor.id,
  });

  res.json({ message: 'Consultation marked complete', token: result.rows[0] });
});

// ── POST /api/doctor/queue/:tokenId/skip ─────────────────────
const skipToken = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  await query(
    `UPDATE queue_tokens SET status = 'absent'
     WHERE id = $1 AND doctor_id = $2 AND status IN ('calling','waiting')`,
    [req.params.tokenId, doctor.id]
  );
  res.json({ message: 'Token marked absent' });
});

// ── GET /api/doctor/patients/:id ─────────────────────────────
const getPatientDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [profile, history, activePrescription, activeLabOrders] = await Promise.all([
    query(
      `SELECT p.*, h.name AS hospital_name
       FROM patients p JOIN hospitals h ON h.id = p.hospital_id WHERE p.id = $1`,
      [id]
    ),
    query(
      `SELECT c.id, c.visit_date, c.assessment, c.plan, c.subjective,
              d.name AS doctor_name, dept.name AS dept_name
       FROM consultations c
       JOIN doctors d ON d.id = c.doctor_id
       JOIN departments dept ON dept.id = c.dept_id
       WHERE c.patient_id = $1 ORDER BY c.visit_date DESC LIMIT 10`,
      [id]
    ),
    query(
      'SELECT * FROM v_active_prescriptions WHERE patient_id = $1 ORDER BY prescribed_date DESC',
      [id]
    ),
    query(
      `SELECT lo.id, lo.order_date, lo.status, lo.priority,
              ARRAY_AGG(lt.test_name) AS tests
       FROM lab_orders lo
       LEFT JOIN lab_tests lt ON lt.order_id = lo.id
       WHERE lo.patient_id = $1 AND lo.status NOT IN ('cancelled')
       GROUP BY lo.id ORDER BY lo.order_date DESC LIMIT 5`,
      [id]
    ),
  ]);

  if (!profile.rows[0]) return res.status(404).json({ error: 'Patient not found' });

  res.json({
    profile       : profile.rows[0],
    recentVisits  : history.rows,
    prescriptions : activePrescription.rows,
    labOrders     : activeLabOrders.rows,
  });
});

// ── POST /api/doctor/consultation ────────────────────────────
const saveConsultation = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const doctor = await getDoctorRecord(req.user.userId);
  const { patientId, tokenId, subjective, objective, assessment, plan,
          diagnosisIcd, followUpDate, followUpNotes } = req.body;

  const result = await query(
    `INSERT INTO consultations
       (patient_id, doctor_id, dept_id, token_id, subjective, objective,
        assessment, plan, diagnosis_icd, follow_up_date, follow_up_notes, is_complete)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, TRUE)
     RETURNING id, visit_date`,
    [patientId, doctor.id, doctor.dept_id, tokenId || null,
     subjective, objective, assessment, plan,
     diagnosisIcd || null, followUpDate || null, followUpNotes || null]
  );

  // If there's a tokenId, mark it in-consultation
  if (tokenId) {
    await query(
      `UPDATE queue_tokens SET status = 'in-consultation' WHERE id = $1 AND doctor_id = $2`,
      [tokenId, doctor.id]
    );
  }

  res.status(201).json({ message: 'Consultation saved', consultation: result.rows[0] });
});

// ── PUT /api/doctor/consultation/:id ─────────────────────────
const updateConsultation = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const { subjective, objective, assessment, plan, followUpDate } = req.body;
  await query(
    `UPDATE consultations SET
       subjective = COALESCE($1, subjective),
       objective  = COALESCE($2, objective),
       assessment = COALESCE($3, assessment),
       plan       = COALESCE($4, plan),
       follow_up_date = COALESCE($5, follow_up_date),
       updated_at = NOW()
     WHERE id = $6 AND doctor_id = $7`,
    [subjective, objective, assessment, plan, followUpDate, req.params.id, doctor.id]
  );
  res.json({ message: 'Consultation updated' });
});

// ── POST /api/doctor/prescription ────────────────────────────
const issuePrescription = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const doctor = await getDoctorRecord(req.user.userId);
  const { patientId, consultationId, items, notes } = req.body;

  const result = await transaction(async ({ query: tq }) => {
    const pr = await tq(
      `INSERT INTO prescriptions (patient_id, doctor_id, consultation_id, notes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [patientId, doctor.id, consultationId || null, notes || null]
    );
    const pid = pr.rows[0].id;

    for (const item of items) {
      await tq(
        `INSERT INTO prescription_items
           (prescription_id, drug_name, dose, route, morning, afternoon, evening, night,
            with_food, duration_days, quantity, instructions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [pid, item.drugName, item.dose || null, item.route || 'oral',
         item.morning || false, item.afternoon || false, item.evening || false, item.night || false,
         item.withFood || false, item.durationDays || null, item.quantity || null, item.instructions || null]
      );
    }
    return pid;
  });

  res.status(201).json({ message: 'Prescription issued', prescriptionId: result });
});

// ── POST /api/doctor/lab-order ────────────────────────────────
const orderLab = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const doctor = await getDoctorRecord(req.user.userId);
  const { patientId, consultationId, tests, priority = 'routine' } = req.body;

  const result = await transaction(async ({ query: tq }) => {
    const or = await tq(
      `INSERT INTO lab_orders (patient_id, ordered_by, consultation_id, priority)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [patientId, doctor.id, consultationId || null, priority]
    );
    const orderId = or.rows[0].id;
    for (const test of tests) {
      await tq(
        `INSERT INTO lab_tests (order_id, test_name, test_code, category)
         VALUES ($1, $2, $3, $4)`,
        [orderId, test.testName, test.testCode || null, test.category || null]
      );
    }
    return orderId;
  });

  res.status(201).json({ message: 'Lab order placed', orderId: result });
});

// ── PUT /api/doctor/lab-order/:id/result ─────────────────────
const submitLabResult = asyncHandler(async (req, res) => {
  // Called by lab staff; updates individual test result
  const { testId, resultValue, resultUnit, referenceRange, flag } = req.body;
  await query(
    `UPDATE lab_tests SET result_value=$1, result_unit=$2, reference_range=$3,
            flag=$4, completed_at=NOW()
     WHERE id=$5`,
    [resultValue, resultUnit, referenceRange, flag, testId]
  );
  // Check if all tests for this order are done
  const check = await query(
    `SELECT COUNT(*) FILTER (WHERE completed_at IS NULL) AS pending
     FROM lab_tests WHERE order_id = $1`,
    [req.params.id]
  );
  if (parseInt(check.rows[0].pending) === 0) {
    await query(`UPDATE lab_orders SET status = 'ready' WHERE id = $1`, [req.params.id]);
  }
  res.json({ message: 'Result submitted' });
});

// ── POST /api/doctor/referral ─────────────────────────────────
const createReferral = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const doctor = await getDoctorRecord(req.user.userId);
  const { patientId, toDeptId, toDoctorId, urgency, reason } = req.body;

  const result = await query(
    `INSERT INTO referrals (patient_id, from_doctor_id, from_dept_id, to_dept_id, to_doctor_id, urgency, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, referred_at`,
    [patientId, doctor.id, doctor.dept_id, toDeptId, toDoctorId || null, urgency, reason]
  );

  res.status(201).json({ message: 'Referral created', referral: result.rows[0] });
});

// ── PUT /api/doctor/referral/:id/respond ─────────────────────
const respondToReferral = asyncHandler(async (req, res) => {
  const { status, responseNotes } = req.body;
  await query(
    `UPDATE referrals SET status=$1, response_notes=$2, responded_at=NOW()
     WHERE id=$3 AND status='open'`,
    [status, responseNotes || null, req.params.id]
  );
  res.json({ message: 'Referral response recorded' });
});

// ── GET /api/doctor/alerts ────────────────────────────────────
const getAlerts = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const result = await query(
    `SELECT e.id, e.description AS message, e.severity, e.type, e.created_at,
            p.name AS patient
     FROM escalations e
     LEFT JOIN patients p ON p.id = e.patient_id
     WHERE e.hospital_id = $1 AND e.status = 'open'
     ORDER BY e.severity DESC, e.created_at DESC
     LIMIT 20`,
    [doctor.hospital_id]
  );
  res.json(result.rows);
});

// ── PUT /api/doctor/alerts/:id/resolve ───────────────────────
const resolveAlert = asyncHandler(async (req, res) => {
  await query(
    `UPDATE escalations SET status='resolved', resolved_by=$1, resolved_at=NOW() WHERE id=$2`,
    [req.user.userId, req.params.id]
  );
  res.json({ message: 'Alert resolved' });
});

// ── GET /api/doctor/tasks ─────────────────────────────────────
const getTasks = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const result = await query(
    `SELECT t.id, t.title, t.due_date, t.priority, t.is_done, p.name AS patient_name, p.id AS patient_id
     FROM patient_tasks t
     JOIN patients p ON p.id = t.patient_id
     WHERE t.created_by = $1
     ORDER BY t.is_done ASC, t.priority DESC, t.due_date ASC NULLS LAST`,
    [doctor.id]
  );
  res.json(result.rows);
});

// ── PUT /api/doctor/tasks/:id ────────────────────────────────
const updateTask = asyncHandler(async (req, res) => {
  const { isDone, priority } = req.body;
  await query(
    `UPDATE patient_tasks SET
       is_done  = COALESCE($1, is_done),
       done_at  = CASE WHEN $1 = TRUE THEN NOW() ELSE done_at END,
       priority = COALESCE($2, priority)
     WHERE id = $3`,
    [isDone ?? null, priority ?? null, req.params.id]
  );
  res.json({ message: 'Task updated' });
});

// ── POST /api/doctor/tasks ────────────────────────────────────
const createTask = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const doctor = await getDoctorRecord(req.user.userId);
  const { patientId, consultationId, title, dueDate, priority } = req.body;
  const r = await query(
    `INSERT INTO patient_tasks (patient_id, created_by, consultation_id, title, due_date, priority)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [patientId, doctor.id, consultationId || null, title, dueDate || null, priority]
  );
  res.status(201).json({ message: 'Task created', taskId: r.rows[0].id });
});

// ── GET /api/doctor/rounds ────────────────────────────────────
const getRounds = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const result = await query(
    `SELECT p.id AS patient_id, p.name, p.age, p.blood_group,
            b.bed_number, w.name AS ward_name,
            b.admission_date,
            DATE_PART('day', NOW() - b.admission_date::TIMESTAMPTZ) AS days_admitted,
            -- Latest consultation assessment as diagnosis
            (SELECT c.assessment FROM consultations c
             WHERE c.patient_id = p.id ORDER BY c.visit_date DESC LIMIT 1) AS diagnosis,
            -- Critical alert
            EXISTS(SELECT 1 FROM escalations e
                   WHERE e.patient_id = p.id AND e.status='open' AND e.severity='critical') AS has_alert
     FROM beds b
     JOIN patients p ON p.id = b.patient_id
     JOIN wards w    ON w.id = b.ward_id
     WHERE b.status = 'occupied' AND w.hospital_id = $1
     ORDER BY w.name, b.bed_number`,
    [doctor.hospital_id]
  );
  res.json(result.rows);
});

// ── GET /api/doctor/rounds/:patientId ────────────────────────
const getRoundPatientDetail = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const [profile, labOrders, prescriptions] = await Promise.all([
    query(
      `SELECT p.*, b.bed_number, w.name AS ward_name, b.admission_date
       FROM patients p
       JOIN beds b  ON b.patient_id = p.id AND b.status = 'occupied'
       JOIN wards w ON w.id = b.ward_id
       WHERE p.id = $1`,
      [patientId]
    ),
    query(
      `SELECT lo.id, lo.order_date, lo.status, lo.priority,
              ARRAY_AGG(jsonb_build_object(
                'test', lt.test_name,'value',lt.result_value,
                'flag', lt.flag,'ref',lt.reference_range
              )) AS tests
       FROM lab_orders lo
       LEFT JOIN lab_tests lt ON lt.order_id = lo.id
       WHERE lo.patient_id = $1 AND lo.order_date >= CURRENT_DATE - INTERVAL '3 days'
       GROUP BY lo.id ORDER BY lo.order_date DESC`,
      [patientId]
    ),
    query('SELECT * FROM v_active_prescriptions WHERE patient_id = $1', [patientId]),
  ]);
  res.json({ profile: profile.rows[0], labOrders: labOrders.rows, prescriptions: prescriptions.rows });
});

// ── PUT /api/doctor/rounds/:patientId/vitals ─────────────────
const updateVitals = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const { patientId } = req.params;
  const { bp, spo2, temp, pr, notes } = req.body;

  // Store vitals as an escalation note if critical values
  const isCritical = spo2 && parseInt(spo2) < 92;
  if (isCritical) {
    await query(
      `INSERT INTO escalations (hospital_id, patient_id, type, description, severity, owner)
       VALUES ($1,$2,'vitals-alert', $3, 'critical', $4)`,
      [doctor.hospital_id, patientId,
       `SpO₂ = ${spo2}% — below critical threshold. Review required.`, doctor.name]
    );
    // Emit alert
    const io = req.app.get('io');
    const { emitDoctorAlert } = require('../config/socket');
    emitDoctorAlert(io, doctor.id, { type: 'critical_vitals', patientId, spo2, message: `SpO₂ critical: ${spo2}%` });
  }

  // Save as a consultation note (objective section)
  if (notes || bp || spo2) {
    await query(
      `INSERT INTO consultations (patient_id, doctor_id, dept_id, objective, is_complete)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [patientId, doctor.id, doctor.dept_id,
       `BP: ${bp || '--'} | SpO₂: ${spo2 || '--'}% | Temp: ${temp || '--'}°C | PR: ${pr || '--'}/min\n${notes || ''}`]
    );
  }

  res.json({ message: 'Vitals recorded', critical: isCritical });
});

// ── GET /api/doctor/discharge ─────────────────────────────────
const getDischargeQueue = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const result = await query(
    `SELECT * FROM v_discharge_blockers WHERE ward_name LIKE '%' ORDER BY blocked_since ASC`,
    []
  );
  res.json(result.rows);
});

// ── POST /api/doctor/discharge/initiate ──────────────────────
const initiateDischarge = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const doctor = await getDoctorRecord(req.user.userId);
  const { patientId } = req.body;

  await query(
    `INSERT INTO escalations (hospital_id, patient_id, type, description, severity, owner, status)
     VALUES ($1,$2,'discharge-blocker','Discharge initiated — summary pending review','info',$3,'open')`,
    [doctor.hospital_id, patientId, doctor.name]
  );

  res.json({ message: 'Discharge initiated. Please submit discharge summary.' });
});

// ── POST /api/doctor/discharge/:id/summary ───────────────────
const submitDischargeSummary = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const doctor = await getDoctorRecord(req.user.userId);
  const { summaryText, followUpDate, followUpInstructions } = req.body;

  // Save as consultation note
  await query(
    `INSERT INTO consultations (patient_id, doctor_id, dept_id, plan, follow_up_date, follow_up_notes, is_complete)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
    [req.params.id, doctor.id, doctor.dept_id,
     `DISCHARGE SUMMARY:\n${summaryText}`,
     followUpDate || null, followUpInstructions || null]
  );

  // Resolve the discharge escalation
  await query(
    `UPDATE escalations SET status='resolved', resolved_by=$1, resolved_at=NOW()
     WHERE patient_id=$2 AND type='discharge-blocker' AND status='open'`,
    [req.user.userId, req.params.id]
  );

  // Free the bed
  await query(
    `UPDATE beds SET status='vacant', patient_id=NULL, admission_date=NULL, updated_at=NOW()
     WHERE patient_id = $1`,
    [req.params.id]
  );

  res.json({ message: 'Discharge summary submitted. Bed freed.' });
});

// ── GET /api/doctor/workload ──────────────────────────────────
const getWorkload = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const result = await query(
    `SELECT
       session_date AS date,
       COUNT(*)                                       AS total_tokens,
       COUNT(*) FILTER (WHERE status='done')          AS seen,
       AVG(EXTRACT(EPOCH FROM (called_at - issued_at))/60)
         FILTER (WHERE called_at IS NOT NULL)         AS avg_wait_mins
     FROM queue_tokens
     WHERE doctor_id = $1 AND session_date >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY session_date
     ORDER BY session_date DESC`,
    [doctor.id]
  );
  res.json(result.rows);
});

// ── GET /api/doctor/programmes ────────────────────────────────
const getProgrammePatients = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const result = await query(
    `SELECT pe.id, pe.enrolment_date, pe.status, pe.next_visit_date,
            p.name AS patient_name, p.id AS patient_id, p.phone,
            prog.name AS programme_name, prog.code
     FROM programme_enrolments pe
     JOIN patients p   ON p.id = pe.patient_id
     JOIN programmes prog ON prog.id = pe.programme_id
     WHERE pe.enrolled_by = $1 AND pe.status = 'active'
     ORDER BY pe.next_visit_date ASC NULLS LAST`,
    [doctor.id]
  );
  res.json(result.rows);
});

// ── GET /api/doctor/messages ──────────────────────────────────
const getMessages = asyncHandler(async (req, res) => {
  const doctor = await getDoctorRecord(req.user.userId);
  const result = await query(
    `SELECT n.id, n.title, n.body, n.is_urgent, n.from_name, n.created_at
     FROM notices n
     WHERE n.hospital_id = $1
       AND n.is_active = TRUE
       AND n.target IN ('all','doctors','staff')
     ORDER BY n.is_urgent DESC, n.created_at DESC LIMIT 30`,
    [doctor.hospital_id]
  );
  res.json(result.rows);
});

module.exports = {
  getDashboard, getQueue, callToken, completeToken, skipToken,
  getPatientDetail, saveConsultation, updateConsultation,
  issuePrescription, orderLab, submitLabResult,
  createReferral, respondToReferral,
  getAlerts, resolveAlert,
  getTasks, updateTask, createTask,
  getRounds, getRoundPatientDetail, updateVitals,
  getDischargeQueue, initiateDischarge, submitDischargeSummary,
  getWorkload, getProgrammePatients, getMessages,
};
