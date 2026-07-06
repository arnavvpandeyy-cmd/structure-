# Chikitsaalye Backend API

REST API for the Chikitsaalye government hospital coordination platform.  
**Node.js 20 + Express 4 + PostgreSQL 16 + Socket.IO**

---

## Quick Start

### 1. Install PostgreSQL

Download from https://www.postgresql.org/download/windows/  
Default: user `postgres`, port `5432`

### 2. Create the database

```powershell
psql -U postgres -c "CREATE DATABASE chikitsaalye;"
psql -U postgres -d chikitsaalye -f db/schema.sql
psql -U postgres -d chikitsaalye -f db/seed.sql
```

### 3. Configure environment

```powershell
Copy-Item .env.example .env
notepad .env
```

Edit `.env` — minimum required:
```
DB_PASSWORD=your_postgres_password
JWT_ACCESS_SECRET=<64-char random hex>
JWT_REFRESH_SECRET=<64-char random hex>
```

Generate secrets:
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Install and run

```powershell
npm install
npm run dev     # development (with nodemon)
npm start       # production
```

API will be live at: **http://localhost:5000**  
Health check: http://localhost:5000/health

---

## Demo Accounts

| Role    | Email / Phone     | Password   |
|---------|------------------|------------|
| Patient | `9876543210`     | `Test@1234` |
| Doctor  | `9876543211`     | `Test@1234` |
| Admin   | `9876543212`     | `Test@1234` |

---

## API Overview

### Authentication — `/api/auth`
```
POST /api/auth/login             — Login → returns JWT
POST /api/auth/refresh           — Refresh access token
POST /api/auth/logout            — Revoke refresh tokens
POST /api/auth/change-password   — Change password
```

**Login request:**
```json
{ "identifier": "9876543210", "password": "Test@1234" }
```

**Login response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "role": "patient", "displayName": "Ramesh Subramaniam" }
}
```

**All authenticated requests** — add header:
```
Authorization: Bearer <accessToken>
```

---

### Public (no auth) — `/api/public`
```
GET /api/public/hospitals/:id
GET /api/public/departments?hospitalId=1
GET /api/public/departments/:id/queue
GET /api/public/doctors?dept=med&hospitalId=1
GET /api/public/opd-status?hospitalId=1
```

---

### Patient — `/api/patient`
```
GET    /dashboard
GET    /queue-status
GET    /appointments
POST   /appointments
DELETE /appointments/:id
GET    /reports
GET    /reports/:id
GET    /prescriptions
GET    /tasks
PUT    /tasks/:id/complete
GET    /bills
GET    /messages
PUT    /messages/:id/read
GET    /documents
GET    /health-record
GET    /profile
PUT    /profile
```

---

### Doctor — `/api/doctor`
```
GET    /dashboard
GET    /queue
POST   /queue/:tokenId/call
POST   /queue/:tokenId/complete
POST   /queue/:tokenId/skip
GET    /patients/:id
POST   /consultation
PUT    /consultation/:id
POST   /prescription
POST   /lab-order
PUT    /lab-order/:id/result
POST   /referral
PUT    /referral/:id/respond
GET    /alerts
PUT    /alerts/:id/resolve
GET    /tasks
POST   /tasks
PUT    /tasks/:id
GET    /rounds
GET    /rounds/:patientId
PUT    /rounds/:patientId/vitals
GET    /discharge
POST   /discharge/initiate
POST   /discharge/:id/summary
GET    /workload
GET    /programmes
GET    /messages
```

---

### Admin — `/api/admin`
```
GET    /overview
GET    /wait-trend
GET    /patient-flow
GET    /opd-load
GET    /beds
PUT    /beds/:id/status
GET    /discharge-blockers
POST   /discharge-blockers/:id/escalate
PUT    /discharge-blockers/:id/resolve
GET    /lab-status
GET    /referrals
GET    /escalations
PUT    /escalations/:id/resolve
GET    /staffing
GET    /programmes
GET    /notices
POST   /notices
DELETE /notices/:id
GET    /departments
GET    /doctors
PUT    /doctors/:id/availability
```

---

## Real-Time (Socket.IO)

Connect to `ws://localhost:5000` and join rooms:

```javascript
const socket = io('http://localhost:5000');

// Join a department queue room (patient kiosk)
socket.emit('join:dept', { deptId: 'med' });
socket.on('queue:updated', (data) => {
  // data: { type: 'token_called', token: 75, doctorId: 'D001' }
});

// Join your personal patient room
socket.emit('join:patient', { patientId: 'P-2024-08812' });
socket.on('patient:notification', (data) => {
  // data: { type: 'your_token_called', token: 76, room: 'Room 103' }
});

// Admin dashboard live metrics
socket.emit('join:admin', { hospitalId: 1 });
socket.on('admin:metrics', (data) => {
  // data: { type: 'escalation_resolved', escalationId: '...' }
});
```

---

## Database

20 tables + 4 views:

| Table | Purpose |
|-------|---------|
| `hospitals` | Hospital master |
| `departments` | OPD departments |
| `users` | Authentication (all roles) |
| `refresh_tokens` | Secure token storage |
| `patients` | Patient profiles |
| `doctors` | Doctor profiles |
| `wards` | Hospital wards |
| `beds` | Individual beds with status |
| `queue_tokens` | OPD tokens per session |
| `appointments` | Appointment bookings |
| `consultations` | SOAP clinical notes |
| `prescriptions` + `prescription_items` | Medications |
| `lab_orders` + `lab_tests` | Lab orders and results |
| `referrals` | Inter-dept referrals |
| `patient_tasks` | Follow-up tasks |
| `notices` + `notice_reads` | Hospital messages |
| `patient_documents` | Uploaded documents |
| `bills` | Patient billing |
| `programmes` + `programme_enrolments` | NHM programmes |
| `escalations` | Discharge blockers + OPD alerts |

**Views:**
- `v_live_queue` — Real-time queue state per doctor per day
- `v_ward_occupancy` — Bed counts per ward
- `v_discharge_blockers` — Patients blocked from discharge
- `v_active_prescriptions` — Current medications

---

## Connecting the Frontend

In your HTML JS files, replace `CHIKITSAALYE_DATA` reads with API calls:

```javascript
// Login
const res = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: '9876543210', password: 'Test@1234' })
});
const { accessToken, user } = await res.json();
localStorage.setItem('token', accessToken);

// Authenticated request
const dashboard = await fetch('http://localhost:5000/api/patient/dashboard', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
});
const data = await dashboard.json();
```

---

## Project Structure

```
backend/
├── server.js               # Entry — Express + Socket.IO
├── package.json
├── .env.example
├── config/
│   ├── db.js               # PostgreSQL pool
│   └── socket.js           # Socket.IO rooms + emitters
├── middleware/
│   ├── auth.js             # JWT verify
│   ├── roles.js            # Role-based access
│   └── errorHandler.js     # Global error + asyncHandler
├── routes/
│   ├── auth.js
│   ├── public.js
│   ├── patient.js
│   ├── doctor.js
│   └── admin.js
├── controllers/
│   ├── authController.js
│   ├── publicController.js
│   ├── patientController.js
│   ├── doctorController.js
│   └── adminController.js
├── db/
│   ├── schema.sql          # All 20 tables + 4 views
│   └── seed.sql            # Demo data (matches frontend mock)
└── utils/
    ├── sms.js              # MSG91 SMS (dev: console log)
    └── pagination.js       # Offset pagination helpers
```
