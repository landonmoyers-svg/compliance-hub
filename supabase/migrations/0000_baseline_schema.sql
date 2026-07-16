-- =====================================================================
-- Compliance Hub — Baseline schema snapshot
-- Project: Supabase gkrhxfthvqprmnztoxxw (Lone Peak Psychiatry)
-- Generated: 2026-07-07 from the LIVE database (catalog reconstruction).
--
-- This is the authoritative, full current-state schema: every table,
-- constraint, index, RLS policy, function, and trigger as they exist in
-- production. It SUPERSEDES the earlier partial/insecure initial migration
-- (which only had 16 tables and open `using(true)` policies). Use this to
-- rebuild the database from scratch for disaster recovery or a new tenant.
--
-- To regenerate authoritatively later, prefer the Supabase CLI:
--   supabase link --project-ref gkrhxfthvqprmnztoxxw
--   supabase db dump --linked -f supabase/schema.sql
--
-- Idempotent where practical (IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS) so it can be re-applied to a fresh database.
-- Security posture: RLS is ON for every table; all policies gate on
-- auth.uid(); the anon role receives NO table privileges.
-- =====================================================================

create extension if not exists "uuid-ossp";

-- ============================== TABLES ===============================

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  actor_type text NOT NULL DEFAULT 'user'::text,
  actor_name text,
  assistant text,
  action text NOT NULL DEFAULT 'create'::text,
  entity_type text,
  entity_id uuid,
  summary text NOT NULL,
  reversible boolean NOT NULL DEFAULT false,
  undone boolean NOT NULL DEFAULT false,
  undone_at timestamp with time zone,
  undone_by text
);

CREATE TABLE IF NOT EXISTS public.agenda_snoozes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  item_key text NOT NULL,
  snoozed_until timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id uuid NOT NULL,
  usage_date date NOT NULL,
  count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.audit_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  audit_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'general'::text,
  question text NOT NULL,
  result text NOT NULL DEFAULT 'na'::text,
  severity text NOT NULL DEFAULT 'low'::text,
  finding text,
  remediation text,
  remediation_owner text,
  remediation_due timestamp with time zone,
  remediation_status text NOT NULL DEFAULT 'none'::text
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  actor_name text NOT NULL,
  actor_email text,
  action text NOT NULL DEFAULT 'view'::text,
  entity_type text,
  entity_id text,
  entity_label text,
  details text,
  risk_level text NOT NULL DEFAULT 'low'::text,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text
);

CREATE TABLE IF NOT EXISTS public.audits (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  audit_type text NOT NULL DEFAULT 'internal'::text,
  audit_date timestamp with time zone,
  auditor_name text,
  status text NOT NULL DEFAULT 'in_progress'::text,
  scope_notes text
);

CREATE TABLE IF NOT EXISTS public.backups (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  performed_by text,
  item_count integer NOT NULL DEFAULT 0,
  format text,
  notes text
);

CREATE TABLE IF NOT EXISTS public.benefits (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  benefit_type text NOT NULL DEFAULT 'health'::text,
  provider text,
  plan_name text NOT NULL,
  policy_number text,
  employer_contribution_cents integer NOT NULL DEFAULT 0,
  employee_contribution_cents integer NOT NULL DEFAULT 0,
  eligibility_rules text,
  enrollment_deadline date,
  renewal_date date,
  contact_phone text,
  enrollment_url text,
  enrolled_count integer NOT NULL DEFAULT 0,
  eligible_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.breach_assessments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  discovered_date timestamp with time zone,
  description text,
  factor1_nature text,
  factor1_rating text DEFAULT 'medium'::text,
  factor2_recipient text,
  factor2_rating text DEFAULT 'medium'::text,
  factor3_acquired text,
  factor3_rating text DEFAULT 'medium'::text,
  factor4_mitigation text,
  factor4_rating text DEFAULT 'medium'::text,
  probability text NOT NULL DEFAULT 'medium'::text,
  determination text NOT NULL DEFAULT 'undetermined'::text,
  status text NOT NULL DEFAULT 'draft'::text,
  assessed_by_name text,
  notes text
);

CREATE TABLE IF NOT EXISTS public.cco_preferences (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  horizon_days integer NOT NULL DEFAULT 30,
  show_low boolean NOT NULL DEFAULT false,
  focus_areas text,
  agent_notes text
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  assistant text NOT NULL DEFAULT 'policy_assistant'::text,
  role text NOT NULL DEFAULT 'user'::text,
  content text NOT NULL,
  conversation_id uuid
);

CREATE TABLE IF NOT EXISTS public.competency_records (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  employee_id uuid,
  employee_name text NOT NULL,
  competency_name text NOT NULL,
  competency_type text NOT NULL DEFAULT 'clinical'::text,
  evaluator_name text,
  assessment_date date,
  valid_until date,
  score numeric,
  status text NOT NULL DEFAULT 'pending'::text,
  notes text
);

CREATE TABLE IF NOT EXISTS public.completed_forms (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  template_id uuid NOT NULL,
  template_title text NOT NULL,
  employee_id uuid,
  employee_name text NOT NULL,
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  signed_by_name text,
  completed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.controlled_substance_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  substance_name text NOT NULL,
  schedule_class text NOT NULL DEFAULT 'II'::text,
  transaction_type text NOT NULL DEFAULT 'dispense'::text,
  quantity numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  patient_ref text,
  prescriber_name text,
  witness_name text,
  transaction_date date,
  notes text
);

CREATE TABLE IF NOT EXISTS public.corrective_actions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  incident_id uuid,
  risk_case_id uuid,
  title text NOT NULL,
  root_cause text,
  action_plan text,
  owner_name text,
  owner_user_id uuid,
  due_date timestamp with time zone,
  status text NOT NULL DEFAULT 'open'::text,
  verified_by_name text,
  verified_date timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.credentials (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  employee_user_id uuid,
  employee_name text NOT NULL,
  credential_name text NOT NULL,
  credential_type text NOT NULL DEFAULT 'license'::text,
  issuing_body text,
  credential_number text,
  issue_date date,
  expiration_date date,
  location_id uuid,
  document_url text,
  effective_from timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.disciplinary_actions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  employee_id uuid NOT NULL,
  employee_name text NOT NULL,
  action_type text NOT NULL DEFAULT 'verbal_warning'::text,
  reason text NOT NULL,
  description text,
  witness_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  issued_date date,
  follow_up_date date,
  issued_by_name text,
  status text NOT NULL DEFAULT 'active'::text,
  resolution_note text
);

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  document_type text NOT NULL DEFAULT 'policy'::text,
  compliance_area text,
  summary text,
  status text NOT NULL DEFAULT 'active'::text,
  access_level text NOT NULL DEFAULT 'all_staff'::text,
  version text NOT NULL DEFAULT '1.0'::text,
  review_date date,
  requires_acknowledgment boolean NOT NULL DEFAULT false,
  file_url text,
  content text,
  effective_from timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.emergency_drills (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  drill_title text NOT NULL,
  drill_type text NOT NULL DEFAULT 'fire'::text,
  scheduled_date date,
  status text NOT NULL DEFAULT 'scheduled'::text,
  participant_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  employee_id uuid,
  employee_name text NOT NULL,
  document_type text NOT NULL DEFAULT 'other'::text,
  title text NOT NULL,
  file_url text,
  sensitive boolean NOT NULL DEFAULT false,
  uploaded_by_name text,
  notes text,
  effective_from timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  title text,
  department text,
  employment_status text NOT NULL DEFAULT 'active'::text,
  hire_date date,
  location_id uuid,
  user_id uuid,
  manager_id uuid,
  job_role text,
  reports_note text
);

