-- ============================================================
--  CHIKITSAALYE — PostgreSQL Database Setup
--  Run this ONCE after creating the database:
--    createdb chikitsaalye
--    psql chikitsaalye < setup-database.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── HOSPITALS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hospitals (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  code         TEXT UNIQUE NOT NULL,
  address      TEXT,
  district     TEXT,
  state        TEXT DEFAULT 'Maharashtra',
  beds_total   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO hospitals (name, code, address, district, beds_total) VALUES
('Rajiv Gandhi Govt. Medical College & Hospital', 'RGGMCH', 'Thane, Maharashtra', 'Thane', 600)
ON CONFLICT (code) DO NOTHING;

-- ── DEPARTMENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id           SERIAL PRIMARY KEY,
  hospital_id  INT REFERENCES hospitals(id),
  name         TEXT NOT NULL,
  code         TEXT NOT NULL,
  opd_days     TEXT DEFAULT 'Mon-Sat',
  opd_time     TEXT DEFAULT '08:00-14:00'
);

INSERT INTO departments (hospital_id, name, code) VALUES
(1,'General Medicine','MED'),(1,'Surgery','SURG'),(1,'Paediatrics','PEDS'),
(1,'Orthopaedics','ORTHO'),(1,'Gynaecology','GYN'),(1,'ENT','ENT'),
(1,'Ophthalmology','OPH'),(1,'Dermatology','DERM'),(1,'Cardiology','CARD'),
(1,'Neurology','NEURO'),(1,'Psychiatry','PSY'),(1,'Endocrinology','ENDO')
ON CONFLICT DO NOTHING;

-- ── USERS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  phone          TEXT UNIQUE NOT NULL,
  email          TEXT UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL,
  role           TEXT CHECK(role IN ('patient','doctor','admin','nurse','lab')) NOT NULL,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Default password hash = 'Test@1234' (bcrypt, 10 rounds)
INSERT INTO users (phone, email, password_hash, name, role) VALUES
('9876543210','patient@demo.com','$2a$10$9Vc7LLSQ9YK1Qvw5RQT8POjGy5LjXjGr0QgBxXKn8NUiWuO5JwNm','Ramesh Subramaniam','patient'),
('9876543211','doctor@demo.com', '$2a$10$9Vc7LLSQ9YK1Qvw5RQT8POjGy5LjXjGr0QgBxXKn8NUiWuO5JwNm','Dr. Priya Menon','doctor'),
('9876543212','admin@demo.com',  '$2a$10$9Vc7LLSQ9YK1Qvw5RQT8POjGy5LjXjGr0QgBxXKn8NUiWuO5JwNm','Dr. M. Sawant','admin')
ON CONFLICT (phone) DO NOTHING;

