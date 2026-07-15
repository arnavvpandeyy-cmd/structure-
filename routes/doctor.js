/* ─── routes/doctor.js ───────────────────────────────────────── */
const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('doctor'));

// ── Demo Data ─────────────────────────────────────────────────
const QUEUE = [
  { id: 1, token_number: 74, patient_name: 'Nirmala Devi',      patient_id: 'P001', age: 52, chief_complaint: 'Diabetes follow-up', status: 'done',            has_critical_lab: false },
  { id: 2, token_number: 75, patient_name: 'Ramesh Subramaniam',patient_id: 'P002', age: 47, chief_complaint: 'Hypertension + DM',   status: 'in-consultation', has_critical_lab: true  },
  { id: 3, token_number: 76, patient_name: 'Kavitha Reddy',     patient_id: 'P003', age: 34, chief_complaint: 'Fever & cough 5 days', status: 'waiting',        has_critical_lab: false },
  { id: 4, token_number: 77, patient_name: 'Suresh Pawar',      patient_id: 'P004', age: 61, chief_complaint: 'Joint pain',          status: 'waiting',        has_critical_lab: false },
  { id: 5, token_number: 78, patient_name: 'Anita Sharma',      patient_id: 'P005', age: 29, chief_complaint: 'Headache + vertigo',  status: 'waiting',        has_critical_lab: false },
  { id: 6, token_number: 79, patient_name: 'Mohan Kulkarni',    patient_id: 'P006', age: 44, chief_complaint: 'Chest pain',          status: 'waiting',        has_critical_lab: false },
];

const PATIENTS = {
  P001: { profile: { name: 'Nirmala Devi', id: 'P001', age: 52, gender: 'Female', blood_group: 'O+', abha_id: '91-0001' }, recentVisits: [{ visit_date: '2026-06-10', assessment: 'Type 2 DM — controlled. Continue Metformin.' }] },
  P002: { profile: { name: 'Ramesh Subramaniam', id: 'P002', age: 47, gender: 'Male', blood_group: 'B+', abha_id: '91-0002' }, recentVisits: [{ visit_date: '2026-06-15', assessment: 'HTN + DM. HbA1c 7.8% — adjust Metformin.' }] },
  P003: { profile: { name: 'Kavitha Reddy', id: 'P003', age: 34, gender: 'Female', blood_group: 'A+', abha_id: '' }, recentVisits: [] },
};

const ALERTS = [
  { id: 1, patient: 'Ramesh Subramaniam', bed: null, message: 'HbA1c critically high (7.8%) — patient in OPD queue T-75', severity: 'warning', created_at: new Date(Date.now()-900000).toISOString() },
  { id: 2, patient: 'Ward A — Bed 3', bed: 'Bed 3', message: 'SpO₂ dropped below 92% — immediate review needed', severity: 'critical', created_at: new Date(Date.now()-300000).toISOString() },
];

const TASKS = [
  { id: 1, task: 'Review urine report — Nirmala Devi', priority: 'high',   is_done: false, due_date: new Date().toISOString().split('T')[0], patient_name: 'Nirmala Devi' },
  { id: 2, task: 'Ward round — Male Medical Ward',      priority: 'high',   is_done: false, due_date: new Date().toISOString().split('T')[0], patient_name: null },
  { id: 3, task: 'Complete discharge summary — Bed 7',  priority: 'medium', is_done: false, due_date: new Date().toISOString().split('T')[0], patient_name: 'K. Patil' },
  { id: 4, task: 'Submit monthly immunisation report',  priority: 'medium', is_done: false, due_date: '2026-07-07', patient_name: null },
  { id: 5, task: 'Refer Mr. Kulkarni — Cardiology',     priority: 'high',   is_done: false, due_date: new Date().toISOString().split('T')[0], patient_name: 'Mohan Kulkarni' },
];

const ROUNDS = [
  { bed_number: '1', name: 'Kamla Bai', age: 68, ward_name: 'Female Medical', days_admitted: 3, diagnosis: 'CVA', has_alert: true  },
  { bed_number: '2', name: 'Suresh P.', age: 55, ward_name: 'Male Medical',   days_admitted: 1, diagnosis: 'Pneumonia', has_alert: false },
  { bed_number: '3', name: 'Ravi Shah', age: 72, ward_name: 'Male Medical',   days_admitted: 5, diagnosis: 'CHF', has_alert: true  },
  { bed_number: '4', name: 'Meena T.',  age: 41, ward_name: 'Female Medical', days_admitted: 2, diagnosis: 'Cellulitis', has_alert: false },
];

const DISCHARGE_QUEUE = [
  { patient_id: 'P010', patient_name: 'K. Patil', bed_number: '7', days_admitted: 5, blocker_reason: 'Awaiting final blood report', ward_name: 'Male Medical' },
  { patient_id: 'P011', patient_name: 'Savitri Devi', bed_number: '4', days_admitted: 3, blocker_reason: null, ward_name: 'Female Medical' },
  { patient_id: 'P012', patient_name: 'Rajan Mehta', bed_number: '9', days_admitted: 7, blocker_reason: 'Bill not cleared', ward_name: 'Male Surgical' },
];

