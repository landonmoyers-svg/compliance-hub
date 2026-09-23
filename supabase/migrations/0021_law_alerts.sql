-- Regulatory change feed for the obligation register (2026-09-02).
--
-- Why: a register of obligations is only as good as the day it was written. This
-- table holds what the government itself published since — pulled from the
-- Federal Register API — matched against the obligations we track, so a rule
-- change arrives as a reviewable item instead of a surprise.
--
-- Applied to prod as `law_alerts`.

create table if not exists public.law_alerts (
  id uuid primary key default uuid_generate_v4(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id) on delete cascade,

  source text not null default 'federal_register',
  document_number text,                       -- the publisher's own id, used to dedupe
  doc_type text,                              -- Rule, Proposed Rule, Notice
  title text not null,
  abstract text,
  agencies text[] not null default '{}',
  publication_date date,
  effective_date date,
  comments_close_date date,
  html_url text,
  pdf_url text,

  /** Why this landed in front of us. */
  matched_terms text[] not null default '{}',
  matched_obligation_id uuid references public.law_obligations(id) on delete set null,

  status text not null default 'new',         -- new | reviewed | actioned | dismissed
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text
);

comment on table public.law_alerts is
  'Published regulatory changes matched against our obligation register. One row per government document.';

do $$ begin
  alter table public.law_alerts
    add constraint law_alerts_status_check
    check (status in ('new', 'reviewed', 'actioned', 'dismissed'));
exception when duplicate_object then null; end $$;

create unique index if not exists law_alerts_dedupe_idx
  on public.law_alerts (org_id, source, document_number)
  where document_number is not null;

create index if not exists law_alerts_org_status_idx
  on public.law_alerts (org_id, status, publication_date desc);

drop trigger if exists trg_set_org_id on public.law_alerts;
create trigger trg_set_org_id before insert on public.law_alerts
  for each row execute function public.set_org_id();

alter table public.law_alerts enable row level security;

drop policy if exists law_alerts_read  on public.law_alerts;
drop policy if exists law_alerts_write on public.law_alerts;

create policy law_alerts_read on public.law_alerts
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy law_alerts_write on public.law_alerts
  for all to authenticated
  using (org_id in (select public.my_org_ids()) and (select public.is_privileged(org_id)))
  with check (org_id in (select public.my_org_ids()) and (select public.is_privileged(org_id)));