-- ── PATIENT PROFILES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_profiles (
  id           SERIAL PRIMARY KEY,
  user_id      INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  abha_id      TEXT,
  pmjay_id     TEXT,
  dob          DATE,
  gender       TEXT CHECK(gender IN ('Male','Female','Other')),
  blood_group  TEXT,
  address      TEXT,
  emergency_contact TEXT,
  allergies    TEXT[],
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO patient_profiles (user_id, abha_id, pmjay_id, dob, gender, blood_group, address)
SELECT id,'91-1234-5678-9012','MH-2024-PM-44871','1978-03-12','Male','B+','42 Vasant Nagar, Thane West'
FROM users WHERE phone='9876543210'
ON CONFLICT (user_id) DO NOTHING;

-- ── DOCTOR PROFILES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctor_profiles (
  id              SERIAL PRIMARY KEY,
  user_id         INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  hospital_id     INT REFERENCES hospitals(id),
  department_id   INT REFERENCES departments(id),
  designation     TEXT,
  registration_no TEXT,
  specialisation  TEXT,
  available       BOOLEAN DEFAULT TRUE
);

INSERT INTO doctor_profiles (user_id, hospital_id, department_id, designation, specialisation)
SELECT u.id, 1, d.id, 'Associate Professor', 'Internal Medicine'
FROM users u, departments d WHERE u.phone='9876543211' AND d.code='MED'
ON CONFLICT (user_id) DO NOTHING;

-- ── WARDS & BEDS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wards (
  id          SERIAL PRIMARY KEY,
  hospital_id INT REFERENCES hospitals(id),
  name        TEXT NOT NULL,
  specialty   TEXT,
  total_beds  INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS beds (
  id         SERIAL PRIMARY KEY,
  ward_id    INT REFERENCES wards(id),
  bed_number TEXT NOT NULL,
  status     TEXT CHECK(status IN ('vacant','occupied','discharge_ready','maintenance')) DEFAULT 'vacant',
  patient_id INT REFERENCES patient_profiles(id),
  admitted_at TIMESTAMPTZ
);

INSERT INTO wards (hospital_id, name, specialty, total_beds) VALUES
(1,'Ward A — Male Medical','General Medicine',30),
(1,'Ward B — Female Medical','General Medicine',30),
(1,'Ward C — Male Surgical','Surgery',20),
(1,'Ward D — Paediatric','Paediatrics',20),
(1,'ICU','Critical Care',10)
ON CONFLICT DO NOTHING;

-- ── OPD TOKENS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opd_sessions (
  id            SERIAL PRIMARY KEY,
  hospital_id   INT REFERENCES hospitals(id),
  department_id INT REFERENCES departments(id),
  doctor_id     INT REFERENCES doctor_profiles(id),
  session_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  tokens_total  INT DEFAULT 120,
  tokens_issued INT DEFAULT 0,
  tokens_done   INT DEFAULT 0,
  status        TEXT DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS opd_tokens (
  id             SERIAL PRIMARY KEY,
  session_id     INT REFERENCES opd_sessions(id),
  patient_id     INT REFERENCES patient_profiles(id),
  token_number   INT NOT NULL,
  status         TEXT DEFAULT 'waiting',
  issued_at      TIMESTAMPTZ DEFAULT NOW(),
  called_at      TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  chief_complaint TEXT
);

-- ── CONSULTATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultations (
  id           SERIAL PRIMARY KEY,
  token_id     INT REFERENCES opd_tokens(id),
  doctor_id    INT REFERENCES doctor_profiles(id),
  patient_id   INT REFERENCES patient_profiles(id),
  chief_complaint TEXT,
  hopi         TEXT,
  examination  TEXT,
  assessment   TEXT,
  plan         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── PRESCRIPTIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescriptions (
  id              SERIAL PRIMARY KEY,
  consultation_id INT REFERENCES consultations(id),
  patient_id      INT REFERENCES patient_profiles(id),
  doctor_id       INT REFERENCES doctor_profiles(id),
  issued_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id              SERIAL PRIMARY KEY,
  prescription_id INT REFERENCES prescriptions(id) ON DELETE CASCADE,
  drug_name       TEXT NOT NULL,
  dose            TEXT,
  frequency       TEXT,
  duration_days   INT,
  with_food       BOOLEAN DEFAULT FALSE,
  morning         BOOLEAN DEFAULT FALSE,
  afternoon       BOOLEAN DEFAULT FALSE,
  night           BOOLEAN DEFAULT FALSE,
  instructions    TEXT
);

-- ── LAB ORDERS & REPORTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_orders (
  id              SERIAL PRIMARY KEY,
  consultation_id INT REFERENCES consultations(id),
  patient_id      INT REFERENCES patient_profiles(id),
  ordered_by      INT REFERENCES doctor_profiles(id),
  ordered_at      TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS lab_tests (
  id           SERIAL PRIMARY KEY,
  order_id     INT REFERENCES lab_orders(id) ON DELETE CASCADE,
  test_name    TEXT NOT NULL,
  category     TEXT,
  result_value TEXT,
  result_unit  TEXT,
  reference_range TEXT,
  flag         TEXT CHECK(flag IN ('normal','high','low','critical','note')),
  completed_at TIMESTAMPTZ
);

-- ── REFERRALS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id              SERIAL PRIMARY KEY,
  patient_id      INT REFERENCES patient_profiles(id),
  from_doctor_id  INT REFERENCES doctor_profiles(id),
  from_dept_id    INT REFERENCES departments(id),
  to_dept_id      INT REFERENCES departments(id),
  to_hospital_id  INT REFERENCES hospitals(id),
  reason          TEXT,
  urgency         TEXT DEFAULT 'routine',
  status          TEXT DEFAULT 'open',
  referred_at     TIMESTAMPTZ DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ
);

-- ── DISCHARGE ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discharge_records (
  id             SERIAL PRIMARY KEY,
  patient_id     INT REFERENCES patient_profiles(id),
  bed_id         INT REFERENCES beds(id),
  admitted_at    TIMESTAMPTZ,
  discharged_at  TIMESTAMPTZ,
  diagnosis      TEXT,
  summary        TEXT,
  status         TEXT DEFAULT 'admitted',
  blocker_reason TEXT
);

-- ── APPOINTMENTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id          SERIAL PRIMARY KEY,
  patient_id  INT REFERENCES patient_profiles(id),
  doctor_id   INT REFERENCES doctor_profiles(id),
  dept_id     INT REFERENCES departments(id),
  appt_date   DATE NOT NULL,
  appt_time   TIME,
  visit_type  TEXT DEFAULT 'OPD',
  status      TEXT DEFAULT 'scheduled',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── NOTICES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notices (
  id           SERIAL PRIMARY KEY,
  hospital_id  INT REFERENCES hospitals(id),
  title        TEXT NOT NULL,
  body         TEXT,
  target       TEXT DEFAULT 'all',
  is_urgent    BOOLEAN DEFAULT FALSE,
  from_user_id INT REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ
);

-- ── TASKS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_tasks (
  id          SERIAL PRIMARY KEY,
  patient_id  INT REFERENCES patient_profiles(id),
  title       TEXT NOT NULL,
  priority    TEXT DEFAULT 'medium',
  created_by  TEXT,
  due_date    DATE,
  is_done     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ALERTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_alerts (
  id         SERIAL PRIMARY KEY,
  patient_id INT REFERENCES patient_profiles(id),
  doctor_id  INT REFERENCES doctor_profiles(id),
  message    TEXT NOT NULL,
  severity   TEXT DEFAULT 'info',
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── PROGRAMME TRACKING ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health_programmes (
  id          SERIAL PRIMARY KEY,
  hospital_id INT REFERENCES hospitals(id),
  name        TEXT NOT NULL,
  code        TEXT,
  target      INT DEFAULT 0,
  enrolled    INT DEFAULT 0,
  overdue     INT DEFAULT 0,
  year        INT DEFAULT EXTRACT(YEAR FROM NOW())::INT
);

INSERT INTO health_programmes (hospital_id, name, code, target, enrolled, overdue) VALUES
(1,'RNTCP — TB Treatment','RNTCP',200,188,12),
(1,'NPCDCS — Diabetes Screening','NPCDCS',500,423,18),
(1,'Universal Immunisation (UIP)','UIP',300,300,0),
(1,'RKSK — Adolescent Health','RKSK',150,89,34),
(1,'PMSSY — Maternal Health','PMSSY',120,115,5)
ON CONFLICT DO NOTHING;

-- ── DONE ──────────────────────────────────────────────────────
SELECT 'Database setup complete!' AS status;
SELECT 'Tables created: ' || count(*)::TEXT AS tables FROM information_schema.tables WHERE table_schema='public';