// ── Routes ────────────────────────────────────────────────────

// GET /api/doctor/dashboard
router.get('/dashboard', (req, res) => {
  res.json({
    doctor: { name: req.user.name, id: req.user.profileId },
    today: { opd_tokens_issued: 120, opd_seen: 74, opd_remaining: 46, inpatients: 18, pending_labs: 5, ready_labs: 3 }
  });
});

// GET /api/doctor/queue
router.get('/queue', (req, res) => res.json({ queue: QUEUE }));

// POST /api/doctor/queue/:id/call
router.post('/queue/:id/call', (req, res) => {
  const t = QUEUE.find(q => q.id == req.params.id);
  if (!t) return res.status(404).json({ error: 'Token not found' });
  QUEUE.forEach(q => { if (q.status === 'calling') q.status = 'done'; });
  t.status = 'calling';
  res.json({ success: true, token: t });
});

// POST /api/doctor/queue/:id/complete
router.post('/queue/:id/complete', (req, res) => {
  const t = QUEUE.find(q => q.id == req.params.id);
  if (t) t.status = 'done';
  res.json({ success: true });
});

// POST /api/doctor/queue/:id/skip
router.post('/queue/:id/skip', (req, res) => {
  const t = QUEUE.find(q => q.id == req.params.id);
  if (t) t.status = 'done';
  res.json({ success: true });
});

// GET /api/doctor/patients/:id
router.get('/patients/:id', (req, res) => {
  const p = PATIENTS[req.params.id] || PATIENTS['P002'];
  res.json(p);
});

// POST /api/doctor/consultation
router.post('/consultation', (req, res) => {
  console.log('Consultation saved:', req.body.assessment?.slice(0, 60));
  res.status(201).json({ id: Date.now(), success: true });
});

// POST /api/doctor/prescription
router.post('/prescription', (req, res) => {
  console.log('Prescription issued:', req.body.items?.length, 'items');
  res.status(201).json({ id: Date.now(), success: true });
});

// POST /api/doctor/lab-order
router.post('/lab-order', (req, res) => {
  console.log('Lab ordered:', req.body.tests);
  res.status(201).json({ id: Date.now(), success: true });
});

// POST /api/doctor/referral
router.post('/referral', (req, res) => {
  res.status(201).json({ id: Date.now(), success: true });
});

// GET /api/doctor/alerts
router.get('/alerts', (req, res) => res.json(ALERTS));

// PUT /api/doctor/alerts/:id/resolve
router.put('/alerts/:id/resolve', (req, res) => {
  const idx = ALERTS.findIndex(a => a.id == req.params.id);
  if (idx !== -1) ALERTS.splice(idx, 1);
  res.json({ success: true });
});

// GET /api/doctor/tasks
router.get('/tasks', (req, res) => res.json(TASKS));

// POST /api/doctor/tasks
router.post('/tasks', (req, res) => {
  const t = { id: Date.now(), ...req.body, is_done: false };
  TASKS.push(t); res.status(201).json(t);
});

// PUT /api/doctor/tasks/:id
router.put('/tasks/:id', (req, res) => {
  const t = TASKS.find(t => t.id == req.params.id);
  if (t) Object.assign(t, req.body);
  res.json({ success: true });
});

// GET /api/doctor/rounds
router.get('/rounds', (req, res) => res.json(ROUNDS));

// GET /api/doctor/discharge
router.get('/discharge', (req, res) => res.json(DISCHARGE_QUEUE));

// POST /api/doctor/discharge/initiate
router.post('/discharge/initiate', (req, res) => res.json({ success: true }));

// POST /api/doctor/discharge/:id/summary
router.post('/discharge/:id/summary', (req, res) => {
  const idx = DISCHARGE_QUEUE.findIndex(d => d.patient_id === req.params.id);
  if (idx !== -1) DISCHARGE_QUEUE.splice(idx, 1);
  res.json({ success: true });
});

// GET /api/doctor/workload
router.get('/workload', (req, res) => {
  const days = ['2026-06-29','2026-06-30','2026-07-01','2026-07-02','2026-07-03','2026-07-04','2026-07-05'];
  res.json(days.map(d => ({ date: d, avg_wait_mins: Math.floor(Math.random()*25)+15 })));
});

// GET /api/doctor/messages
router.get('/messages', (req, res) => res.json([
  { id: 1, title: 'OPD Schedule Change — Mon 7 July, start 9 AM', is_urgent: true,  from_name: 'Medical Superintendent', created_at: new Date(Date.now()-3600000).toISOString() },
  { id: 2, title: 'Immunisation drive — 8 July, Block C',          is_urgent: false, from_name: 'Public Health Officer',   created_at: new Date(Date.now()-86400000).toISOString() },
]));

module.exports = router;