CREATE TABLE IF NOT EXISTS public.exclusion_screenings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  subject_type text NOT NULL DEFAULT 'staff'::text,
  subject_name text NOT NULL,
  subject_user_id uuid,
  vendor_id uuid,
  sources text,
  screened_date timestamp with time zone,
  result text NOT NULL DEFAULT 'clear'::text,
  notes text,
  screened_by_name text
);

CREATE TABLE IF NOT EXISTS public.form_assignments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  template_id uuid NOT NULL,
  template_title text NOT NULL,
  assigned_to_user_id uuid,
  assigned_to_name text NOT NULL,
  status text NOT NULL DEFAULT 'assigned'::text,
  due_date date,
  completed_form_id uuid
);

CREATE TABLE IF NOT EXISTS public.form_templates (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other'::text,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active'::text,
  requires_signature boolean NOT NULL DEFAULT false,
  sensitive boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  file_url text
);

CREATE TABLE IF NOT EXISTS public.incidents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other'::text,
  description text,
  severity text NOT NULL DEFAULT 'medium'::text,
  status text NOT NULL DEFAULT 'new'::text,
  anonymous boolean NOT NULL DEFAULT false,
  reported_by_user_id uuid,
  reported_by_name text,
  location_id uuid,
  occurred_date timestamp with time zone,
  resolution_summary text
);

CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  policy_name text NOT NULL,
  policy_type text NOT NULL DEFAULT 'malpractice'::text,
  carrier_name text,
  policy_number text,
  coverage_amount_cents bigint,
  annual_premium_cents bigint,
  renewal_date date,
  holder_user_id uuid,
  holder_name text,
  document_url text
);

CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  item_name text NOT NULL,
  item_type text NOT NULL DEFAULT 'equipment'::text,
  status text NOT NULL DEFAULT 'active'::text,
  condition text NOT NULL DEFAULT 'good'::text,
  location_id uuid,
  removed_from_inventory boolean NOT NULL DEFAULT false,
  image_url text,
  description text,
  estimated_value_cents integer,
  sublocation text,
  captured_at timestamp with time zone,
  captured_lat double precision,
  captured_lng double precision,
  ai_identified boolean NOT NULL DEFAULT false,
  ai_confidence text,
  quantity integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.locations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'clinic'::text,
  address text,
  city text,
  state text,
  zip text,
  active boolean NOT NULL DEFAULT true,
  lat double precision,
  lng double precision
);

CREATE TABLE IF NOT EXISTS public.nav_preferences (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  hidden_pages text[] NOT NULL DEFAULT '{}'::text[],
  page_order text[] NOT NULL DEFAULT '{}'::text[]
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  body text,
  category text NOT NULL DEFAULT 'system'::text,
  severity text NOT NULL DEFAULT 'info'::text,
  entity_type text,
  entity_id text,
  link text,
  read boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.organization_settings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  org_name text NOT NULL DEFAULT 'Lone Peak Psychiatry'::text,
  address text,
  phone text,
  website text,
  npi_number text,
  tax_id text,
  document_retention_years integer NOT NULL DEFAULT 7,
  session_timeout_minutes integer NOT NULL DEFAULT 30,
  require_two_factor boolean NOT NULL DEFAULT false,
  password_min_length integer NOT NULL DEFAULT 12,
  credential_reminder_days integer NOT NULL DEFAULT 30,
  training_reminder_days integer NOT NULL DEFAULT 14,
  insurance_reminder_days integer NOT NULL DEFAULT 60,
  email_notifications boolean NOT NULL DEFAULT true,
  page_roles jsonb NOT NULL DEFAULT '{}'::jsonb,
  disabled_pages text[] NOT NULL DEFAULT '{}'::text[],
  default_account_role text NOT NULL DEFAULT 'staff'::text
);

CREATE TABLE IF NOT EXISTS public.osha_records (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  record_title text NOT NULL,
  record_type text NOT NULL DEFAULT 'inspection'::text,
  event_date date,
  description text,
  status text NOT NULL DEFAULT 'open'::text,
  recordability_status text NOT NULL DEFAULT 'not_reviewed'::text
);

CREATE TABLE IF NOT EXISTS public.payroll_records (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  employee_id uuid NOT NULL,
  employee_name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  regular_hours numeric NOT NULL DEFAULT 0,
  ot_hours numeric NOT NULL DEFAULT 0,
  pto_hours numeric NOT NULL DEFAULT 0,
  gross_pay_cents integer NOT NULL DEFAULT 0,
  federal_tax_cents integer NOT NULL DEFAULT 0,
  state_tax_cents integer NOT NULL DEFAULT 0,
  social_security_cents integer NOT NULL DEFAULT 0,
  medicare_cents integer NOT NULL DEFAULT 0,
  health_insurance_cents integer NOT NULL DEFAULT 0,
  retirement_401k_cents integer NOT NULL DEFAULT 0,
  other_deductions_cents integer NOT NULL DEFAULT 0,
  net_pay_cents integer NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'direct_deposit'::text,
  status text NOT NULL DEFAULT 'draft'::text
);

CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  employee_id uuid NOT NULL,
  employee_name text NOT NULL,
  review_type text NOT NULL DEFAULT 'quarterly'::text,
  review_date date,
  gets_it boolean NOT NULL DEFAULT false,
  wants_it boolean NOT NULL DEFAULT false,
  has_capacity boolean NOT NULL DEFAULT false,
  right_person_right_seat text NOT NULL DEFAULT 'yes'::text,
  overall_rating text NOT NULL DEFAULT 'meets_expectations'::text,
  rocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  reviewer_name text,
  status text NOT NULL DEFAULT 'scheduled'::text
);

