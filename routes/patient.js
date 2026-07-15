/* ─── routes/patient.js ──────────────────────────────────────── */
const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');

// All patient routes require authentication
router.use(authenticate, requireRole('patient'));

// ── Demo data ─────────────────────────────────────────────────
const NOW = new Date();
const today = NOW.toISOString().split('T')[0];

const PATIENT_DATA = {
  dashboard: {
    today: { opd_tokens_issued: 120, opd_seen: 74, opd_remaining: 46 },
    pendingTasks: 3,
    reportsReady: 2,
    unreadNotices: 4,
    nextAppt: {
      id: 1, doctor_name: 'Dr. Priya Menon', dept_name: 'General Medicine',
      appt_date: today, appt_time: '10:30', room: 'OPD-3', visit_type: 'Follow-up'
    },
    token: { token_number: 76, dept_name: 'General Medicine', doctor_name: 'Dr. Priya Menon', ahead: 2, status: 'waiting' }
  },
  appointments: [
    { id: 1, doctor_name: 'Dr. Priya Menon', dept_name: 'General Medicine', appt_date: today, appt_time: '10:30', room: 'OPD-3', visit_type: 'Follow-up', status: 'today' },
    { id: 2, doctor_name: 'Dr. Arvind Joshi', dept_name: 'Orthopaedics', appt_date: '2026-07-12', appt_time: '11:00', room: 'OPD-8', visit_type: 'New Visit', status: 'upcoming' },
    { id: 3, doctor_name: 'Dr. Priya Menon', dept_name: 'General Medicine', appt_date: '2026-06-15', appt_time: '10:00', room: 'OPD-3', visit_type: 'Follow-up', status: 'completed' },
  ],
  reports: [
    { id: 1, test_names: ['HbA1c', 'FBS', 'LFT'], order_date: '2026-07-01', ordered_by: 'Dr. Priya Menon', status: 'ready',
      tests: [
        { test_name: 'HbA1c', result_value: '7.8%', result_unit: '%', reference_range: '< 5.7%', flag: 'high' },
        { test_name: 'FBS',   result_value: '134',  result_unit: 'mg/dL', reference_range: '70–100 mg/dL', flag: 'high' },
        { test_name: 'SGPT',  result_value: '38',   result_unit: 'U/L',   reference_range: '7–40 U/L',   flag: 'normal' },
      ]
    },
    { id: 2, test_names: ['Urine Routine'], order_date: '2026-07-03', ordered_by: 'Dr. Priya Menon', status: 'pending', tests: [] },
  ],
  prescriptions: [
    { id: 1, drug_name: 'Metformin 500mg', dose: '1 tab', morning: true, night: true, with_food: true, duration_days: 30 },
    { id: 2, drug_name: 'Amlodipine 5mg',  dose: '1 tab', morning: true, night: false, with_food: false, duration_days: 30 },
    { id: 3, drug_name: 'Atorvastatin 10mg', dose: '1 tab', morning: false, night: true, with_food: false, duration_days: 30 },
  ],
  tasks: [
    { id: 1, title: 'Collect HbA1c report from lab', priority: 'high',   is_done: false, due_date: today, created_by: 'Dr. Priya Menon' },
    { id: 2, title: 'Check BP at home — morning',     priority: 'high',   is_done: false, due_date: today, created_by: 'Dr. Priya Menon' },
    { id: 3, title: 'Complete urine sample submission', priority: 'medium', is_done: false, due_date: '2026-07-07', created_by: 'Lab' },
    { id: 4, title: 'Review diet plan handout',        priority: 'low',    is_done: true,  due_date: '2026-06-30', created_by: 'Nurse' },
  ],
  bills: {
    bills: [
      { id: 1, description: 'OPD Consultation', created_at: '2026-06-15', amount: 0, is_paid: true },
      { id: 2, description: 'Lab Tests — HbA1c, FBS, LFT', created_at: '2026-07-01', amount: 0, is_paid: true },
      { id: 3, description: 'OPD Registration Fee', created_at: today, amount: 30, is_paid: false },
    ],
    totals: { total: 30, paid: 0, pending: 30 }
  },
  messages: [
    { id: 1, title: 'HbA1c Report Ready for Collection', is_read: false, is_urgent: false, from_name: 'Lab Department', created_at: new Date(Date.now()-3600000).toISOString() },
    { id: 2, title: 'OPD Date Change — General Medicine: 10 July', is_read: false, is_urgent: true, from_name: 'Hospital Admin', created_at: new Date(Date.now()-7200000).toISOString() },
    { id: 3, title: 'Your next appointment is confirmed for 12 July', is_read: true, is_urgent: false, from_name: 'System', created_at: new Date(Date.now()-86400000).toISOString() },
  ],
  documents: [
    { id: 1, name: 'Discharge Summary — June 2025', file_type: 'pdf', uploaded_at: '2025-06-20' },
    { id: 2, name: 'X-Ray Report — Lumbar Spine',   file_type: 'image', uploaded_at: '2026-02-10' },
  ],
  profile: {
    id: 'P-2024-08812', name: 'Ramesh Subramaniam', age: 47, gender: 'Male',
    dob: '1978-03-12', blood_group: 'B+', phone: '9876543210',
    abha_id: '91-1234-5678-9012', pmjay_id: 'MH-2024-PM-44871',
    address: '42, Vasant Nagar, Thane West, Maharashtra — 400601'
  }
};

