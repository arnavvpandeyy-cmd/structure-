/* ─── routes/public.js ───────────────────────────────────────── */
/* No auth required — used by homepage and public OPD status    */
const router = require('express').Router();

// Realistic demo data (used when DB is not connected)
const DEMO_DEPARTMENTS = [
  { id: 1, name: 'General Medicine',  code: 'MED',   waiting: 46, seen: 74, registered: 120, doctors_on: 2 },
  { id: 2, name: 'Surgery',           code: 'SURG',  waiting: 28, seen: 51, registered: 80,  doctors_on: 1 },
  { id: 3, name: 'Paediatrics',       code: 'PEDS',  waiting: 37, seen: 63, registered: 100, doctors_on: 2 },
  { id: 4, name: 'Orthopaedics',      code: 'ORTHO', waiting: 32, seen: 38, registered: 70,  doctors_on: 1 },
  { id: 5, name: 'Gynaecology',       code: 'GYN',   waiting: 22, seen: 48, registered: 70,  doctors_on: 1 },
  { id: 6, name: 'ENT',               code: 'ENT',   waiting: 18, seen: 32, registered: 50,  doctors_on: 1 },
  { id: 7, name: 'Ophthalmology',     code: 'OPH',   waiting: 14, seen: 26, registered: 40,  doctors_on: 1 },
  { id: 8, name: 'Dermatology',       code: 'DERM',  waiting: 12, seen: 28, registered: 40,  doctors_on: 1 },
];

const DEMO_QUEUES = {
  1: { // General Medicine
    doctors: [
      { doctor_name: 'Dr. Priya Menon', designation: 'Associate Professor', current_token: 75, tokens_total: 120, tokens_done: 74, est_wait_mins: 18 },
      { doctor_name: 'Dr. A. Desai',    designation: 'Senior Resident',     current_token: 61, tokens_total: 80,  tokens_done: 60, est_wait_mins: 12 },
    ]
  },
  2: { doctors: [{ doctor_name: 'Dr. Rajesh Sharma', designation: 'Senior Resident', current_token: 52, tokens_total: 80, tokens_done: 51, est_wait_mins: 22 }] },
  3: { doctors: [{ doctor_name: 'Dr. Sunita Patil',  designation: 'Asst. Professor', current_token: 64, tokens_total: 100, tokens_done: 63, est_wait_mins: 14 }] },
  4: { doctors: [{ doctor_name: 'Dr. Arvind Joshi',  designation: 'Professor & HOD', current_token: 39, tokens_total: 70,  tokens_done: 38, est_wait_mins: 28 }] },
};

// GET /api/public/opd-status
router.get('/opd-status', (req, res) => {
  const totalRegistered = DEMO_DEPARTMENTS.reduce((s, d) => s + d.registered, 0);
  const totalSeen       = DEMO_DEPARTMENTS.reduce((s, d) => s + d.seen, 0);
  const totalWaiting    = DEMO_DEPARTMENTS.reduce((s, d) => s + d.waiting, 0);
  res.json({
    departments: DEMO_DEPARTMENTS,
    totalRegistered, totalSeen, totalWaiting,
    avgWaitMins: 24,
    hospitalsLive: 1,
    lastUpdated: new Date().toISOString()
  });
});

// GET /api/public/departments
router.get('/departments', (req, res) => {
  res.json(DEMO_DEPARTMENTS);
});

// GET /api/public/departments/:id/queue
router.get('/departments/:id/queue', (req, res) => {
  const id   = parseInt(req.params.id) || 1;
  const dept = DEMO_DEPARTMENTS.find(d => d.id === id) || DEMO_DEPARTMENTS[0];
  const q    = DEMO_QUEUES[id] || DEMO_QUEUES[1];
  res.json({ department: dept, ...q });
});

// GET /api/public/hospitals/:id
router.get('/hospitals/:id', (req, res) => {
  res.json({
    id: 1, name: 'Rajiv Gandhi Government Medical College & Hospital',
    address: 'Thane, Maharashtra', beds: 600, opd_days: 'Mon–Sat', opd_time: '8:00 AM – 2:00 PM'
  });
});

// GET /api/public/doctors
router.get('/doctors', (req, res) => {
  res.json([
    { id: 1, name: 'Dr. Priya Menon',   dept: 'General Medicine', available: true,  wait_mins: 18 },
    { id: 2, name: 'Dr. Rajesh Sharma', dept: 'Surgery',          available: true,  wait_mins: 22 },
    { id: 3, name: 'Dr. Sunita Patil',  dept: 'Paediatrics',      available: true,  wait_mins: 14 },
    { id: 4, name: 'Dr. Arvind Joshi',  dept: 'Orthopaedics',     available: false, wait_mins: 0  },
  ]);
});

module.exports = router;