CREATE TABLE IF NOT EXISTS public.policy_acks (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  document_id uuid NOT NULL,
  document_title text NOT NULL,
  status text NOT NULL DEFAULT 'acknowledged'::text,
  acknowledged_at timestamp with time zone,
  expires_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  account_role text NOT NULL DEFAULT 'staff'::text,
  staff_role text,
  professional_role text,
  department text,
  primary_location_id uuid,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.pto_balances (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  year integer NOT NULL,
  pto_accrued_hours numeric NOT NULL DEFAULT 0,
  pto_used_hours numeric NOT NULL DEFAULT 0,
  sick_accrued_hours numeric NOT NULL DEFAULT 0,
  sick_used_hours numeric NOT NULL DEFAULT 0,
  holiday_allotted_hours numeric NOT NULL DEFAULT 0,
  holiday_used_hours numeric NOT NULL DEFAULT 0,
  carry_over_hours numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.record_versions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  version_num integer NOT NULL,
  change_kind text NOT NULL,
  effective_from timestamp with time zone,
  superseded_at timestamp with time zone NOT NULL DEFAULT now(),
  changed_by uuid,
  file_path text,
  snapshot jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.regulatory_sources (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  citation_label text,
  issuing_body text,
  source_type text NOT NULL DEFAULT 'regulation'::text,
  jurisdiction text,
  review_status text NOT NULL DEFAULT 'current'::text,
  last_checked_at timestamp with time zone,
  official_url text
);

CREATE TABLE IF NOT EXISTS public.risk_cases (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  case_title text NOT NULL,
  case_type text NOT NULL DEFAULT 'clinical'::text,
  description text,
  severity text NOT NULL DEFAULT 'medium'::text,
  status text NOT NULL DEFAULT 'open'::text,
  access_level text NOT NULL DEFAULT 'standard'::text,
  reported_by_name text,
  incident_date date
);

CREATE TABLE IF NOT EXISTS public.role_requirements (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  job_role text NOT NULL,
  req_type text NOT NULL DEFAULT 'training'::text,
  name text NOT NULL,
  notes text
);

CREATE TABLE IF NOT EXISTS public.sds_records (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  product_name text NOT NULL,
  manufacturer text,
  upc text,
  signal_word text NOT NULL DEFAULT 'NONE'::text,
  status text NOT NULL DEFAULT 'active'::text
);

CREATE TABLE IF NOT EXISTS public.sra_assessments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  period_year integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress'::text,
  started_date timestamp with time zone,
  completed_date timestamp with time zone,
  completed_by_name text,
  scope_notes text
);

CREATE TABLE IF NOT EXISTS public.sra_findings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  assessment_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'administrative'::text,
  question text NOT NULL,
  response text,
  risk_level text NOT NULL DEFAULT 'na'::text,
  remediation text,
  remediation_owner text,
  remediation_due timestamp with time zone,
  remediation_status text NOT NULL DEFAULT 'none'::text,
  notes text
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  description text,
  category text,
  status text NOT NULL DEFAULT 'open'::text,
  priority text NOT NULL DEFAULT 'medium'::text,
  due_date timestamp with time zone,
  assigned_to_user_id uuid,
  assigned_to_name text,
  location_id uuid,
  completed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.time_clock_entries (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  clock_in_at timestamp with time zone NOT NULL,
  clock_out_at timestamp with time zone,
  total_minutes integer,
  status text NOT NULL DEFAULT 'active'::text,
  edit_note text,
  edited_by_name text
);

CREATE TABLE IF NOT EXISTS public.time_off_requests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  request_type text NOT NULL DEFAULT 'pto'::text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  hours numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'pending'::text,
  reviewer_name text,
  review_note text,
  reviewed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.training_assignments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  training_module_id uuid NOT NULL,
  module_title text NOT NULL,
  assigned_to_user_id uuid NOT NULL,
  assigned_to_name text NOT NULL,
  status text NOT NULL DEFAULT 'assigned'::text,
  due_date date,
  completed_at timestamp with time zone,
  score integer
);

CREATE TABLE IF NOT EXISTS public.training_attempts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  assignment_id uuid,
  training_module_id uuid NOT NULL,
  module_title text,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.training_modules (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  description text,
  training_type text NOT NULL DEFAULT 'compliance'::text,
  frequency_months integer,
  passing_score integer NOT NULL DEFAULT 80,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.training_questions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  training_module_id uuid NOT NULL,
  prompt text NOT NULL,
  question_type text NOT NULL DEFAULT 'multiple_choice'::text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  vendor_name text NOT NULL,
  vendor_type text NOT NULL DEFAULT 'service_provider'::text,
  contact_name text,
  contact_email text,
  contact_phone text,
  has_access_to_phi boolean NOT NULL DEFAULT false,
  baa_required boolean NOT NULL DEFAULT false,
  baa_status text NOT NULL DEFAULT 'not_required'::text,
  baa_signed_date date,
  insurance_expiration_date date,
  next_review_date date,
  status text NOT NULL DEFAULT 'active'::text,
  notes text,
  effective_from timestamp with time zone NOT NULL DEFAULT now()
);

