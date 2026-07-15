-- ============================================================
-- CHIKITSAALYE — SEED DATA
-- Matches mock-data.js so the frontend works immediately.
-- Run AFTER schema.sql:
--   psql -U postgres -d chikitsaalye -f db/seed.sql
-- ============================================================

-- ── 1. Hospital ───────────────────────────────────────────────
INSERT INTO hospitals (id, name, short_name, district, state, address, contact_phone, total_beds, opd_hours)
VALUES (1, 'Rajiv Gandhi Government Medical College & Hospital', 'RGGMCH',
        'Thane, Maharashtra', 'Maharashtra',
        'Civil Hospital Road, Thane (W), Maharashtra – 400601',
        '022-2534-8800', 450, '8:00 AM – 2:00 PM (Mon–Sat)')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Departments ────────────────────────────────────────────
INSERT INTO departments (id, hospital_id, name, abbreviation, floor_info, opd_days, opd_start, opd_end) VALUES
  ('med',   1, 'General Medicine',    'MED',  '1st Floor, OPD Block A',     'Mon–Sat', '08:00','14:00'),
  ('surg',  1, 'General Surgery',     'SURG', '1st Floor, OPD Block B',     'Mon–Fri', '09:00','12:00'),
  ('peds',  1, 'Paediatrics',         'PEDS', '2nd Floor, OPD Block A',     'Mon–Sat', '08:00','13:00'),
  ('obg',   1, 'Obstetrics & Gynae',  'OBG',  '2nd Floor, OPD Block B',     'Tue/Thu/Sat', '09:00','13:00'),
  ('ortho', 1, 'Orthopaedics',        'ORTH', 'Ground Floor, OPD Block C',  'Mon/Wed/Fri', '09:00','12:00'),
  ('ent',   1, 'ENT',                 'ENT',  'Ground Floor, OPD Block A',  'Mon–Fri', '09:00','13:00'),
  ('derm',  1, 'Dermatology',         'DERM', '3rd Floor, OPD Block A',     'Mon–Sat', '09:00','13:00'),
  ('card',  1, 'Cardiology',          'CARD', '3rd Floor, OPD Block B',     'Mon–Fri', '09:00','13:00'),
  ('ophth', 1, 'Ophthalmology',       'OPTH', 'Ground Floor, OPD Block B',  'Mon–Sat', '09:00','13:00'),
  ('psych', 1, 'Psychiatry',          'PSYC', '4th Floor, OPD Block A',     'Mon–Fri', '10:00','13:00')
ON CONFLICT (id) DO NOTHING;

