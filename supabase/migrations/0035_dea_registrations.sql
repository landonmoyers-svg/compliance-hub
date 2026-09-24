-- DEA registrations as a first-class thing.
--
-- Records belong to a REGISTRATION, not to a clinic and not to a person — and
-- a registration is both. A DEA number is tied to an address, so the same
-- prescriber holds a different number at each site: one for Murray Clinic 1,
-- another for Murray Clinic 2. Meanwhile a different prescriber orders for
-- Lehi, and location registrations are coming that will retire the individual
-- ones site by site.
--
-- Two consequences the rest of the code leans on:
--
--   • Reconciliation runs WITHIN a registration. A vial received under one
--     number and administered under another has crossed a boundary that
--     matters; totalling across it would show a balance where there is a gap.
--   • A retired registration is never closed to amendments. The registrant
--     stays personally responsible for those records, and an inspector can
--     require a correction long after the number stopped being used.

create table if not exists public.dea_registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  created_date timestamptz not null default now(),
  dea_number text not null,
  registrant_name text not null,
  registrant_type text not null default 'individual'
    check (registrant_type in ('individual', 'location')),
  location_id uuid not null references public.locations(id) on delete restrict,
  effective_from date,
  retired_on date,
  schedules text,
  notes text
);

create index if not exists dea_registrations_location_idx on public.dea_registrations (org_id, location_id);

alter table public.dea_records
  add column if not exists registration_id uuid references public.dea_registrations(id) on delete set null;

create index if not exists dea_records_registration_idx
  on public.dea_records (registration_id) where registration_id is not null;

alter table public.dea_registrations enable row level security;

drop policy if exists dea_registrations_read on public.dea_registrations;
create policy dea_registrations_read on public.dea_registrations
  for select using (org_id in (select my_org_ids()));

drop policy if exists dea_registrations_write on public.dea_registrations;
create policy dea_registrations_write on public.dea_registrations
  for all using (org_id in (select my_org_ids()) and clinical_admin_or_owner())
  with check (org_id in (select my_org_ids()) and clinical_admin_or_owner());

drop trigger if exists trg_set_org_id on public.dea_registrations;
create trigger trg_set_org_id
  before insert on public.dea_registrations
  for each row execute function public.set_org_id();