-- ======================= CONSTRAINTS (PK/UNIQUE/CHECK) ================
-- (FKs added afterward so referenced keys already exist.)

ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);
ALTER TABLE public.agenda_snoozes ADD CONSTRAINT agenda_snoozes_pkey PRIMARY KEY (id);
ALTER TABLE public.agenda_snoozes ADD CONSTRAINT agenda_snoozes_user_id_item_key_key UNIQUE (user_id, item_key);
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (user_id, usage_date);
ALTER TABLE public.audit_items ADD CONSTRAINT audit_items_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check CHECK ((action = ANY (ARRAY['view'::text, 'create'::text, 'update'::text, 'delete'::text, 'export'::text, 'login'::text, 'logout'::text, 'failed_login'::text, 'acknowledge'::text, 'sign'::text])));
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public.audits ADD CONSTRAINT audits_pkey PRIMARY KEY (id);
ALTER TABLE public.backups ADD CONSTRAINT backups_pkey PRIMARY KEY (id);
ALTER TABLE public.benefits ADD CONSTRAINT benefits_benefit_type_check CHECK ((benefit_type = ANY (ARRAY['health'::text, 'dental'::text, 'vision'::text, 'life_insurance'::text, 'disability'::text, 'retirement_401k'::text, 'pto'::text, 'fsa'::text, 'hsa'::text, 'other'::text])));
ALTER TABLE public.benefits ADD CONSTRAINT benefits_pkey PRIMARY KEY (id);
ALTER TABLE public.breach_assessments ADD CONSTRAINT breach_assessments_pkey PRIMARY KEY (id);
ALTER TABLE public.cco_preferences ADD CONSTRAINT cco_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.cco_preferences ADD CONSTRAINT cco_preferences_user_id_key UNIQUE (user_id);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_assistant_check CHECK ((assistant = ANY (ARRAY['policy_assistant'::text, 'concierge'::text])));
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])));
ALTER TABLE public.competency_records ADD CONSTRAINT competency_records_competency_type_check CHECK ((competency_type = ANY (ARRAY['clinical'::text, 'safety'::text, 'technical'::text, 'administrative'::text, 'other'::text])));
ALTER TABLE public.competency_records ADD CONSTRAINT competency_records_pkey PRIMARY KEY (id);
ALTER TABLE public.competency_records ADD CONSTRAINT competency_records_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'evaluated'::text, 'passed'::text, 'failed'::text, 'expired'::text])));
ALTER TABLE public.completed_forms ADD CONSTRAINT completed_forms_pkey PRIMARY KEY (id);
ALTER TABLE public.controlled_substance_logs ADD CONSTRAINT controlled_substance_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.controlled_substance_logs ADD CONSTRAINT controlled_substance_logs_schedule_class_check CHECK ((schedule_class = ANY (ARRAY['II'::text, 'III'::text, 'IV'::text, 'V'::text])));
ALTER TABLE public.controlled_substance_logs ADD CONSTRAINT controlled_substance_logs_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['receive'::text, 'dispense'::text, 'return'::text, 'dispose'::text, 'adjustment'::text])));
ALTER TABLE public.corrective_actions ADD CONSTRAINT corrective_actions_pkey PRIMARY KEY (id);
ALTER TABLE public.credentials ADD CONSTRAINT credentials_credential_type_check CHECK ((credential_type = ANY (ARRAY['license'::text, 'certification'::text, 'dea'::text, 'cpr_bls_acls'::text, 'immunization'::text, 'background_check'::text, 'clearance'::text, 'training'::text, 'other'::text])));
ALTER TABLE public.credentials ADD CONSTRAINT credentials_pkey PRIMARY KEY (id);
ALTER TABLE public.disciplinary_actions ADD CONSTRAINT disciplinary_actions_action_type_check CHECK ((action_type = ANY (ARRAY['verbal_warning'::text, 'written_warning'::text, 'final_warning'::text, 'pip'::text, 'suspension'::text, 'termination'::text, 'other'::text])));
ALTER TABLE public.disciplinary_actions ADD CONSTRAINT disciplinary_actions_pkey PRIMARY KEY (id);
ALTER TABLE public.disciplinary_actions ADD CONSTRAINT disciplinary_actions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resolved'::text, 'escalated'::text, 'archived'::text])));
ALTER TABLE public.documents ADD CONSTRAINT documents_access_level_check CHECK ((access_level = ANY (ARRAY['all_staff'::text, 'clinical'::text, 'hr'::text, 'admin'::text])));
ALTER TABLE public.documents ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
ALTER TABLE public.documents ADD CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'under_review'::text, 'archived'::text])));
ALTER TABLE public.emergency_drills ADD CONSTRAINT emergency_drills_pkey PRIMARY KEY (id);
ALTER TABLE public.emergency_drills ADD CONSTRAINT emergency_drills_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.employee_documents ADD CONSTRAINT employee_documents_document_type_check CHECK ((document_type = ANY (ARRAY['offer_letter'::text, 'employment_contract'::text, 'i9'::text, 'w4'::text, 'performance_review'::text, 'disciplinary'::text, 'termination'::text, 'benefit_enrollment'::text, 'training_certificate'::text, 'other'::text])));
ALTER TABLE public.employee_documents ADD CONSTRAINT employee_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.employees ADD CONSTRAINT employees_department_check CHECK ((department = ANY (ARRAY['ownership'::text, 'administration'::text, 'clinical'::text, 'hr'::text, 'billing'::text, 'front_desk'::text, 'operations'::text, 'contractor'::text, 'other'::text])));
ALTER TABLE public.employees ADD CONSTRAINT employees_employment_status_check CHECK ((employment_status = ANY (ARRAY['active'::text, 'on_leave'::text, 'terminated'::text, 'resigned'::text, 'laid_off'::text])));
ALTER TABLE public.employees ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
ALTER TABLE public.exclusion_screenings ADD CONSTRAINT exclusion_screenings_pkey PRIMARY KEY (id);
ALTER TABLE public.form_assignments ADD CONSTRAINT form_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.form_assignments ADD CONSTRAINT form_assignments_status_check CHECK ((status = ANY (ARRAY['assigned'::text, 'in_progress'::text, 'completed'::text])));
ALTER TABLE public.form_templates ADD CONSTRAINT form_templates_category_check CHECK ((category = ANY (ARRAY['hr_onboarding'::text, 'hr_discipline'::text, 'hipaa'::text, 'osha_safety'::text, 'training'::text, 'credentialing'::text, 'insurance_risk'::text, 'emergency'::text, 'policy_review'::text, 'other'::text])));
ALTER TABLE public.form_templates ADD CONSTRAINT form_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.form_templates ADD CONSTRAINT form_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])));
ALTER TABLE public.incidents ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);
ALTER TABLE public.insurance_policies ADD CONSTRAINT insurance_policies_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory ADD CONSTRAINT inventory_condition_check CHECK ((condition = ANY (ARRAY['new'::text, 'good'::text, 'fair'::text, 'poor'::text])));
ALTER TABLE public.inventory ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory ADD CONSTRAINT inventory_status_check CHECK ((status = ANY (ARRAY['active'::text, 'broken'::text, 'removed'::text])));
ALTER TABLE public.locations ADD CONSTRAINT locations_pkey PRIMARY KEY (id);
ALTER TABLE public.locations ADD CONSTRAINT locations_type_check CHECK ((type = ANY (ARRAY['clinic'::text, 'office'::text, 'remote'::text, 'other'::text])));
ALTER TABLE public.nav_preferences ADD CONSTRAINT nav_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.nav_preferences ADD CONSTRAINT nav_preferences_user_id_key UNIQUE (user_id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check CHECK ((category = ANY (ARRAY['credential'::text, 'training'::text, 'document'::text, 'insurance'::text, 'vendor'::text, 'system'::text])));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])));
ALTER TABLE public.organization_settings ADD CONSTRAINT organization_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.osha_records ADD CONSTRAINT osha_records_pkey PRIMARY KEY (id);
ALTER TABLE public.osha_records ADD CONSTRAINT osha_records_record_type_check CHECK ((record_type = ANY (ARRAY['injury'::text, 'illness'::text, 'hazcom'::text, 'training'::text, 'inspection'::text, 'corrective_action'::text])));
ALTER TABLE public.osha_records ADD CONSTRAINT osha_records_recordability_status_check CHECK ((recordability_status = ANY (ARRAY['not_reviewed'::text, 'recordable'::text, 'non_recordable'::text])));
ALTER TABLE public.osha_records ADD CONSTRAINT osha_records_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'closed'::text])));
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_payment_method_check CHECK ((payment_method = ANY (ARRAY['direct_deposit'::text, 'check'::text, 'cash'::text])));
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_pkey PRIMARY KEY (id);
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'paid'::text, 'voided'::text])));
ALTER TABLE public.performance_reviews ADD CONSTRAINT performance_reviews_overall_rating_check CHECK ((overall_rating = ANY (ARRAY['exceeds_expectations'::text, 'meets_expectations'::text, 'needs_improvement'::text, 'unsatisfactory'::text])));
ALTER TABLE public.performance_reviews ADD CONSTRAINT performance_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.performance_reviews ADD CONSTRAINT performance_reviews_review_type_check CHECK ((review_type = ANY (ARRAY['quarterly'::text, 'annual'::text, 'mid_year'::text, 'probationary'::text, 'ninety_day'::text, 'pip'::text, 'exit'::text])));
ALTER TABLE public.performance_reviews ADD CONSTRAINT performance_reviews_right_person_right_seat_check CHECK ((right_person_right_seat = ANY (ARRAY['yes'::text, 'wrong_seat'::text, 'wrong_person'::text, 'no'::text])));
ALTER TABLE public.performance_reviews ADD CONSTRAINT performance_reviews_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text])));
ALTER TABLE public.policy_acks ADD CONSTRAINT policy_acks_pkey PRIMARY KEY (id);
ALTER TABLE public.policy_acks ADD CONSTRAINT policy_acks_status_check CHECK ((status = ANY (ARRAY['acknowledged'::text, 'expired'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_role_check CHECK ((account_role = ANY (ARRAY['owner'::text, 'admin'::text, 'hr'::text, 'clinical_leadership'::text, 'manager'::text, 'staff'::text, 'contractor'::text, 'read_only'::text, 'inactive'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_department_check CHECK ((department = ANY (ARRAY['ownership'::text, 'administration'::text, 'clinical'::text, 'hr'::text, 'billing'::text, 'front_desk'::text, 'operations'::text, 'contractor'::text, 'other'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
ALTER TABLE public.pto_balances ADD CONSTRAINT pto_balances_pkey PRIMARY KEY (id);
ALTER TABLE public.record_versions ADD CONSTRAINT record_versions_change_kind_check CHECK ((change_kind = ANY (ARRAY['update'::text, 'delete'::text])));
ALTER TABLE public.record_versions ADD CONSTRAINT record_versions_pkey PRIMARY KEY (id);
ALTER TABLE public.regulatory_sources ADD CONSTRAINT regulatory_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.regulatory_sources ADD CONSTRAINT regulatory_sources_review_status_check CHECK ((review_status = ANY (ARRAY['current'::text, 'needs_review'::text, 'under_review'::text, 'archived'::text])));
ALTER TABLE public.regulatory_sources ADD CONSTRAINT regulatory_sources_source_type_check CHECK ((source_type = ANY (ARRAY['regulation'::text, 'guidance'::text, 'internal'::text, 'statute'::text])));
ALTER TABLE public.risk_cases ADD CONSTRAINT risk_cases_access_level_check CHECK ((access_level = ANY (ARRAY['standard'::text, 'restricted'::text])));
ALTER TABLE public.risk_cases ADD CONSTRAINT risk_cases_pkey PRIMARY KEY (id);
ALTER TABLE public.risk_cases ADD CONSTRAINT risk_cases_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public.risk_cases ADD CONSTRAINT risk_cases_status_check CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'resolved'::text, 'closed'::text])));
ALTER TABLE public.role_requirements ADD CONSTRAINT role_requirements_pkey PRIMARY KEY (id);
ALTER TABLE public.sds_records ADD CONSTRAINT sds_records_pkey PRIMARY KEY (id);
ALTER TABLE public.sds_records ADD CONSTRAINT sds_records_signal_word_check CHECK ((signal_word = ANY (ARRAY['DANGER'::text, 'WARNING'::text, 'CAUTION'::text, 'NONE'::text])));
ALTER TABLE public.sds_records ADD CONSTRAINT sds_records_status_check CHECK ((status = ANY (ARRAY['active'::text, 'missing'::text, 'needs_review'::text, 'archived'::text])));
ALTER TABLE public.sra_assessments ADD CONSTRAINT sra_assessments_pkey PRIMARY KEY (id);
ALTER TABLE public.sra_findings ADD CONSTRAINT sra_findings_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.time_clock_entries ADD CONSTRAINT time_clock_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.time_clock_entries ADD CONSTRAINT time_clock_entries_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'edited'::text])));
ALTER TABLE public.time_off_requests ADD CONSTRAINT time_off_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.time_off_requests ADD CONSTRAINT time_off_requests_request_type_check CHECK ((request_type = ANY (ARRAY['pto'::text, 'sick'::text, 'fmla'::text, 'maternity'::text, 'paternity'::text, 'bereavement'::text, 'jury_duty'::text, 'unpaid'::text, 'holiday'::text, 'other'::text])));
ALTER TABLE public.time_off_requests ADD CONSTRAINT time_off_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'cancelled'::text])));
ALTER TABLE public.training_assignments ADD CONSTRAINT training_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.training_assignments ADD CONSTRAINT training_assignments_status_check CHECK ((status = ANY (ARRAY['assigned'::text, 'in_progress'::text, 'completed'::text])));
ALTER TABLE public.training_attempts ADD CONSTRAINT training_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.training_modules ADD CONSTRAINT training_modules_pkey PRIMARY KEY (id);
ALTER TABLE public.training_questions ADD CONSTRAINT training_questions_pkey PRIMARY KEY (id);
ALTER TABLE public.training_questions ADD CONSTRAINT training_questions_question_type_check CHECK ((question_type = ANY (ARRAY['multiple_choice'::text, 'true_false'::text])));
ALTER TABLE public.vendors ADD CONSTRAINT vendors_baa_status_check CHECK ((baa_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'signed'::text, 'expired'::text, 'under_review'::text])));
ALTER TABLE public.vendors ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);
ALTER TABLE public.vendors ADD CONSTRAINT vendors_status_check CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'suspended'::text, 'terminated'::text, 'under_review'::text])));
ALTER TABLE public.vendors ADD CONSTRAINT vendors_vendor_type_check CHECK ((vendor_type = ANY (ARRAY['business_associate'::text, 'contractor'::text, 'supplier'::text, 'service_provider'::text, 'consultant'::text, 'other'::text])));

