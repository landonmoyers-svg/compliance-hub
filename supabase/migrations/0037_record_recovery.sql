-- Reconstructing records that were never kept.
--
-- A practice that grew quickly can reach a point where nobody knows what
-- controlled-substance paperwork exists and what doesn't. The receipts side is
-- usually recoverable — distributors keep the order history for every DEA
-- number they ship to — but recovering it takes weeks of requests and replies,
-- and the state of that effort otherwise lives in somebody's head.
--
-- Each row is a claim about one span of time: this kind of record, for this
-- registration, from this source, is missing / requested / recovered. What the
-- Hub does with them is work out the GAPS — the stretches between a
-- registration taking effect and today that nothing covers.

create table if not exists public.record_recovery_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  created_date timestamptz not null default now(),
  registration_id uuid not null references public.dea_registrations(id) on delete cascade,
  record_kind text not null default 'purchase'
    check (record_kind in ('purchase', 'administration', 'inventory', 'destruction', 'other')),
  source_name text,
  period_start date not null,
  period_end date not null,
  status text not null default 'missing'
    check (status in ('missing', 'requested', 'recovered', 'not_applicable')),
  requested_on date,
  received_on date,
  notes text,
  constraint record_recovery_period_order check (period_end >= period_start)
);

create index if not exists record_recovery_registration_idx
  on public.record_recovery_items (org_id, registration_id, period_start);

alter table public.record_recovery_items enable row level security;

drop policy if exists record_recovery_read on public.record_recovery_items;
create policy record_recovery_read on public.record_recovery_items
  for select using (org_id in (select my_org_ids()));

drop policy if exists record_recovery_write on public.record_recovery_items;
create policy record_recovery_write on public.record_recovery_items
  for all using (org_id in (select my_org_ids()) and clinical_admin_or_owner())
  with check (org_id in (select my_org_ids()) and clinical_admin_or_owner());

drop trigger if exists trg_set_org_id on public.record_recovery_items;
create trigger trg_set_org_id
  before insert on public.record_recovery_items
  for each row execute function public.set_org_id();
