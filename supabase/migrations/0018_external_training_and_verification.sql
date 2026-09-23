-- External (vendor-delivered) training + completion verification (2026-09-02).
--
-- Why: some required training is delivered by an outside platform (today:
-- Mineral, reached through Select Health). The course plays over there; the
-- RECORD of who completed it belongs here, because the Hub is the system of
-- record and vendor access ends with the subscription.
--
-- Two-step evidence model:
--   1. employee opens the course from the Hub, completes it in the vendor
--      system, returns and attests with the vendor certificate attached
--      -> verification_status = 'provisional'
--   2. an admin imports the vendor's own completion report
--      -> matching rows become 'verified'; contradictions become 'discrepancy'
--
-- Applied to prod as `external_training_and_verification`.

/* ---------------------------- modules ------------------------------ */

alter table public.training_modules
  add column if not exists delivery text not null default 'in_app',
  add column if not exists provider text,
  add column if not exists external_url text,
  add column if not exists provider_course_code text,
  add column if not exists evidence_required boolean not null default true;

do $$ begin
  alter table public.training_modules
    add constraint training_modules_delivery_check
    check (delivery in ('in_app', 'external'));
exception when duplicate_object then null; end $$;

comment on column public.training_modules.delivery is
  'in_app = quiz/attestation inside the Hub; external = played in a vendor platform and evidenced here.';
comment on column public.training_modules.provider is
  'Vendor delivering an external module (e.g. Mineral).';
comment on column public.training_modules.external_url is
  'Deep link the employee is sent to. Blank falls back to the provider default.';
comment on column public.training_modules.provider_course_code is
  'Course title/code as the vendor report spells it — used to match import rows.';

/* -------------------------- assignments ---------------------------- */

alter table public.training_assignments
  add column if not exists completion_source text,
  add column if not exists verification_status text,
  add column if not exists certificate_url text,
  add column if not exists external_completed_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by_name text,
  add column if not exists import_batch_id uuid,
  add column if not exists reconciliation_note text;

do $$ begin
  alter table public.training_assignments
    add constraint training_assignments_completion_source_check
    check (completion_source is null or completion_source in ('quiz','attestation','external_attested','import'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.training_assignments
    add constraint training_assignments_verification_status_check
    check (verification_status is null or verification_status in ('provisional','verified','discrepancy'));
exception when duplicate_object then null; end $$;

comment on column public.training_assignments.completion_source is
  'How completion was recorded: in-app quiz, in-app attestation, self-attested vendor course, or vendor-report import.';
comment on column public.training_assignments.verification_status is
  'provisional = self-reported; verified = confirmed by the vendor report; discrepancy = report contradicts the attestation.';
comment on column public.training_assignments.certificate_url is
  'Storage path of the vendor completion certificate (private documents bucket).';

/* ------------------------- import batches -------------------------- */

create table if not exists public.training_imports (
  id uuid primary key default uuid_generate_v4(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id) on delete cascade,
  provider text not null default 'Mineral',
  file_name text,
  imported_by_name text,
  period_label text,
  row_count integer not null default 0,
  matched_count integer not null default 0,
  verified_count integer not null default 0,
  discrepancy_count integer not null default 0,
  unmatched jsonb not null default '[]'::jsonb,
  notes text
);

comment on table public.training_imports is
  'One row per vendor completion-report import — the audit answer to "where did this verified completion come from?".';

drop trigger if exists trg_set_org_id on public.training_imports;
create trigger trg_set_org_id before insert on public.training_imports
  for each row execute function public.set_org_id();

alter table public.training_imports enable row level security;

drop policy if exists training_imports_read  on public.training_imports;
drop policy if exists training_imports_write on public.training_imports;

create policy training_imports_read on public.training_imports
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy training_imports_write on public.training_imports
  for all to authenticated
  using (org_id in (select public.my_org_ids()) and (select public.is_privileged(org_id)))
  with check (org_id in (select public.my_org_ids()) and (select public.is_privileged(org_id)));

create index if not exists training_imports_org_created_idx
  on public.training_imports (org_id, created_date desc);

create index if not exists training_assignments_import_batch_idx
  on public.training_assignments (import_batch_id);
