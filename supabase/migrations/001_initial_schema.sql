-- Compliance Hub — initial schema
-- Run this in the Supabase SQL editor: Dashboard → SQL Editor → New query → paste → Run

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILES (mirrors auth.users 1-to-1)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key default uuid_generate_v4(),
  created_date  timestamptz not null default now(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text not null,
  account_role  text not null default 'staff'
                  check (account_role in ('owner','admin','hr','clinical_leadership','manager','staff','contractor','read_only','inactive')),
  staff_role        text,
  professional_role text,
  department        text check (department in ('ownership','administration','clinical','hr','billing','front_desk','operations','contractor','other')),
  primary_location_id uuid,
  active        boolean not null default true,
  unique (user_id)
);
alter table public.profiles enable row level security;
-- Users can read all profiles; only admins/owners can write
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update" on public.profiles for update using (
  auth.uid() = user_id
  or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.account_role in ('owner','admin'))
);

-- Auto-create profile stub when user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- LOCATIONS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.locations (
  id           uuid primary key default uuid_generate_v4(),
  created_date timestamptz not null default now(),
  name         text not null,
  type         text not null default 'clinic' check (type in ('clinic','office','remote','other')),
  address      text,
  city         text,
  state        text,
  zip          text,
  active       boolean not null default true
);
alter table public.locations enable row level security;
create policy "locations_all" on public.locations for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- TASKS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.tasks (
  id                  uuid primary key default uuid_generate_v4(),
  created_date        timestamptz not null default now(),
  title               text not null,
  description         text,
  category            text,
  status              text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  priority            text not null default 'medium' check (priority in ('low','medium','high','critical')),
  due_date            timestamptz,
  assigned_to_user_id uuid references auth.users(id),
  assigned_to_name    text,
  location_id         uuid references public.locations(id),
  completed_at        timestamptz
);
alter table public.tasks enable row level security;
create policy "tasks_all" on public.tasks for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- EMPLOYEES
-- ─────────────────────────────────────────────────────────────────────────────
create table public.employees (
  id                uuid primary key default uuid_generate_v4(),
  created_date      timestamptz not null default now(),
  first_name        text not null,
  last_name         text not null,
  email             text not null,
  title             text,
  department        text check (department in ('ownership','administration','clinical','hr','billing','front_desk','operations','contractor','other')),
  employment_status text not null default 'active' check (employment_status in ('active','on_leave','terminated','resigned','laid_off')),
  hire_date         date,
  location_id       uuid references public.locations(id)
);
alter table public.employees enable row level security;
create policy "employees_all" on public.employees for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CREDENTIALS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.credentials (
  id                 uuid primary key default uuid_generate_v4(),
  created_date       timestamptz not null default now(),
  employee_user_id   uuid references auth.users(id),
  employee_name      text not null,
  credential_name    text not null,
  credential_type    text not null default 'license' check (credential_type in ('license','certification','dea','cpr_bls_acls','immunization','background_check','clearance','training','other')),
  issuing_body       text,
  credential_number  text,
  issue_date         date,
  expiration_date    date,
  location_id        uuid references public.locations(id),
  document_url       text
);
alter table public.credentials enable row level security;
create policy "credentials_all" on public.credentials for all using (true);
create index on public.credentials (expiration_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- DOCUMENTS (SOP library)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.documents (
  id                      uuid primary key default uuid_generate_v4(),
  created_date            timestamptz not null default now(),
  title                   text not null,
  document_type           text not null default 'policy',
  compliance_area         text,
  summary                 text,
  status                  text not null default 'active' check (status in ('draft','active','under_review','archived')),
  access_level            text not null default 'all_staff' check (access_level in ('all_staff','clinical','hr','admin')),
  version                 text not null default '1.0',
  review_date             date,
  requires_acknowledgment boolean not null default false,
  file_url                text
);
alter table public.documents enable row level security;
create policy "documents_all" on public.documents for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRAINING MODULES
-- ─────────────────────────────────────────────────────────────────────────────
create table public.training_modules (
  id                uuid primary key default uuid_generate_v4(),
  created_date      timestamptz not null default now(),
  title             text not null,
  description       text,
  training_type     text not null default 'compliance',
  frequency_months  int,
  passing_score     int not null default 80,
  active            boolean not null default true
);
alter table public.training_modules enable row level security;
create policy "training_modules_all" on public.training_modules for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRAINING ASSIGNMENTS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.training_assignments (
  id                    uuid primary key default uuid_generate_v4(),
  created_date          timestamptz not null default now(),
  training_module_id    uuid not null references public.training_modules(id) on delete cascade,
  module_title          text not null,
  assigned_to_user_id   uuid not null references auth.users(id),
  assigned_to_name      text not null,
  status                text not null default 'assigned' check (status in ('assigned','in_progress','completed')),
  due_date              date,
  completed_at          timestamptz,
  score                 int
);
alter table public.training_assignments enable row level security;
create policy "training_assignments_all" on public.training_assignments for all using (true);
create index on public.training_assignments (assigned_to_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- OSHA RECORDS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.osha_records (
  id                   uuid primary key default uuid_generate_v4(),
  created_date         timestamptz not null default now(),
  record_title         text not null,
  record_type          text not null default 'inspection' check (record_type in ('injury','illness','hazcom','training','inspection','corrective_action')),
  event_date           date,
  description          text,
  status               text not null default 'open' check (status in ('open','in_progress','closed')),
  recordability_status text not null default 'not_reviewed' check (recordability_status in ('not_reviewed','recordable','non_recordable'))
);
alter table public.osha_records enable row level security;
create policy "osha_records_all" on public.osha_records for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SDS RECORDS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.sds_records (
  id           uuid primary key default uuid_generate_v4(),
  created_date timestamptz not null default now(),
  product_name text not null,
  manufacturer text,
  upc          text,
  signal_word  text not null default 'NONE' check (signal_word in ('DANGER','WARNING','CAUTION','NONE')),
  status       text not null default 'active' check (status in ('active','missing','needs_review','archived'))
);
alter table public.sds_records enable row level security;
create policy "sds_records_all" on public.sds_records for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- RISK MANAGEMENT CASES
-- ─────────────────────────────────────────────────────────────────────────────
create table public.risk_cases (
  id               uuid primary key default uuid_generate_v4(),
  created_date     timestamptz not null default now(),
  case_title       text not null,
  case_type        text not null default 'clinical',
  description      text,
  severity         text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status           text not null default 'open' check (status in ('open','investigating','resolved','closed')),
  access_level     text not null default 'standard' check (access_level in ('standard','restricted')),
  reported_by_name text,
  incident_date    date
);
alter table public.risk_cases enable row level security;
create policy "risk_cases_all" on public.risk_cases for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- POLICY ACKNOWLEDGMENTS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.policy_acks (
  id             uuid primary key default uuid_generate_v4(),
  created_date   timestamptz not null default now(),
  user_id        uuid not null references auth.users(id),
  user_name      text not null,
  document_id    uuid not null references public.documents(id) on delete cascade,
  document_title text not null,
  status         text not null default 'acknowledged' check (status in ('acknowledged','expired')),
  acknowledged_at timestamptz,
  expires_at      timestamptz
);
alter table public.policy_acks enable row level security;
create policy "policy_acks_all" on public.policy_acks for all using (true);
create index on public.policy_acks (user_id, document_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- REGULATORY SOURCES
-- ─────────────────────────────────────────────────────────────────────────────
create table public.regulatory_sources (
  id             uuid primary key default uuid_generate_v4(),
  created_date   timestamptz not null default now(),
  title          text not null,
  citation_label text,
  issuing_body   text,
  source_type    text not null default 'regulation' check (source_type in ('regulation','guidance','internal','statute')),
  jurisdiction   text,
  review_status  text not null default 'current' check (review_status in ('current','needs_review','under_review','archived')),
  last_checked_at timestamptz,
  official_url   text
);
alter table public.regulatory_sources enable row level security;
create policy "regulatory_sources_all" on public.regulatory_sources for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- INSURANCE POLICIES
-- ─────────────────────────────────────────────────────────────────────────────
create table public.insurance_policies (
  id                   uuid primary key default uuid_generate_v4(),
  created_date         timestamptz not null default now(),
  policy_name          text not null,
  policy_type          text not null default 'malpractice',
  carrier_name         text,
  policy_number        text,
  coverage_amount_cents bigint,
  annual_premium_cents  bigint,
  renewal_date         date
);
alter table public.insurance_policies enable row level security;
create policy "insurance_policies_all" on public.insurance_policies for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- EMERGENCY DRILLS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.emergency_drills (
  id               uuid primary key default uuid_generate_v4(),
  created_date     timestamptz not null default now(),
  drill_title      text not null,
  drill_type       text not null default 'fire',
  scheduled_date   date,
  status           text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  participant_count int not null default 0
);
alter table public.emergency_drills enable row level security;
create policy "emergency_drills_all" on public.emergency_drills for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- INVENTORY
-- ─────────────────────────────────────────────────────────────────────────────
create table public.inventory (
  id                    uuid primary key default uuid_generate_v4(),
  created_date          timestamptz not null default now(),
  item_name             text not null,
  item_type             text not null default 'equipment',
  status                text not null default 'active' check (status in ('active','broken','removed')),
  condition             text not null default 'good' check (condition in ('new','good','fair','poor')),
  location_id           uuid references public.locations(id),
  removed_from_inventory boolean not null default false
);
alter table public.inventory enable row level security;
create policy "inventory_all" on public.inventory for all using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTS — allow authenticated users to read/write all tables
-- ─────────────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage on all sequences in schema public to authenticated;
grant usage on all sequences in schema public to anon;