-- ── 3. Users (password = 'Test@1234' for all demo accounts) ──
-- bcrypt hash of 'Test@1234' with 10 rounds
INSERT INTO users (id, email, phone, password_hash, role, hospital_id) VALUES
  ('a1b2c3d4-0001-0001-0001-000000000001', 'patient@demo.in',    '9876543210', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHG', 'patient', 1),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'doctor@demo.in',     '9876543211', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHG', 'doctor',  1),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'admin@demo.in',      '9876543212', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHG', 'admin',   1),
  ('a1b2c3d4-0004-0004-0004-000000000004', 'doctor2@demo.in',    '9876543213', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHG', 'doctor',  1),
  ('a1b2c3d4-0005-0005-0005-000000000005', 'doctor3@demo.in',    '9876543214', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHG', 'doctor',  1)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Patients ───────────────────────────────────────────────
INSERT INTO patients (id, user_id, hospital_id, name, age, gender, dob, blood_group, phone, address, abha_id) VALUES
  ('P-2024-08812', 'a1b2c3d4-0001-0001-0001-000000000001', 1,
   'Ramesh Subramaniam', 47, 'Male', '1977-03-12', 'B+',
   '9876543210', '47, Shivaji Nagar, Kalwa, Thane – 400605', '43-1234-5678-9012'),
  ('P-2024-05231', NULL, 1, 'Kamla Devi',      58, 'Female', '1966-05-10', 'O+', '9812345001', 'Nashik Road, Nashik', NULL),
  ('P-2024-06102', NULL, 1, 'Mohan Verma',     68, 'Male',   '1956-08-21', 'A+', '9812345002', 'Bhiwandi, Thane',     NULL),
  ('P-2024-07788', NULL, 1, 'Kamla Singh',     54, 'Female', '1970-01-14', 'B+', '9812345003', 'Kalyan, Thane',       NULL),
  ('P-2024-07901', NULL, 1, 'Pradeep Naik',    44, 'Male',   '1980-09-05', 'AB+','9812345004', 'Vasai, Palghar',      NULL),
  ('P-2024-08001', NULL, 1, 'Ranjana Bhosle',  38, 'Female', '1986-03-22', 'O-', '9812345005', 'Dombivli, Thane',     NULL),
  ('P-2024-08102', NULL, 1, 'Suresh Kadam',    71, 'Male',   '1953-07-18', 'A-', '9812345006', 'Ulhasnagar, Thane',   NULL),
  ('P-2024-08203', NULL, 1, 'Safia Shaikh',    29, 'Female', '1995-11-30', 'B-', '9812345007', 'Mumbra, Thane',       NULL)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Doctors ────────────────────────────────────────────────
INSERT INTO doctors (id, user_id, hospital_id, dept_id, name, designation, mpid, room, schedule, opd_days, is_available) VALUES
  ('D001', 'a1b2c3d4-0002-0002-0002-000000000002', 1, 'med',
   'Dr. Priya Menon', 'Associate Professor', 'MH-REG-20145678',
   'Room 103, OPD Block A', 'Mon–Sat, 9 AM – 1 PM',
   ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'], TRUE),
  ('D002', 'a1b2c3d4-0004-0004-0004-000000000004', 1, 'surg',
   'Dr. Rajesh Kumar Sharma', 'Senior Resident', 'MH-REG-20149901',
   'Room 112, OPD Block B', 'Mon–Fri, 9 AM – 12 PM',
   ARRAY['Mon','Tue','Wed','Thu','Fri'], TRUE),
  ('D003', 'a1b2c3d4-0005-0005-0005-000000000005', 1, 'peds',
   'Dr. Sunita Patil', 'Assistant Professor', 'MH-REG-20152233',
   'Room 201, OPD Block A', 'Mon–Sat, 8 AM – 1 PM',
   ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'], TRUE),
  ('D004', NULL, 1, 'obg',
   'Dr. Meena Iyer', 'Associate Professor', 'MH-REG-20134456',
   'Room 214, OPD Block B', 'Tue/Thu/Sat, 9 AM – 1 PM',
   ARRAY['Tue','Thu','Sat'], FALSE),
  ('D005', NULL, 1, 'ortho',
   'Dr. Arvind Joshi', 'Professor & HOD', 'MH-REG-20118899',
   'Room G-04, OPD Block C', 'Mon/Wed/Fri, 9 AM – 12 PM',
   ARRAY['Mon','Wed','Fri'], TRUE),
  ('D006', NULL, 1, 'card',
   'Dr. Anil Bhatt', 'Associate Professor', 'MH-REG-20161122',
   'Room 301, OPD Block B', 'Mon–Fri, 9 AM – 1 PM',
   ARRAY['Mon','Tue','Wed','Thu','Fri'], TRUE),
  ('D007', NULL, 1, 'derm',
   'Dr. Smita Raut', 'Senior Resident', 'MH-REG-20193344',
   'Room 312, OPD Block A', 'Mon–Sat, 9 AM – 1 PM',
   ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'], TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── 6. Queue Tokens (today) ───────────────────────────────────
INSERT INTO queue_tokens (token_number, patient_id, doctor_id, dept_id, hospital_id, status, chief_complaint, session_date) VALUES
  (72, 'P-2024-05231', 'D001', 'med', 1, 'done',            'Hypertension review', CURRENT_DATE),
  (73, 'P-2024-06102', 'D001', 'med', 1, 'done',            'Fever 3 days',        CURRENT_DATE),
  (74, 'P-2024-07788', 'D001', 'med', 1, 'done',            'Cough',               CURRENT_DATE),
  (75, 'P-2024-07901', 'D001', 'med', 1, 'in-consultation', 'Chest pain',          CURRENT_DATE),
  (76, 'P-2024-08812', 'D001', 'med', 1, 'waiting',         'Diabetes follow-up',  CURRENT_DATE),
  (77, 'P-2024-08001', 'D001', 'med', 1, 'waiting',         'BP 160/100',          CURRENT_DATE),
  (78, 'P-2024-08102', 'D001', 'med', 1, 'waiting',         'Breathlessness',      CURRENT_DATE)
ON CONFLICT DO NOTHING;

-- ── 7. Appointments ───────────────────────────────────────────
INSERT INTO appointments (id, patient_id, doctor_id, dept_id, hospital_id, appt_date, appt_time, visit_type, status) VALUES
  ('b0000001-0001-0001-0001-000000000001', 'P-2024-08812', 'D001', 'med',  1, CURRENT_DATE,      '11:30', 'follow-up',   'confirmed'),
  ('b0000001-0002-0002-0002-000000000002', 'P-2024-08812', 'D006', 'card', 1, CURRENT_DATE + 13, '10:00', 'consultation','scheduled'),
  ('b0000001-0003-0003-0003-000000000003', 'P-2024-08812', 'D007', 'derm', 1, '2026-05-12',       '09:00', 'consultation','completed'),
  ('b0000001-0004-0004-0004-000000000004', 'P-2024-08812', 'D005', 'ortho',1, '2026-03-19',       '10:30', 'opd',         'completed')
ON CONFLICT (id) DO NOTHING;

-- ── 8. Lab Orders & Tests ─────────────────────────────────────
INSERT INTO lab_orders (id, patient_id, ordered_by, order_date, status, priority) VALUES
  ('c0000001-0001-0001-0001-000000000001', 'P-2024-08812', 'D001', CURRENT_DATE - 1, 'ready',    'routine'),
  ('c0000001-0002-0002-0002-000000000002', 'P-2024-08812', 'D001', CURRENT_DATE - 1, 'ready',    'routine'),
  ('c0000001-0003-0003-0003-000000000003', 'P-2024-08812', 'D001', CURRENT_DATE - 3, 'ready',    'routine'),
  ('c0000001-0004-0004-0004-000000000004', 'P-2024-08812', 'D001', CURRENT_DATE,     'ordered',  'routine'),
  ('c0000001-0005-0005-0005-000000000005', 'P-2024-08812', 'D006', '2026-05-12',     'ready',    'routine')
ON CONFLICT (id) DO NOTHING;

INSERT INTO lab_tests (order_id, test_name, test_code, category, result_value, result_unit, reference_range, flag, completed_at) VALUES
  ('c0000001-0001-0001-0001-000000000001', 'Haemoglobin', 'HB', 'Haematology', '11.2', 'g/dL', '13–17 g/dL', 'low',    NOW() - INTERVAL '18 hours'),
  ('c0000001-0001-0001-0001-000000000001', 'WBC',         'WBC','Haematology', '7800', '/μL',  '4000–11000 /μL','normal', NOW() - INTERVAL '18 hours'),
  ('c0000001-0001-0001-0001-000000000001', 'Platelets',   'PLT','Haematology', '2.4 L','/μL', '1.5–4.0 L/μL','normal', NOW() - INTERVAL '18 hours'),
  ('c0000001-0002-0002-0002-000000000002', 'Fasting Glucose','FBS','Biochemistry','134','mg/dL','70–99 mg/dL','high',    NOW() - INTERVAL '16 hours'),
  ('c0000001-0003-0003-0003-000000000003', 'Total Cholesterol','CHOL','Biochemistry','196','mg/dL','< 200 mg/dL','normal', NOW() - INTERVAL '3 days'),
  ('c0000001-0003-0003-0003-000000000003', 'LDL',         'LDL','Biochemistry','128','mg/dL','< 100 mg/dL','high',    NOW() - INTERVAL '3 days'),
  ('c0000001-0003-0003-0003-000000000003', 'HDL',         'HDL','Biochemistry','38', 'mg/dL','> 40 mg/dL', 'low',    NOW() - INTERVAL '3 days'),
  ('c0000001-0003-0003-0003-000000000003', 'Triglycerides','TGL','Biochemistry','182','mg/dL','< 150 mg/dL','high',    NOW() - INTERVAL '3 days'),
  ('c0000001-0005-0005-0005-000000000005', 'Chest X-Ray Impression','XRAY','Radiology','Mild cardiomegaly. No active pulmonary disease.','','','note', '2026-05-12 14:00:00')
ON CONFLICT DO NOTHING;

-- ── 9. Prescriptions ──────────────────────────────────────────
INSERT INTO prescriptions (id, patient_id, doctor_id, prescribed_date, is_active) VALUES
  ('d0000001-0001-0001-0001-000000000001', 'P-2024-08812', 'D001', CURRENT_DATE - 30, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO prescription_items (prescription_id, drug_name, dose, morning, afternoon, evening, night, with_food, duration_days, instructions) VALUES
  ('d0000001-0001-0001-0001-000000000001', 'Metformin 500mg',   '1 tablet', TRUE, FALSE, FALSE, FALSE, TRUE,  90, 'Take with breakfast'),
  ('d0000001-0001-0001-0001-000000000001', 'Amlodipine 5mg',    '1 tablet', TRUE, FALSE, FALSE, FALSE, FALSE, 90, 'Take in the morning'),
  ('d0000001-0001-0001-0001-000000000001', 'Losartan 50mg',     '1 tablet', FALSE, FALSE, FALSE, TRUE, FALSE, 90, 'Take at bedtime'),
  ('d0000001-0001-0001-0001-000000000001', 'Atorvastatin 10mg', '1 tablet', FALSE, FALSE, FALSE, TRUE, FALSE, 90, 'Take at bedtime'),
  ('d0000001-0001-0001-0001-000000000001', 'Aspirin 75mg',      '1 tablet', TRUE, FALSE, FALSE, FALSE, TRUE,  90, 'Take with breakfast'),
  ('d0000001-0001-0001-0001-000000000001', 'Pan 40mg',          '1 tablet', TRUE, FALSE, FALSE, FALSE, FALSE, 30, 'Take before breakfast')
ON CONFLICT DO NOTHING;

-- ── 10. Patient Tasks ─────────────────────────────────────────
INSERT INTO patient_tasks (patient_id, created_by, title, due_date, priority, is_done) VALUES
  ('P-2024-08812', 'D001', 'Collect CBC report from lab (Counter 3)',                   CURRENT_DATE,     'high',   FALSE),
  ('P-2024-08812', 'D001', 'Show fasting glucose result to Dr. Menon today',            CURRENT_DATE,     'high',   FALSE),
  ('P-2024-08812', 'D001', 'Schedule cardiology follow-up appointment',                  CURRENT_DATE + 5, 'medium', FALSE),
  ('P-2024-08812', 'D001', 'Buy Losartan 50mg (3-month supply from Jan Aushadhi)',       CURRENT_DATE + 7, 'medium', FALSE),
  ('P-2024-08812', 'D001', 'Get fundus examination at Ophthalmology',                    CURRENT_DATE + 13,'low',    FALSE),
  ('P-2024-08812', NULL,   'Submit insurance claim form at billing counter',              CURRENT_DATE - 13,'medium', TRUE)
ON CONFLICT DO NOTHING;

-- ── 11. Bills ─────────────────────────────────────────────────
INSERT INTO bills (id, patient_id, hospital_id, description, amount, is_paid, payment_date) VALUES
  ('e0000001-0001-0001-0001-000000000001', 'P-2024-08812', 1, 'OPD Registration – General Medicine',            30,  FALSE, NULL),
  ('e0000001-0002-0002-0002-000000000002', 'P-2024-08812', 1, 'Lab Tests – CBC, Glucose, Lipid Profile, Urine', 220, TRUE,  CURRENT_DATE - 1),
  ('e0000001-0003-0003-0003-000000000003', 'P-2024-08812', 1, 'Chest X-Ray',                                    150, TRUE,  '2026-05-12'),
  ('e0000001-0004-0004-0004-000000000004', 'P-2024-08812', 1, 'OPD Registration – Dermatology',                 30,  TRUE,  '2026-05-12')
ON CONFLICT (id) DO NOTHING;

-- ── 12. Notices ───────────────────────────────────────────────
INSERT INTO notices (hospital_id, from_role, from_name, target, title, is_urgent) VALUES
  (1, 'system', 'Lab Department', 'patients', 'Your CBC result is ready. Collect from Lab Counter 3.', FALSE),
  (1, 'system', 'OPD System',     'patients', 'Your appointment with Dr. Priya Menon is confirmed for today.', FALSE),
  (1, 'admin',  'Hospital Administration', 'all', 'NCD Health Camp – Free BP & Diabetes Screening on 28 Jun at Ground Floor Hall.', FALSE),
  (1, 'admin',  'MS Office', 'all', 'Holiday Notice: OPD will remain closed on 27 Jun 2026 (Saturday holiday).', FALSE),
  (1, 'admin',  'OPD Coordinator', 'doctors', 'URGENT: Cardiology OPD at critical load. Duty officer to assess re-routing options immediately.', TRUE),
  (1, 'admin',  'MS Office', 'doctors', 'Reminder: Monthly mortality audit meeting on 27 Jun, 3 PM, Conference Room 2.', FALSE)
ON CONFLICT DO NOTHING;

-- ── 13. Wards ─────────────────────────────────────────────────
INSERT INTO wards (id, hospital_id, name, specialty, total_beds) VALUES
  (1, 1, 'Ward A (Medicine)',   'General Medicine',  60),
  (2, 1, 'Ward B (Medicine)',   'General Medicine',  60),
  (3, 1, 'Ward C (Surgery)',    'General Surgery',   50),
  (4, 1, 'Ward D (Paediatrics)','Paediatrics',       40),
  (5, 1, 'Ward E (OBG)',        'Obs & Gynaecology', 40),
  (6, 1, 'Ward F (Ortho)',      'Orthopaedics',      30),
  (7, 1, 'ICU / CCU',          'Critical Care',     20)
ON CONFLICT (id) DO NOTHING;

-- ── 14. Beds (sample) ─────────────────────────────────────────
-- Ward A: 54 occupied, 6 vacant
INSERT INTO beds (ward_id, bed_number, status, patient_id, admission_date) VALUES
  (1, 'A-03', 'occupied', 'P-2024-07901', CURRENT_DATE - 7),
  (1, 'A-07', 'occupied', 'P-2024-07788', CURRENT_DATE - 3),
  (1, 'A-11', 'occupied', 'P-2024-08102', CURRENT_DATE - 4)
ON CONFLICT (ward_id, bed_number) DO NOTHING;

INSERT INTO beds (ward_id, bed_number, status, patient_id, admission_date) VALUES
  (2, 'B-02', 'occupied', 'P-2024-08203', CURRENT_DATE - 1),
  (2, 'B-09', 'occupied', 'P-2024-08001', CURRENT_DATE - 2),
  (2, 'B-14', 'occupied', 'P-2024-06102', CURRENT_DATE - 5)
ON CONFLICT (ward_id, bed_number) DO NOTHING;

-- ── 15. Programmes ────────────────────────────────────────────
INSERT INTO programmes (id, hospital_id, name, code, target) VALUES
  (1, 1, 'TB DOTS (NTEP)',            'NTEP',  45),
  (2, 1, 'NCD Screening Programme',   'NCD',   200),
  (3, 1, 'Maternal & Child Health',   'RMNCH', 80),
  (4, 1, 'PMJAY Enrolment',          'PMJAY', 120),
  (5, 1, 'ASHA Coordination (NHM)',   'ASHA',  60),
  (6, 1, 'National Immunisation Day', 'NID',   300)
ON CONFLICT (id) DO NOTHING;

-- Enrol the demo patient in NCD
INSERT INTO programme_enrolments (programme_id, patient_id, enrolled_by, status, next_visit_date)
VALUES (2, 'P-2024-08812', 'D001', 'active', CURRENT_DATE + 30)
ON CONFLICT (programme_id, patient_id) DO NOTHING;

-- ── 16. Escalations (discharge blockers + OPD overload) ───────
INSERT INTO escalations (hospital_id, dept_id, patient_id, type, description, severity, owner, status) VALUES
  (1, 'med',  'P-2024-07901', 'discharge-blocker', 'Discharge summary not yet signed by resident', 'warning',  'Dr. Priya Menon', 'open'),
  (1, 'surg', NULL,           'discharge-blocker', 'Insurance claim form incomplete — Suman Sharma Ward C', 'warning', 'Billing Dept', 'open'),
  (1, 'obg',  NULL,           'discharge-blocker', 'Social worker clearance pending (baby without documents) — Kavita Dolas Ward E', 'warning', 'SW Dept', 'open'),
  (1, 'card', NULL,           'opd-overload',      'Only 1 doctor available. 14 patients waiting. Avg wait: 55 min.', 'critical', 'OPD Coordinator', 'open'),
  (1, 'ortho',NULL,           'opd-overload',      'Lab X-Ray TAT exceeding 90 min causing downstream consult delays.', 'warning', 'Lab Dept', 'open'),
  (1, 'derm', NULL,           'opd-overload',      '27 patients waiting with 1 doctor. Consider routing to MBBS camp.', 'warning', 'OPD Coordinator', 'open')
ON CONFLICT DO NOTHING;

-- ── 17. Referrals ─────────────────────────────────────────────
INSERT INTO referrals (id, patient_id, from_doctor_id, from_dept_id, to_dept_id, urgency, reason, status) VALUES
  ('f0000001-0001-0001-0001-000000000001', 'P-2024-06102', 'D001', 'med',  'card',  'urgent',  'Decompensated heart failure — needs cardiologist review',    'open'),
  ('f0000001-0002-0002-0002-000000000002', 'P-2024-07901', 'D002', 'surg', 'med',   'routine', 'Post-op fever — rule out infection',                         'done'),
  ('f0000001-0003-0003-0003-000000000003', 'P-2024-08203', 'D003', 'peds', 'obg',   'urgent',  'PIH referral for obstetric review',                          'open')
ON CONFLICT (id) DO NOTHING;

-- ── Admin user for the hospital ───────────────────────────────
INSERT INTO users (id, email, phone, password_hash, role, hospital_id)
VALUES ('a1b2c3d4-0099-0099-0099-000000000099', 'ms@rggmch.gov.in', '9876599999',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHG', 'admin', 1)
ON CONFLICT (id) DO NOTHING;

-- ── Confirmation ──────────────────────────────────────────────
SELECT 'Seed complete' AS status,
       (SELECT COUNT(*) FROM hospitals)    AS hospitals,
       (SELECT COUNT(*) FROM departments)  AS departments,
       (SELECT COUNT(*) FROM users)        AS users,
       (SELECT COUNT(*) FROM patients)     AS patients,
       (SELECT COUNT(*) FROM doctors)      AS doctors,
       (SELECT COUNT(*) FROM queue_tokens) AS queue_tokens,
       (SELECT COUNT(*) FROM lab_orders)   AS lab_orders;