-- Foreign keys (reference auth.users / other public tables)
ALTER TABLE public.credentials ADD CONSTRAINT credentials_employee_user_id_fkey FOREIGN KEY (employee_user_id) REFERENCES auth.users(id);
ALTER TABLE public.credentials ADD CONSTRAINT credentials_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE public.employees ADD CONSTRAINT employees_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE public.inventory ADD CONSTRAINT inventory_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE public.policy_acks ADD CONSTRAINT policy_acks_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE public.policy_acks ADD CONSTRAINT policy_acks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES auth.users(id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE public.training_assignments ADD CONSTRAINT training_assignments_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES auth.users(id);
ALTER TABLE public.training_assignments ADD CONSTRAINT training_assignments_training_module_id_fkey FOREIGN KEY (training_module_id) REFERENCES training_modules(id) ON DELETE CASCADE;

-- ============================== INDEXES ==============================
CREATE INDEX IF NOT EXISTS activity_log_day_idx ON public.activity_log USING btree (created_date DESC);
CREATE INDEX IF NOT EXISTS audit_items_audit_idx ON public.audit_items USING btree (audit_id);
CREATE INDEX IF NOT EXISTS chat_messages_convo_idx ON public.chat_messages USING btree (user_id, assistant, conversation_id, created_date);
CREATE INDEX IF NOT EXISTS credentials_expiration_date_idx ON public.credentials USING btree (expiration_date);
CREATE INDEX IF NOT EXISTS exclusion_screenings_subject_idx ON public.exclusion_screenings USING btree (subject_name, screened_date DESC);
CREATE INDEX IF NOT EXISTS policy_acks_user_id_document_id_idx ON public.policy_acks USING btree (user_id, document_id);
CREATE INDEX IF NOT EXISTS record_versions_entity_idx ON public.record_versions USING btree (entity_type, entity_id, version_num DESC);
CREATE INDEX IF NOT EXISTS role_requirements_role_idx ON public.role_requirements USING btree (job_role);
CREATE INDEX IF NOT EXISTS sra_findings_assessment_idx ON public.sra_findings USING btree (assessment_id);
CREATE INDEX IF NOT EXISTS training_assignments_assigned_to_user_id_idx ON public.training_assignments USING btree (assigned_to_user_id);

-- =========================== FUNCTIONS ==============================
-- is_privileged is used by RLS policies; the audit_/version_ functions by triggers.

CREATE OR REPLACE FUNCTION public.is_privileged()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and account_role in ('owner','admin','hr','clinical_leadership')
  );
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (user_id, full_name, email, account_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'staff'
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bump_ai_usage()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c integer;
begin
  insert into public.ai_usage (user_id, usage_date, count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, usage_date) do update set count = ai_usage.count + 1
  returning count into c;
  return c;
end;
$function$;

CREATE OR REPLACE FUNCTION public.audit_generic()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_actor text; v_email text; v_action text; v_id text;
begin
  select full_name, email into v_actor, v_email from public.profiles where user_id = auth.uid();
  if v_actor is null then v_actor := 'system/service'; end if;
  if tg_op = 'INSERT' then v_action := 'create'; v_id := (NEW.id)::text;
  elsif tg_op = 'UPDATE' then v_action := 'update'; v_id := (NEW.id)::text;
  else v_action := 'delete'; v_id := (OLD.id)::text; end if;
  insert into public.audit_logs (actor_name, actor_email, action, entity_type, entity_id, details, risk_level, flagged)
  values (v_actor, v_email, v_action, tg_table_name, v_id, tg_op || ' on ' || tg_table_name, 'high', false);
  if tg_op = 'DELETE' then return OLD; else return NEW; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.audit_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_actor text; v_email text; v_action text; v_detail text; v_risk text; v_label text;
begin
  select full_name, email into v_actor, v_email from public.profiles where user_id = auth.uid();
  if v_actor is null then v_actor := 'system/service'; end if;
  v_risk := 'high';
  if tg_op = 'INSERT' then
    v_action := 'create'; v_label := NEW.full_name;
    v_detail := 'Profile created with role ' || NEW.account_role;
  elsif tg_op = 'UPDATE' then
    v_action := 'update'; v_label := NEW.full_name;
    if NEW.account_role is distinct from OLD.account_role then
      v_detail := 'Role changed: ' || OLD.account_role || ' -> ' || NEW.account_role; v_risk := 'critical';
    elsif NEW.active is distinct from OLD.active then
      v_detail := case when NEW.active then 'Account reactivated' else 'Account deactivated' end;
    else v_detail := 'Profile updated'; end if;
  else
    v_action := 'delete'; v_label := OLD.full_name; v_detail := 'Profile deleted'; v_risk := 'critical';
  end if;
  insert into public.audit_logs (actor_name, actor_email, action, entity_type, entity_id, entity_label, details, risk_level, flagged)
  values (v_actor, v_email, v_action, 'profiles', coalesce((NEW).id, (OLD).id)::text, v_label, v_detail, v_risk, false);
  if tg_op = 'DELETE' then return OLD; else return NEW; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.capture_record_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_num int;
  v_old jsonb;
begin
  v_old := to_jsonb(OLD);

  select coalesce(max(version_num), 0) + 1 into v_num
    from public.record_versions
    where entity_type = TG_TABLE_NAME and entity_id = OLD.id;

  insert into public.record_versions
    (entity_type, entity_id, version_num, change_kind,
     effective_from, superseded_at, changed_by, file_path, snapshot)
  values
    (TG_TABLE_NAME, OLD.id, v_num, lower(TG_OP),
     (v_old->>'effective_from')::timestamptz, now(), auth.uid(),
     coalesce(v_old->>'file_url', v_old->>'document_url'), v_old);

  if TG_OP = 'UPDATE' then
    NEW.effective_from := now();
    return NEW;
  end if;
  return OLD;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- ===================== ROW LEVEL SECURITY: ENABLE ====================
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ===================== ROW LEVEL SECURITY: POLICIES ==================
-- All policies gate on auth.uid(); sensitive tables require is_privileged();
-- personal records are own-or-privileged. anon matches no policy.

DROP POLICY IF EXISTS activity_log_insert ON public.activity_log;
CREATE POLICY activity_log_insert ON public.activity_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS activity_log_select ON public.activity_log;
CREATE POLICY activity_log_select ON public.activity_log AS PERMISSIVE FOR SELECT TO public USING (is_privileged());
DROP POLICY IF EXISTS activity_log_update ON public.activity_log;
CREATE POLICY activity_log_update ON public.activity_log AS PERMISSIVE FOR UPDATE TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS agenda_snoozes_own ON public.agenda_snoozes;
CREATE POLICY agenda_snoozes_own ON public.agenda_snoozes AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS ai_usage_own ON public.ai_usage;
CREATE POLICY ai_usage_own ON public.ai_usage AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS audit_items_priv ON public.audit_items;
CREATE POLICY audit_items_priv ON public.audit_items AS PERMISSIVE FOR ALL TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_privileged());
DROP POLICY IF EXISTS audits_priv ON public.audits;
CREATE POLICY audits_priv ON public.audits AS PERMISSIVE FOR ALL TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS backups_priv ON public.backups;
CREATE POLICY backups_priv ON public.backups AS PERMISSIVE FOR ALL TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS benefits_del ON public.benefits;
CREATE POLICY benefits_del ON public.benefits AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS benefits_ins ON public.benefits;
CREATE POLICY benefits_ins ON public.benefits AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS benefits_sel ON public.benefits;
CREATE POLICY benefits_sel ON public.benefits AS PERMISSIVE FOR SELECT TO public USING (is_privileged());
DROP POLICY IF EXISTS benefits_upd ON public.benefits;
CREATE POLICY benefits_upd ON public.benefits AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS breach_assessments_priv ON public.breach_assessments;
CREATE POLICY breach_assessments_priv ON public.breach_assessments AS PERMISSIVE FOR ALL TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS cco_preferences_own ON public.cco_preferences;
CREATE POLICY cco_preferences_own ON public.cco_preferences AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS chat_messages_own ON public.chat_messages;
CREATE POLICY chat_messages_own ON public.chat_messages AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS competency_records_del ON public.competency_records;
CREATE POLICY competency_records_del ON public.competency_records AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS competency_records_ins ON public.competency_records;
CREATE POLICY competency_records_ins ON public.competency_records AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS competency_records_sel ON public.competency_records;
CREATE POLICY competency_records_sel ON public.competency_records AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (employee_id IN ( SELECT employees.id FROM employees WHERE (employees.user_id = auth.uid())))));
DROP POLICY IF EXISTS competency_records_upd ON public.competency_records;
CREATE POLICY competency_records_upd ON public.competency_records AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS completed_forms_del ON public.completed_forms;
CREATE POLICY completed_forms_del ON public.completed_forms AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS completed_forms_ins ON public.completed_forms;
CREATE POLICY completed_forms_ins ON public.completed_forms AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS completed_forms_sel ON public.completed_forms;
CREATE POLICY completed_forms_sel ON public.completed_forms AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (employee_id IN ( SELECT employees.id FROM employees WHERE (employees.user_id = auth.uid())))));
DROP POLICY IF EXISTS completed_forms_upd ON public.completed_forms;
CREATE POLICY completed_forms_upd ON public.completed_forms AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS controlled_substance_logs_priv ON public.controlled_substance_logs;
CREATE POLICY controlled_substance_logs_priv ON public.controlled_substance_logs AS PERMISSIVE FOR ALL TO authenticated USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS corrective_actions_priv ON public.corrective_actions;
CREATE POLICY corrective_actions_priv ON public.corrective_actions AS PERMISSIVE FOR ALL TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS credentials_del ON public.credentials;
CREATE POLICY credentials_del ON public.credentials AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS credentials_ins ON public.credentials;
CREATE POLICY credentials_ins ON public.credentials AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS credentials_sel ON public.credentials;
CREATE POLICY credentials_sel ON public.credentials AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (employee_user_id = auth.uid())));
DROP POLICY IF EXISTS credentials_upd ON public.credentials;
CREATE POLICY credentials_upd ON public.credentials AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS disciplinary_actions_priv ON public.disciplinary_actions;
CREATE POLICY disciplinary_actions_priv ON public.disciplinary_actions AS PERMISSIVE FOR ALL TO authenticated USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS documents_auth ON public.documents;
CREATE POLICY documents_auth ON public.documents AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS emergency_drills_auth ON public.emergency_drills;
CREATE POLICY emergency_drills_auth ON public.emergency_drills AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS employee_documents_del ON public.employee_documents;
CREATE POLICY employee_documents_del ON public.employee_documents AS PERMISSIVE FOR DELETE TO public USING (is_privileged());
DROP POLICY IF EXISTS employee_documents_write ON public.employee_documents;
CREATE POLICY employee_documents_write ON public.employee_documents AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_privileged());
DROP POLICY IF EXISTS employee_documents_sel ON public.employee_documents;
CREATE POLICY employee_documents_sel ON public.employee_documents AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (employee_id IN ( SELECT employees.id FROM employees WHERE (employees.user_id = auth.uid())))));
DROP POLICY IF EXISTS employee_documents_upd ON public.employee_documents;
CREATE POLICY employee_documents_upd ON public.employee_documents AS PERMISSIVE FOR UPDATE TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS employees_auth ON public.employees;
CREATE POLICY employees_auth ON public.employees AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS exclusion_screenings_priv ON public.exclusion_screenings;
CREATE POLICY exclusion_screenings_priv ON public.exclusion_screenings AS PERMISSIVE FOR ALL TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS form_assignments_del ON public.form_assignments;
CREATE POLICY form_assignments_del ON public.form_assignments AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS form_assignments_ins ON public.form_assignments;
CREATE POLICY form_assignments_ins ON public.form_assignments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS form_assignments_sel ON public.form_assignments;
CREATE POLICY form_assignments_sel ON public.form_assignments AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (assigned_to_user_id = auth.uid())));
DROP POLICY IF EXISTS form_assignments_upd ON public.form_assignments;
CREATE POLICY form_assignments_upd ON public.form_assignments AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS form_templates_auth ON public.form_templates;
CREATE POLICY form_templates_auth ON public.form_templates AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS incidents_insert ON public.incidents;
CREATE POLICY incidents_insert ON public.incidents AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS incidents_select ON public.incidents;
CREATE POLICY incidents_select ON public.incidents AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (reported_by_user_id = auth.uid())));
DROP POLICY IF EXISTS incidents_modify ON public.incidents;
CREATE POLICY incidents_modify ON public.incidents AS PERMISSIVE FOR UPDATE TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS insurance_policies_del ON public.insurance_policies;
CREATE POLICY insurance_policies_del ON public.insurance_policies AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS insurance_policies_ins ON public.insurance_policies;
CREATE POLICY insurance_policies_ins ON public.insurance_policies AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS insurance_policies_sel ON public.insurance_policies;
CREATE POLICY insurance_policies_sel ON public.insurance_policies AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (holder_user_id = auth.uid())));
DROP POLICY IF EXISTS insurance_policies_upd ON public.insurance_policies;
CREATE POLICY insurance_policies_upd ON public.insurance_policies AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS inventory_auth ON public.inventory;
CREATE POLICY inventory_auth ON public.inventory AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS locations_auth ON public.locations;
CREATE POLICY locations_auth ON public.locations AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS nav_preferences_own ON public.nav_preferences;
CREATE POLICY nav_preferences_own ON public.nav_preferences AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_privileged());
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS organization_settings_write ON public.organization_settings;
CREATE POLICY organization_settings_write ON public.organization_settings AS PERMISSIVE FOR ALL TO authenticated USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS organization_settings_select ON public.organization_settings;
CREATE POLICY organization_settings_select ON public.organization_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS osha_records_auth ON public.osha_records;
CREATE POLICY osha_records_auth ON public.osha_records AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS payroll_records_priv ON public.payroll_records;
CREATE POLICY payroll_records_priv ON public.payroll_records AS PERMISSIVE FOR ALL TO authenticated USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS performance_reviews_priv ON public.performance_reviews;
CREATE POLICY performance_reviews_priv ON public.performance_reviews AS PERMISSIVE FOR ALL TO authenticated USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS policy_acks_auth ON public.policy_acks;
CREATE POLICY policy_acks_auth ON public.policy_acks AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles AS PERMISSIVE FOR DELETE TO authenticated USING (is_privileged());
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_privileged() OR ((user_id = auth.uid()) AND (account_role = 'staff'::text))));
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS pto_balances_del ON public.pto_balances;
CREATE POLICY pto_balances_del ON public.pto_balances AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS pto_balances_ins ON public.pto_balances;
CREATE POLICY pto_balances_ins ON public.pto_balances AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS pto_balances_sel ON public.pto_balances;
CREATE POLICY pto_balances_sel ON public.pto_balances AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (user_id = auth.uid())));
DROP POLICY IF EXISTS pto_balances_upd ON public.pto_balances;
CREATE POLICY pto_balances_upd ON public.pto_balances AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS record_versions_read ON public.record_versions;
CREATE POLICY record_versions_read ON public.record_versions AS PERMISSIVE FOR SELECT TO public USING (is_privileged());
DROP POLICY IF EXISTS regulatory_sources_auth ON public.regulatory_sources;
CREATE POLICY regulatory_sources_auth ON public.regulatory_sources AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS risk_cases_priv ON public.risk_cases;
CREATE POLICY risk_cases_priv ON public.risk_cases AS PERMISSIVE FOR ALL TO authenticated USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS role_requirements_priv ON public.role_requirements;
CREATE POLICY role_requirements_priv ON public.role_requirements AS PERMISSIVE FOR ALL TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS sds_records_auth ON public.sds_records;
CREATE POLICY sds_records_auth ON public.sds_records AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS sra_assessments_priv ON public.sra_assessments;
CREATE POLICY sra_assessments_priv ON public.sra_assessments AS PERMISSIVE FOR ALL TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS sra_findings_priv ON public.sra_findings;
CREATE POLICY sra_findings_priv ON public.sra_findings AS PERMISSIVE FOR ALL TO public USING (is_privileged()) WITH CHECK (is_privileged());
DROP POLICY IF EXISTS tasks_auth ON public.tasks;
CREATE POLICY tasks_auth ON public.tasks AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS time_clock_entries_del ON public.time_clock_entries;
CREATE POLICY time_clock_entries_del ON public.time_clock_entries AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS time_clock_entries_ins ON public.time_clock_entries;
CREATE POLICY time_clock_entries_ins ON public.time_clock_entries AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS time_clock_entries_sel ON public.time_clock_entries;
CREATE POLICY time_clock_entries_sel ON public.time_clock_entries AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (user_id = auth.uid())));
DROP POLICY IF EXISTS time_clock_entries_upd ON public.time_clock_entries;
CREATE POLICY time_clock_entries_upd ON public.time_clock_entries AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS time_off_requests_del ON public.time_off_requests;
CREATE POLICY time_off_requests_del ON public.time_off_requests AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS time_off_requests_ins ON public.time_off_requests;
CREATE POLICY time_off_requests_ins ON public.time_off_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS time_off_requests_sel ON public.time_off_requests;
CREATE POLICY time_off_requests_sel ON public.time_off_requests AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (user_id = auth.uid())));
DROP POLICY IF EXISTS time_off_requests_upd ON public.time_off_requests;
CREATE POLICY time_off_requests_upd ON public.time_off_requests AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS training_assignments_del ON public.training_assignments;
CREATE POLICY training_assignments_del ON public.training_assignments AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS training_assignments_ins ON public.training_assignments;
CREATE POLICY training_assignments_ins ON public.training_assignments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS training_assignments_sel ON public.training_assignments;
CREATE POLICY training_assignments_sel ON public.training_assignments AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (assigned_to_user_id = auth.uid())));
DROP POLICY IF EXISTS training_assignments_upd ON public.training_assignments;
CREATE POLICY training_assignments_upd ON public.training_assignments AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS training_attempts_del ON public.training_attempts;
CREATE POLICY training_attempts_del ON public.training_attempts AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS training_attempts_ins ON public.training_attempts;
CREATE POLICY training_attempts_ins ON public.training_attempts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS training_attempts_sel ON public.training_attempts;
CREATE POLICY training_attempts_sel ON public.training_attempts AS PERMISSIVE FOR SELECT TO public USING ((is_privileged() OR (user_id = auth.uid())));
DROP POLICY IF EXISTS training_attempts_upd ON public.training_attempts;
CREATE POLICY training_attempts_upd ON public.training_attempts AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS training_modules_auth ON public.training_modules;
CREATE POLICY training_modules_auth ON public.training_modules AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS training_questions_auth ON public.training_questions;
CREATE POLICY training_questions_auth ON public.training_questions AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS vendors_del ON public.vendors;
CREATE POLICY vendors_del ON public.vendors AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS vendors_ins ON public.vendors;
CREATE POLICY vendors_ins ON public.vendors AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS vendors_sel ON public.vendors;
CREATE POLICY vendors_sel ON public.vendors AS PERMISSIVE FOR SELECT TO public USING (is_privileged());
DROP POLICY IF EXISTS vendors_upd ON public.vendors;
CREATE POLICY vendors_upd ON public.vendors AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));