// GET /api/patient/dashboard
router.get('/dashboard', (req, res) => res.json(PATIENT_DATA.dashboard));

// GET /api/patient/queue-status
router.get('/queue-status', (req, res) => res.json(PATIENT_DATA.dashboard.token));

// GET /api/patient/appointments
router.get('/appointments', (req, res) => res.json(PATIENT_DATA.appointments));

// POST /api/patient/appointments (book)
router.post('/appointments', (req, res) => {
  const appt = { id: Date.now(), ...req.body, status: 'scheduled' };
  PATIENT_DATA.appointments.unshift(appt);
  res.status(201).json(appt);
});

// DELETE /api/patient/appointments/:id
router.delete('/appointments/:id', (req, res) => {
  PATIENT_DATA.appointments = PATIENT_DATA.appointments.filter(a => a.id != req.params.id);
  res.json({ message: 'Cancelled' });
});

// GET /api/patient/reports
router.get('/reports', (req, res) => res.json(PATIENT_DATA.reports));

// GET /api/patient/reports/:id
router.get('/reports/:id', (req, res) => {
  const r = PATIENT_DATA.reports.find(r => r.id == req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'Report not found' });
});

// GET /api/patient/prescriptions
router.get('/prescriptions', (req, res) => res.json(PATIENT_DATA.prescriptions));

// GET /api/patient/tasks
router.get('/tasks', (req, res) => res.json(PATIENT_DATA.tasks));

// PUT /api/patient/tasks/:id/complete
router.put('/tasks/:id/complete', (req, res) => {
  const t = PATIENT_DATA.tasks.find(t => t.id == req.params.id);
  if (t) t.is_done = true;
  res.json({ success: true });
});

// GET /api/patient/bills
router.get('/bills', (req, res) => res.json(PATIENT_DATA.bills));

// GET /api/patient/messages
router.get('/messages', (req, res) => res.json(PATIENT_DATA.messages));

// PUT /api/patient/messages/:id/read
router.put('/messages/:id/read', (req, res) => {
  const m = PATIENT_DATA.messages.find(m => m.id == req.params.id);
  if (m) m.is_read = true;
  res.json({ success: true });
});

// GET /api/patient/documents
router.get('/documents', (req, res) => res.json(PATIENT_DATA.documents));

// GET /api/patient/health-record
router.get('/health-record', (req, res) => res.json({ profile: PATIENT_DATA.profile, reports: PATIENT_DATA.reports }));

// GET /api/patient/profile
router.get('/profile', (req, res) => res.json(PATIENT_DATA.profile));

// PUT /api/patient/profile
router.put('/profile', (req, res) => {
  Object.assign(PATIENT_DATA.profile, req.body);
  res.json(PATIENT_DATA.profile);
});

module.exports = router;
