-- CONTROLLED SUBSTANCES — the paper logs from before the Hub (and from the
-- retired Murray Clinic 1 log), kept digitally and reconcilable.
--
-- THE BOUNDARY THIS TABLE ENFORCES: administration logs carry patient chart
-- numbers (Jane / Luminello / Athena), which are HIPAA identifiers. Those pages
-- stay in SharePoint, which IS covered by the practice's Microsoft BAA; the Hub
-- keeps only a LINK plus the de-identified facts needed to reconcile a vial —
-- date, vial, amount, waste, staff, witness, and which page it came from.
-- A check constraint makes that structural: a log marked as carrying patient
-- identifiers cannot also carry a file uploaded into the Hub's own storage.

create table if not exists public.cs_archive_logs (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  title text not null,
  log_type text not null default 'vial_log'
    check (log_type in ('vial_log','administration_log','count_sheet','destruction','transfer','other')),
  location_id uuid references public.locations(id) on delete set null,
  substance_name text,
  period_start date,
  period_end date,

  -- Where the page actually lives.
  contains_patient_identifiers boolean not null default false,
  external_url text,                    -- SharePoint / OneDrive item (covered by the Microsoft BAA)
  external_system text default 'sharepoint',
  document_url text,                    -- only for pages with NO patient identifiers

  -- De-identified entries read off the page:
  -- [{date, vialLabel, action, amount, unit, staff, witness, pageRef, note}]
  entries jsonb not null default '[]'::jsonb,

  -- Period totals as written on the log, for the cross-check.
  opening_balance numeric,
  received_total numeric,
  administered_total numeric,
  wasted_total numeric,
  closing_balance numeric,
  unit text default 'mL',

  reconciled boolean not null default false,
  reconciled_by_name text,
  reconciled_at timestamptz,
  discrepancy boolean not null default false,
  discrepancy_note text,
  notes text,

  -- PHI pages may be linked, never stored here.
  constraint cs_archive_logs_phi_stays_external
    check (not contains_patient_identifiers or document_url is null),
  -- A log has to live somewhere.
  constraint cs_archive_logs_has_a_source
    check (external_url is not null or document_url is not null)
);

create index if not exists cs_archive_logs_org_idx on public.cs_archive_logs(org_id, period_start desc);
create index if not exists cs_archive_logs_location_idx on public.cs_archive_logs(location_id);

alter table public.cs_archive_logs enable row level security;
grant select, insert, update, delete on public.cs_archive_logs to authenticated;
grant all on public.cs_archive_logs to service_role;
create trigger trg_set_org_id before insert on public.cs_archive_logs
  for each row execute function public.set_org_id();

create policy cs_archive_logs_read on public.cs_archive_logs for select to authenticated
  using (org_id in (select my_org_ids()) and can_see_location(org_id, location_id));
create policy cs_archive_logs_write on public.cs_archive_logs for all to authenticated
  using (org_id in (select my_org_ids()) and can_see_location(org_id, location_id) and (select clinical_admin_or_owner(cs_archive_logs.org_id)))
  with check (org_id in (select my_org_ids()) and can_see_location(org_id, location_id) and (select clinical_admin_or_owner(cs_archive_logs.org_id)));
