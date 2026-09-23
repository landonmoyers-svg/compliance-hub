-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260909164915  med_samples_module
-- MEDICATION SAMPLES — per-site stock of drug-rep samples, the pace they are
-- dispensed at, and who to call for more. Mirrors medical_supplies (a product
-- row + a movement ledger) so the tooling, RLS shape and mental model match
-- what staff already use.

-- 1. The rep to call. Kept separate from the sample because one rep covers many
--    products and reps change more often than the products do.
create table if not exists public.drug_reps (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  name text not null,
  company text,
  phone text,
  email text,
  territory text,
  last_contact_date date,
  active boolean not null default true,
  notes text
);

-- 2. The sample itself, held AT A SITE. location_id is what keeps Murray and
--    Lehi stock separate, and it feeds can_see_location() so a site-scoped
--    member only sees their own.
create table if not exists public.med_samples (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  name text not null,
  strength text,
  form text not null default 'box',
  manufacturer text,
  ndc text,
  location_id uuid,
  room text,
  quantity_on_hand numeric not null default 0,
  unit text not null default 'box',
  par_level numeric not null default 0,
  lot_number text,
  expiration_date date,
  rep_id uuid references public.drug_reps(id) on delete set null,
  image_url text,
  captured_at timestamptz,
  captured_lat double precision,
  captured_lng double precision,
  ai_identified boolean not null default false,
  ai_confidence text,
  active boolean not null default true,
  notes text
);

-- 3. The movement ledger. This is what makes pace measurable: burn rate is
--    derived from dispense events over time, never from a stored guess.
--    occurred_at (not created_date) is the event date, so a back-dated entry
--    still lands in the right week.
create table if not exists public.med_sample_logs (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  sample_id uuid not null references public.med_samples(id) on delete cascade,
  action text not null default 'dispensed',
  quantity_delta numeric not null default 0,
  balance_after numeric,
  occurred_at timestamptz not null default now(),
  lot_number text,
  by_name text,
  note text
);

create index if not exists drug_reps_org_idx on public.drug_reps(org_id);
create index if not exists med_samples_org_idx on public.med_samples(org_id);
create index if not exists med_samples_location_idx on public.med_samples(location_id);
create index if not exists med_sample_logs_org_idx on public.med_sample_logs(org_id);
create index if not exists med_sample_logs_sample_idx on public.med_sample_logs(sample_id, occurred_at desc);

alter table public.drug_reps enable row level security;
alter table public.med_samples enable row level security;
alter table public.med_sample_logs enable row level security;

grant select, insert, update, delete on public.drug_reps to authenticated;
grant select, insert, update, delete on public.med_samples to authenticated;
grant select, insert, update, delete on public.med_sample_logs to authenticated;
grant all on public.drug_reps to service_role;
grant all on public.med_samples to service_role;
grant all on public.med_sample_logs to service_role;

-- Policies mirror medical_supplies exactly: org boundary, then site scoping on
-- the table that carries a location, then is_writer() to write.
create policy drug_reps_read on public.drug_reps for select to authenticated
  using (org_id in (select my_org_ids()));
create policy drug_reps_write on public.drug_reps for all to authenticated
  using (org_id in (select my_org_ids()) and (select is_writer(drug_reps.org_id)))
  with check (org_id in (select my_org_ids()) and (select is_writer(drug_reps.org_id)));

create policy med_samples_read on public.med_samples for select to authenticated
  using (org_id in (select my_org_ids()) and can_see_location(org_id, location_id));
create policy med_samples_write on public.med_samples for all to authenticated
  using (org_id in (select my_org_ids()) and can_see_location(org_id, location_id) and (select is_writer(med_samples.org_id)))
  with check (org_id in (select my_org_ids()) and can_see_location(org_id, location_id) and (select is_writer(med_samples.org_id)));

create policy med_sample_logs_read on public.med_sample_logs for select to authenticated
  using (org_id in (select my_org_ids()));
create policy med_sample_logs_write on public.med_sample_logs for all to authenticated
  using (org_id in (select my_org_ids()) and (select is_writer(med_sample_logs.org_id)))
  with check (org_id in (select my_org_ids()) and (select is_writer(med_sample_logs.org_id)));

-- org_id auto-stamp, same as every other table
create trigger trg_set_org_id before insert on public.drug_reps
  for each row execute function public.set_org_id();
create trigger trg_set_org_id before insert on public.med_samples
  for each row execute function public.set_org_id();
create trigger trg_set_org_id before insert on public.med_sample_logs
  for each row execute function public.set_org_id();
