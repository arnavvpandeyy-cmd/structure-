/* ─── routes/admin.js ────────────────────────────────────────── */
const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

// ── Demo Data ─────────────────────────────────────────────────
const OPD_LOAD = [
  { name: 'General Medicine', registered: 120, seen: 74, waiting: 46, doctors_on: 2, status: 'high'   },
  { name: 'Surgery',          registered: 80,  seen: 51, waiting: 28, doctors_on: 1, status: 'high'   },
  { name: 'Paediatrics',      registered: 100, seen: 63, waiting: 37, doctors_on: 2, status: 'medium' },
  { name: 'Orthopaedics',     registered: 70,  seen: 38, waiting: 32, doctors_on: 1, status: 'high'   },
  { name: 'Gynaecology',      registered: 70,  seen: 48, waiting: 22, doctors_on: 1, status: 'normal' },
  { name: 'ENT',              registered: 50,  seen: 32, waiting: 18, doctors_on: 1, status: 'normal' },
  { name: 'Ophthalmology',    registered: 40,  seen: 26, waiting: 14, doctors_on: 1, status: 'normal' },
  { name: 'Dermatology',      registered: 40,  seen: 28, waiting: 12, doctors_on: 1, status: 'normal' },
];

const WARDS = [
  { ward_name: 'Ward A — Male Medical',   specialty: 'General Medicine', total_beds: 30, occupied: 26, vacant: 4,  critical: 3, discharge_ready: 2 },
  { ward_name: 'Ward B — Female Medical', specialty: 'General Medicine', total_beds: 30, occupied: 22, vacant: 8,  critical: 1, discharge_ready: 3 },
  { ward_name: 'Ward C — Male Surgical',  specialty: 'Surgery',          total_beds: 20, occupied: 18, vacant: 2,  critical: 2, discharge_ready: 1 },
  { ward_name: 'Ward D — Paediatric',     specialty: 'Paediatrics',      total_beds: 20, occupied: 14, vacant: 6,  critical: 0, discharge_ready: 2 },
  { ward_name: 'ICU',                     specialty: 'Critical Care',    total_beds: 10, occupied: 9,  vacant: 1,  critical: 9, discharge_ready: 0 },
];

const DISCHARGE_BLOCKERS = [
  { id: 1, patient_name: 'K. Patil',      ward_name: 'Male Medical',   days_admitted: 5, blocker_reason: 'Lab report awaited',   owner: 'Pathology Lab'   },
  { id: 2, patient_name: 'Rajan Mehta',   ward_name: 'Male Surgical',  days_admitted: 7, blocker_reason: 'Bill not cleared',      owner: 'Billing'         },
  { id: 3, patient_name: 'S. Kulkarni',   ward_name: 'Female Medical', days_admitted: 4, blocker_reason: 'Social work clearance', owner: 'Social Worker'   },
  { id: 4, patient_name: 'A. Sharma',     ward_name: 'Paediatric',     days_admitted: 3, blocker_reason: 'Transport arranged',    owner: 'Ward Sister'     },
  { id: 5, patient_name: 'Meena Tiwari',  ward_name: 'Female Medical', days_admitted: 2, blocker_reason: null,                    owner: 'Dr. R. Sharma'   },
];

const REFERRALS = [
  { id: 1, patient: 'Mohan Kulkarni', from_dept: 'General Medicine', to_dept: 'Cardiology',    referred_at: new Date(Date.now()-3600000).toISOString(),  urgency: 'urgent',  status: 'open'     },
  { id: 2, patient: 'Nirmala Devi',   from_dept: 'General Medicine', to_dept: 'Endocrinology', referred_at: new Date(Date.now()-86400000).toISOString(), urgency: 'routine', status: 'accepted' },
  { id: 3, patient: 'Ravi Shah',      from_dept: 'Medicine',         to_dept: 'Nephrology',    referred_at: new Date(Date.now()-172800000).toISOString(),urgency: 'urgent',  status: 'open'     },
  { id: 4, patient: 'K. Patil',       from_dept: 'Surgery',          to_dept: 'Physiotherapy', referred_at: new Date(Date.now()-259200000).toISOString(),urgency: 'routine', status: 'done'     },
];

const PROGRAMMES = [
  { name: 'RNTCP — TB Treatment',          code: 'RNTCP', target: 200, enrolled: 188, overdue: 12 },
  { name: 'NPCDCS — Diabetes Screening',   code: 'NPCDCS',target: 500, enrolled: 423, overdue: 18 },
  { name: 'Universal Immunisation (UIP)',   code: 'UIP',   target: 300, enrolled: 300, overdue: 0  },
  { name: 'RKSK — Adolescent Health',       code: 'RKSK',  target: 150, enrolled: 89,  overdue: 34 },
  { name: 'PMSSY — Maternal Health',        code: 'PMSSY', target: 120, enrolled: 115, overdue: 5  },
];

const NOTICES = [
  { id: 1, title: 'OPD start time changed to 9 AM from 7 July', is_urgent: true,  from_name: 'Medical Superintendent', created_at: new Date(Date.now()-3600000).toISOString(),  target: 'all'    },
  { id: 2, title: 'Quarterly staff review — 10 July 2 PM',       is_urgent: false, from_name: 'Administration',         created_at: new Date(Date.now()-86400000).toISOString(), target: 'doctors' },
];

const ESCALATIONS = [];

// ── Routes ────────────────────────────────────────────────────