-- ============================== TRIGGERS =============================
DROP TRIGGER IF EXISTS audit_controlled_substance_logs ON public.controlled_substance_logs;
CREATE TRIGGER audit_controlled_substance_logs AFTER INSERT OR DELETE OR UPDATE ON public.controlled_substance_logs FOR EACH ROW EXECUTE FUNCTION audit_generic();
DROP TRIGGER IF EXISTS version_credentials ON public.credentials;
CREATE TRIGGER version_credentials BEFORE DELETE OR UPDATE ON public.credentials FOR EACH ROW EXECUTE FUNCTION capture_record_version();
DROP TRIGGER IF EXISTS audit_disciplinary_actions ON public.disciplinary_actions;
CREATE TRIGGER audit_disciplinary_actions AFTER INSERT OR DELETE OR UPDATE ON public.disciplinary_actions FOR EACH ROW EXECUTE FUNCTION audit_generic();
DROP TRIGGER IF EXISTS version_documents ON public.documents;
CREATE TRIGGER version_documents BEFORE DELETE OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION capture_record_version();
DROP TRIGGER IF EXISTS audit_employee_documents ON public.employee_documents;
CREATE TRIGGER audit_employee_documents AFTER INSERT OR DELETE OR UPDATE ON public.employee_documents FOR EACH ROW EXECUTE FUNCTION audit_generic();
DROP TRIGGER IF EXISTS version_employee_documents ON public.employee_documents;
CREATE TRIGGER version_employee_documents BEFORE DELETE OR UPDATE ON public.employee_documents FOR EACH ROW EXECUTE FUNCTION capture_record_version();
DROP TRIGGER IF EXISTS audit_payroll_records ON public.payroll_records;
CREATE TRIGGER audit_payroll_records AFTER INSERT OR DELETE OR UPDATE ON public.payroll_records FOR EACH ROW EXECUTE FUNCTION audit_generic();
DROP TRIGGER IF EXISTS audit_performance_reviews ON public.performance_reviews;
CREATE TRIGGER audit_performance_reviews AFTER INSERT OR DELETE OR UPDATE ON public.performance_reviews FOR EACH ROW EXECUTE FUNCTION audit_generic();
DROP TRIGGER IF EXISTS audit_profiles_trg ON public.profiles;
CREATE TRIGGER audit_profiles_trg AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION audit_profiles();
DROP TRIGGER IF EXISTS audit_risk_cases ON public.risk_cases;
CREATE TRIGGER audit_risk_cases AFTER INSERT OR DELETE OR UPDATE ON public.risk_cases FOR EACH ROW EXECUTE FUNCTION audit_generic();
DROP TRIGGER IF EXISTS version_vendors ON public.vendors;
CREATE TRIGGER version_vendors BEFORE DELETE OR UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION capture_record_version();

-- New signups get a base 'staff' profile (invite route then upserts the real role).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-enable RLS on any future table created in public.
DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') EXECUTE FUNCTION rls_auto_enable();

-- ============================== GRANTS ==============================
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
-- anon intentionally receives NO table privileges; every RLS policy gates on auth.uid().

-- Default privileges so tables/sequences created AFTER this baseline inherit the
-- same grants automatically. Their ABSENCE is what let the live DB drift — new
-- MCP-created tables had no service_role DML, breaking server-side admin writes
-- (e.g. the invite route's profiles upsert → "permission denied for table ...").
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- SECURITY DEFINER helper/trigger functions: only what the app needs directly.
revoke all on function public.audit_generic() from public, anon, authenticated;
revoke all on function public.audit_profiles() from public, anon, authenticated;
revoke all on function public.capture_record_version() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.bump_ai_usage() from public, anon;
revoke all on function public.is_privileged() from public, anon;
grant execute on function public.is_privileged() to authenticated;   -- used by RLS policies
grant execute on function public.bump_ai_usage() to authenticated;   -- used by the AI daily-cap RPC
