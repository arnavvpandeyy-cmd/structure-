-- ============================================================
-- CHIKITSAALYE — DATABASE SCHEMA
-- PostgreSQL 16+
-- Run: psql -U postgres -d chikitsaalye -f db/schema.sql
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. HOSPITALS
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitals (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  short_name     VARCHAR(50),
  district       VARCHAR(100),
  state          VARCHAR(100) DEFAULT 'Maharashtra',
  address        TEXT,
  contact_phone  VARCHAR(20),
  email          VARCHAR(100),
  total_beds     INTEGER DEFAULT 0,
  opd_hours      VARCHAR(100),
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. DEPARTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id           VARCHAR(20) PRIMARY KEY,          -- e.g. 'med', 'surg'
  hospital_id  INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  abbreviation VARCHAR(10),
  floor_info   VARCHAR(100),
  opd_days     VARCHAR(50),                      -- e.g. 'Mon–Sat'
  opd_start    TIME,
  opd_end      TIME,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_hospital ON departments(hospital_id);

-- ============================================================
-- 3. USERS  (authentication table — all roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(150) UNIQUE,
  phone         VARCHAR(15) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('patient','doctor','admin')),
  hospital_id   INTEGER REFERENCES hospitals(id),
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email   ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone   ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role    ON users(role);

-- ============================================================
-- 4. REFRESH TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ============================================================
-- 5. PATIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS patients (
  id           VARCHAR(20) PRIMARY KEY,           -- e.g. 'P-2024-08812'
  user_id      UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  hospital_id  INTEGER NOT NULL REFERENCES hospitals(id),
  name         VARCHAR(150) NOT NULL,
  age          INTEGER,
  gender       VARCHAR(10) CHECK (gender IN ('Male','Female','Other')),
  dob          DATE,
  blood_group  VARCHAR(5),
  phone        VARCHAR(15),
  address      TEXT,
  abha_id      VARCHAR(30),                        -- ABHA / Health ID
  pmjay_id     VARCHAR(30),                        -- PMJAY card number
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_hospital ON patients(hospital_id);
CREATE INDEX IF NOT EXISTS idx_patients_phone    ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_abha     ON patients(abha_id);

-- ============================================================
-- 6. DOCTORS
-- ============================================================
CREATE TABLE IF NOT EXISTS doctors (
  id            VARCHAR(10) PRIMARY KEY,           -- e.g. 'D001'
  user_id       UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  hospital_id   INTEGER NOT NULL REFERENCES hospitals(id),
  dept_id       VARCHAR(20) REFERENCES departments(id),
  name          VARCHAR(150) NOT NULL,
  designation   VARCHAR(100),
  qualification VARCHAR(100),
  mpid          VARCHAR(30),                        -- Medical Practitioner ID
  room          VARCHAR(80),
  schedule      VARCHAR(100),
  opd_days      TEXT[],
  is_available  BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctors_hospital ON doctors(hospital_id);
CREATE INDEX IF NOT EXISTS idx_doctors_dept     ON doctors(dept_id);

-- ============================================================
-- 7. WARDS
-- ============================================================
CREATE TABLE IF NOT EXISTS wards (
  id            SERIAL PRIMARY KEY,
  hospital_id   INTEGER NOT NULL REFERENCES hospitals(id),
  name          VARCHAR(100) NOT NULL,
  specialty     VARCHAR(80),
  total_beds    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. BEDS
-- ============================================================
CREATE TABLE IF NOT EXISTS beds (
  id            SERIAL PRIMARY KEY,
  ward_id       INTEGER NOT NULL REFERENCES wards(id),
  bed_number    VARCHAR(20) NOT NULL,
  status        VARCHAR(20) DEFAULT 'vacant'
                CHECK (status IN ('vacant','occupied','reserved','maintenance')),
  patient_id    VARCHAR(20) REFERENCES patients(id) ON DELETE SET NULL,
  admission_date DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ward_id, bed_number)
);

CREATE INDEX IF NOT EXISTS idx_beds_ward    ON beds(ward_id);
CREATE INDEX IF NOT EXISTS idx_beds_patient ON beds(patient_id);

-- ============================================================
-- 9. QUEUE TOKENS (OPD Queue)
-- ============================================================
CREATE TABLE IF NOT EXISTS queue_tokens (
  id            SERIAL PRIMARY KEY,
  token_number  INTEGER NOT NULL,
  patient_id    VARCHAR(20) NOT NULL REFERENCES patients(id),
  doctor_id     VARCHAR(10) NOT NULL REFERENCES doctors(id),
  dept_id       VARCHAR(20) NOT NULL REFERENCES departments(id),
  hospital_id   INTEGER NOT NULL REFERENCES hospitals(id),
  status        VARCHAR(20) DEFAULT 'waiting'
                CHECK (status IN ('waiting','calling','in-consultation','done','absent','cancelled')),
  chief_complaint TEXT,
  visit_type    VARCHAR(30) DEFAULT 'opd'
                CHECK (visit_type IN ('opd','follow-up','referral','emergency')),
  issued_at     TIMESTAMPTZ DEFAULT NOW(),
  called_at     TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  session_date  DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_tokens_doctor_date  ON queue_tokens(doctor_id, session_date);
CREATE INDEX IF NOT EXISTS idx_tokens_dept_date    ON queue_tokens(dept_id, session_date);
CREATE INDEX IF NOT EXISTS idx_tokens_patient      ON queue_tokens(patient_id);
CREATE INDEX IF NOT EXISTS idx_tokens_status       ON queue_tokens(status);

-- ============================================================
-- 10. APPOINTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    VARCHAR(20) NOT NULL REFERENCES patients(id),
  doctor_id     VARCHAR(10) NOT NULL REFERENCES doctors(id),
  dept_id       VARCHAR(20) NOT NULL REFERENCES departments(id),
  hospital_id   INTEGER NOT NULL REFERENCES hospitals(id),
  appt_date     DATE NOT NULL,
  appt_time     TIME,
  visit_type    VARCHAR(30) DEFAULT 'consultation',
  status        VARCHAR(20) DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','confirmed','completed','cancelled','no-show')),
  token_id      INTEGER REFERENCES queue_tokens(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appt_patient     ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_doctor_date ON appointments(doctor_id, appt_date);
CREATE INDEX IF NOT EXISTS idx_appt_dept        ON appointments(dept_id);

-- ============================================================
-- 11. CONSULTATIONS (Clinical Notes)
-- ============================================================
CREATE TABLE IF NOT EXISTS consultations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        VARCHAR(20) NOT NULL REFERENCES patients(id),
  doctor_id         VARCHAR(10) NOT NULL REFERENCES doctors(id),
  dept_id           VARCHAR(20) REFERENCES departments(id),
  token_id          INTEGER REFERENCES queue_tokens(id),
  visit_date        DATE DEFAULT CURRENT_DATE,
  subjective        TEXT,                           -- Chief complaint
  objective         TEXT,                           -- Examination findings
  assessment        TEXT,                           -- Diagnosis / impression
  plan              TEXT,                           -- Management plan
  diagnosis_icd     VARCHAR(20),                    -- ICD-10 code
  follow_up_date    DATE,
  follow_up_notes   TEXT,
  is_complete       BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consult_patient ON consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consult_doctor  ON consultations(doctor_id);

-- ============================================================
-- 12. PRESCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID REFERENCES consultations(id),
  patient_id      VARCHAR(20) NOT NULL REFERENCES patients(id),
  doctor_id       VARCHAR(10) NOT NULL REFERENCES doctors(id),
  prescribed_date DATE DEFAULT CURRENT_DATE,
  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id               SERIAL PRIMARY KEY,
  prescription_id  UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  drug_name        VARCHAR(150) NOT NULL,
  dose             VARCHAR(80),
  route            VARCHAR(40),                    -- oral, IV, topical
  morning          BOOLEAN DEFAULT FALSE,
  afternoon        BOOLEAN DEFAULT FALSE,
  evening          BOOLEAN DEFAULT FALSE,
  night            BOOLEAN DEFAULT FALSE,
  with_food        BOOLEAN DEFAULT FALSE,
  duration_days    INTEGER,
  quantity         INTEGER,
  instructions     TEXT
);

CREATE INDEX IF NOT EXISTS idx_prescription_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescription_doctor  ON prescriptions(doctor_id);

-- ============================================================
-- 13. LAB ORDERS & REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS lab_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       VARCHAR(20) NOT NULL REFERENCES patients(id),
  ordered_by       VARCHAR(10) NOT NULL REFERENCES doctors(id),
  consultation_id  UUID REFERENCES consultations(id),
  order_date       DATE DEFAULT CURRENT_DATE,
  status           VARCHAR(20) DEFAULT 'ordered'
                   CHECK (status IN ('ordered','sample-collected','processing','ready','critical','cancelled')),
  priority         VARCHAR(10) DEFAULT 'routine' CHECK (priority IN ('routine','urgent','stat')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_tests (
  id              SERIAL PRIMARY KEY,
  order_id        UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  test_name       VARCHAR(150) NOT NULL,
  test_code       VARCHAR(30),
  category        VARCHAR(80),                    -- Haematology, Biochemistry, etc.
  result_value    VARCHAR(200),
  result_unit     VARCHAR(50),
  reference_range VARCHAR(100),
  flag            VARCHAR(10) CHECK (flag IN ('normal','low','high','critical','note',NULL)),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_doctor  ON lab_orders(ordered_by);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status  ON lab_orders(status);

-- ============================================================
-- 14. REFERRALS
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      VARCHAR(20) NOT NULL REFERENCES patients(id),
  from_doctor_id  VARCHAR(10) NOT NULL REFERENCES doctors(id),
  from_dept_id    VARCHAR(20) REFERENCES departments(id),
  to_dept_id      VARCHAR(20) REFERENCES departments(id),
  to_doctor_id    VARCHAR(10) REFERENCES doctors(id),
  urgency         VARCHAR(20) DEFAULT 'routine' CHECK (urgency IN ('routine','urgent','emergency')),
  reason          TEXT,
  status          VARCHAR(20) DEFAULT 'open'
                  CHECK (status IN ('open','accepted','rejected','done','cancelled')),
  response_notes  TEXT,
  referred_at     TIMESTAMPTZ DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referrals_patient    ON referrals(patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_from_dept  ON referrals(from_dept_id);
CREATE INDEX IF NOT EXISTS idx_referrals_to_dept    ON referrals(to_dept_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status     ON referrals(status);

-- ============================================================
-- 15. PATIENT TASKS / FOLLOW-UP ACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_tasks (
  id              SERIAL PRIMARY KEY,
  patient_id      VARCHAR(20) NOT NULL REFERENCES patients(id),
  created_by      VARCHAR(10) REFERENCES doctors(id),
  consultation_id UUID REFERENCES consultations(id),
  title           VARCHAR(300) NOT NULL,
  due_date        DATE,
  priority        VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  is_done         BOOLEAN DEFAULT FALSE,
  done_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_patient ON patient_tasks(patient_id);

-- ============================================================
-- 16. NOTICES / MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS notices (
  id            SERIAL PRIMARY KEY,
  hospital_id   INTEGER NOT NULL REFERENCES hospitals(id),
  from_role     VARCHAR(20),                       -- 'admin','doctor','system'
  from_name     VARCHAR(150),
  target        VARCHAR(30) DEFAULT 'all'
                CHECK (target IN ('all','patients','doctors','staff','dept')),
  target_dept   VARCHAR(20) REFERENCES departments(id),
  title         TEXT NOT NULL,
  body          TEXT,
  is_urgent     BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id  INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(notice_id, user_id)
);

-- ============================================================
-- 17. PATIENT DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_documents (
  id           SERIAL PRIMARY KEY,
  patient_id   VARCHAR(20) NOT NULL REFERENCES patients(id),
  name         VARCHAR(200) NOT NULL,
  file_path    VARCHAR(500),
  file_type    VARCHAR(10) CHECK (file_type IN ('pdf','image','other')),
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 18. BILLS
-- ============================================================
CREATE TABLE IF NOT EXISTS bills (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   VARCHAR(20) NOT NULL REFERENCES patients(id),
  hospital_id  INTEGER NOT NULL REFERENCES hospitals(id),
  description  TEXT NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  is_paid      BOOLEAN DEFAULT FALSE,
  payment_date DATE,
  pmjay_covered BOOLEAN DEFAULT FALSE,
  waiver_amount NUMERIC(10,2) DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills(patient_id);

-- ============================================================
-- 19. PROGRAMME ENROLMENTS (TB, NCD, RMNCH, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS programmes (
  id           SERIAL PRIMARY KEY,
  hospital_id  INTEGER NOT NULL REFERENCES hospitals(id),
  name         VARCHAR(100) NOT NULL,
  code         VARCHAR(20),
  description  TEXT,
  target       INTEGER DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS programme_enrolments (
  id              SERIAL PRIMARY KEY,
  programme_id    INTEGER NOT NULL REFERENCES programmes(id),
  patient_id      VARCHAR(20) NOT NULL REFERENCES patients(id),
  enrolled_by     VARCHAR(10) REFERENCES doctors(id),
  enrolment_date  DATE DEFAULT CURRENT_DATE,
  status          VARCHAR(20) DEFAULT 'active'
                  CHECK (status IN ('active','completed','defaulted','transferred','died')),
  next_visit_date DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(programme_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_enrolments_patient ON programme_enrolments(patient_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_programme ON programme_enrolments(programme_id);

-- ============================================================
-- 20. ESCALATIONS (admin operational queue)
-- ============================================================
CREATE TABLE IF NOT EXISTS escalations (
  id           SERIAL PRIMARY KEY,
  hospital_id  INTEGER NOT NULL REFERENCES hospitals(id),
  dept_id      VARCHAR(20) REFERENCES departments(id),
  patient_id   VARCHAR(20) REFERENCES patients(id),
  type         VARCHAR(50),                        -- 'discharge-blocker','opd-overload', etc.
  description  TEXT NOT NULL,
  severity     VARCHAR(20) DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  owner        VARCHAR(150),
  status       VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','in-progress','resolved')),
  resolved_by  UUID REFERENCES users(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalations_hospital ON escalations(hospital_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status   ON escalations(status);

-- ============================================================
-- Helper views
-- ============================================================

-- Live queue summary per doctor (used by public API + patient dashboard)
CREATE OR REPLACE VIEW v_live_queue AS
SELECT
  qt.doctor_id,
  qt.dept_id,
  qt.hospital_id,
  qt.session_date,
  COUNT(*)                                                        AS total_tokens,
  COUNT(*) FILTER (WHERE qt.status = 'done')                     AS tokens_done,
  COUNT(*) FILTER (WHERE qt.status = 'waiting')                  AS tokens_waiting,
  MAX(qt.token_number) FILTER (WHERE qt.status = 'done')         AS current_token,
  MIN(qt.token_number) FILTER (WHERE qt.status = 'waiting')      AS next_token
FROM queue_tokens qt
WHERE qt.session_date = CURRENT_DATE
GROUP BY qt.doctor_id, qt.dept_id, qt.hospital_id, qt.session_date;

-- Bed occupancy per ward
CREATE OR REPLACE VIEW v_ward_occupancy AS
SELECT
  w.id         AS ward_id,
  w.hospital_id,
  w.name       AS ward_name,
  w.specialty,
  w.total_beds,
  COUNT(b.id) FILTER (WHERE b.status = 'occupied')   AS occupied,
  COUNT(b.id) FILTER (WHERE b.status = 'vacant')     AS vacant,
  COUNT(b.id) FILTER (WHERE b.status = 'reserved')   AS reserved
FROM wards w
LEFT JOIN beds b ON b.ward_id = w.id
GROUP BY w.id;

-- Discharge blockers view
CREATE OR REPLACE VIEW v_discharge_blockers AS
SELECT
  p.id          AS patient_id,
  p.name        AS patient_name,
  b.bed_number,
  w.name        AS ward_name,
  b.admission_date,
  DATE_PART('day', NOW() - b.admission_date::TIMESTAMPTZ) AS days_admitted,
  e.description AS blocker_reason,
  e.owner,
  e.created_at  AS blocked_since
FROM escalations e
JOIN patients p     ON p.id = e.patient_id
JOIN beds b         ON b.patient_id = p.id AND b.status = 'occupied'
JOIN wards w        ON w.id = b.ward_id
WHERE e.type = 'discharge-blocker'
  AND e.status IN ('open','in-progress');

-- Active prescriptions with items
CREATE OR REPLACE VIEW v_active_prescriptions AS
SELECT
  pr.id              AS prescription_id,
  pr.patient_id,
  pr.prescribed_date,
  pi.drug_name,
  pi.dose,
  pi.morning,
  pi.afternoon,
  pi.evening,
  pi.night,
  pi.with_food,
  pi.duration_days,
  pi.instructions,
  d.name             AS doctor_name,
  dept.name          AS dept_name
FROM prescriptions pr
JOIN prescription_items pi ON pi.prescription_id = pr.id
JOIN doctors d             ON d.id = pr.doctor_id
JOIN departments dept      ON dept.id = d.dept_id
WHERE pr.is_active = TRUE;

COMMENT ON TABLE hospitals    IS 'Master hospital registry';
COMMENT ON TABLE departments  IS 'OPD departments per hospital';
COMMENT ON TABLE users        IS 'Authentication — all roles share this table';
COMMENT ON TABLE patients     IS 'Patient profiles, linked to users';
COMMENT ON TABLE doctors      IS 'Doctor profiles, linked to users';
COMMENT ON TABLE queue_tokens IS 'OPD token queue per doctor per day';
COMMENT ON TABLE consultations IS 'SOAP clinical notes per visit';
COMMENT ON TABLE lab_orders   IS 'Lab test orders, with child tests in lab_tests';
COMMENT ON TABLE referrals    IS 'Inter-departmental referrals';
COMMENT ON TABLE escalations  IS 'Admin operational alerts and discharge blockers';