// GET /api/admin/overview
router.get('/overview', (req, res) => {
  const totalReg  = OPD_LOAD.reduce((s,d) => s+d.registered, 0);
  const totalSeen = OPD_LOAD.reduce((s,d) => s+d.seen, 0);
  const totalWait = OPD_LOAD.reduce((s,d) => s+d.waiting, 0);
  const totalBeds = WARDS.reduce((s,w) => s+w.total_beds, 0);
  const occBeds   = WARDS.reduce((s,w) => s+w.occupied, 0);
  res.json({
    opdRegistered: totalReg, opdSeen: totalSeen, opdWaiting: totalWait, avgWaitMins: 28,
    bedsTotal: totalBeds, bedsOccupied: occBeds, bedsVacant: totalBeds - occBeds,
    dischargePending: DISCHARGE_BLOCKERS.filter(d=>d.blocker_reason).length,
    dischargeToday: 4, labTatAvgHrs: 3.2, referralsOpen: REFERRALS.filter(r=>r.status==='open').length, criticalAlerts: 2
  });
});

// GET /api/admin/wait-trend
router.get('/wait-trend', (req, res) => {
  res.json([
    { time:'8 AM',  wait: 10 }, { time:'9 AM',  wait: 25 }, { time:'10 AM', wait: 38 },
    { time:'11 AM', wait: 45 }, { time:'12 PM', wait: 32 }, { time:'1 PM',  wait: 22 }, { time:'Now', wait: 28 }
  ]);
});

// GET /api/admin/patient-flow
router.get('/patient-flow', (req, res) => {
  res.json({ registered: 570, reachedDoctor: 493, consultationComplete: 387, avgWaitBeforeConsult: 28, avgConsultDuration: 6 });
});

// GET /api/admin/opd-load
router.get('/opd-load', (req, res) => res.json(OPD_LOAD));

// GET /api/admin/beds
router.get('/beds', (req, res) => {
  const total  = WARDS.reduce((s,w) => s+w.total_beds, 0);
  const occ    = WARDS.reduce((s,w) => s+w.occupied, 0);
  res.json({ summary: { total, occupied: occ, vacant: total-occ, occupancy_pct: Math.round(occ/total*100) }, wards: WARDS });
});

// GET /api/admin/discharge-blockers
router.get('/discharge-blockers', (req, res) => res.json(DISCHARGE_BLOCKERS));

// POST /api/admin/discharge-blockers/:id/escalate
router.post('/discharge-blockers/:id/escalate', (req, res) => {
  console.log('Escalated blocker', req.params.id);
  res.json({ success: true });
});

// PUT /api/admin/discharge-blockers/:id/resolve
router.put('/discharge-blockers/:id/resolve', (req, res) => {
  const idx = DISCHARGE_BLOCKERS.findIndex(d => d.id == req.params.id);
  if (idx !== -1) DISCHARGE_BLOCKERS.splice(idx, 1);
  res.json({ success: true });
});

// GET /api/admin/lab-status
router.get('/lab-status', (req, res) => res.json([
  { category: 'Biochemistry', total_today: 180, completed: 142, pending: 28, processing: 10, avg_tat_hrs: 2.8 },
  { category: 'Haematology',  total_today: 120, completed: 98,  pending: 14, processing: 8,  avg_tat_hrs: 1.5 },
  { category: 'Microbiology', total_today: 60,  completed: 32,  pending: 20, processing: 8,  avg_tat_hrs: 6.2 },
  { category: 'Radiology',    total_today: 45,  completed: 38,  pending: 5,  processing: 2,  avg_tat_hrs: 1.2 },
]));

// GET /api/admin/referrals
router.get('/referrals', (req, res) => res.json(REFERRALS));

// GET /api/admin/escalations
router.get('/escalations', (req, res) => res.json(ESCALATIONS));

// PUT /api/admin/escalations/:id/resolve
router.put('/escalations/:id/resolve', (req, res) => res.json({ success: true }));

// GET /api/admin/staffing
router.get('/staffing', (req, res) => res.json([
  { name: 'General Medicine', doctors_rostered: 4, doctors_available: 2, patients_per_available_doctor: 23 },
  { name: 'Surgery',          doctors_rostered: 3, doctors_available: 1, patients_per_available_doctor: 28 },
  { name: 'Paediatrics',      doctors_rostered: 3, doctors_available: 2, patients_per_available_doctor: 19 },
  { name: 'Orthopaedics',     doctors_rostered: 2, doctors_available: 1, patients_per_available_doctor: 32 },
]));

// GET /api/admin/programmes
router.get('/programmes', (req, res) => res.json(PROGRAMMES));

// GET /api/admin/notices
router.get('/notices', (req, res) => res.json(NOTICES));

// POST /api/admin/notices
router.post('/notices', (req, res) => {
  const n = { id: Date.now(), from_name: req.user.name, created_at: new Date().toISOString(), ...req.body };
  NOTICES.unshift(n);
  res.status(201).json(n);
});

// DELETE /api/admin/notices/:id
router.delete('/notices/:id', (req, res) => {
  const idx = NOTICES.findIndex(n => n.id == req.params.id);
  if (idx !== -1) NOTICES.splice(idx, 1);
  res.json({ success: true });
});

// GET /api/admin/departments
router.get('/departments', (req, res) => res.json(OPD_LOAD));

// GET /api/admin/doctors
router.get('/doctors', (req, res) => res.json([
  { id: 1, name: 'Dr. Priya Menon',   dept: 'General Medicine', available: true  },
  { id: 2, name: 'Dr. Rajesh Sharma', dept: 'Surgery',          available: true  },
  { id: 3, name: 'Dr. Sunita Patil',  dept: 'Paediatrics',      available: true  },
  { id: 4, name: 'Dr. Arvind Joshi',  dept: 'Orthopaedics',     available: false },
]));

// PUT /api/admin/doctors/:id/availability
router.put('/doctors/:id/availability', (req, res) => res.json({ success: true }));

module.exports = router;
