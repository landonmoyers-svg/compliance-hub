-- CONTROLLED SUBSTANCES — the old paper logs belong with the DEA records.
--
-- First cut of this feature added a separate cs_archive_logs table. Wrong: a
-- vial log or an administration log IS a DEA record, and the Hub already has a
-- place for those (scanned 222s, biennial inventories, Form 41/106) with
-- upload, reference number, period and location. Two lists for the same paper
-- would be worse than one. That table is dropped (it never held a row) and
-- dea_records grows the few things a LOG needs that a filing doesn't.
--
-- THE BOUNDARY: DEA recordkeeping requires the patient to be identified, so the
-- chart number stays on the record — but the record then lives in SharePoint,
-- which the practice's Microsoft BAA covers. The Hub keeps the link plus the
-- de-identified entries needed to reconcile a vial. The check constraint makes
-- that structural rather than a habit.

drop table if exists public.cs_archive_logs;

alter table public.dea_records
  -- Where a page with patient identifiers actually lives.
  add column if not exists contains_patient_identifiers boolean not null default false,
  add column if not exists external_url text,
  add column if not exists external_system text,
  -- De-identified lines read off the log:
  -- [{date, vialLabel, action, amount, unit, staff, witness, pageRef, note}]
  add column if not exists entries jsonb not null default '[]'::jsonb,
  -- Totals as written on the log, for the period cross-check.
  add column if not exists opening_balance numeric,
  add column if not exists received_total numeric,
  add column if not exists administered_total numeric,
  add column if not exists wasted_total numeric,
  add column if not exists closing_balance numeric,
  add column if not exists unit text,
  add column if not exists substance_name text,
  add column if not exists reconciled boolean not null default false,
  add column if not exists reconciled_by_name text,
  add column if not exists reconciled_at timestamptz,
  add column if not exists discrepancy boolean not null default false,
  add column if not exists discrepancy_note text;

-- A record whose page carries chart numbers may be LINKED, never uploaded here.
alter table public.dea_records drop constraint if exists dea_records_phi_stays_external;
alter table public.dea_records add constraint dea_records_phi_stays_external
  check (not contains_patient_identifiers or document_url is null);

create index if not exists dea_records_type_idx on public.dea_records(org_id, record_type, record_date desc);
