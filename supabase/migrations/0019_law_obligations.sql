-- Employment-law obligation register + applicability engine (2026-09-02).
--
-- Why: the Hub already proves what we DID. This is the other half — what the law
-- requires of us in the first place, keyed to headcount, state and plan status,
-- with the primary authority for each so a claim can always be traced back to
-- the statute or rule rather than to somebody's summary of it.
--
-- Applied to prod as `law_obligations`.

create table if not exists public.law_obligations (
  id uuid primary key default uuid_generate_v4(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id) on delete cascade,

  title text not null,
  jurisdiction text not null default 'federal',      -- 'federal' or a state code ('UT')
  topic text not null default 'other',
  authority_body text,                               -- EEOC, DOL/WHD, OSHA, IRS, Utah Labor Commission…
  citation_label text,                               -- '29 CFR 1904.2', 'Utah Code 34-28-5'
  official_url text,                                 -- the government page the text came from

  -- Applicability. Null bounds mean "no bound on that side".
  applies_all boolean not null default false,        -- true = applies regardless of headcount
  min_employees integer,
  max_employees integer,
  count_basis text,                                  -- how the count is measured, in the law's own terms
  conditions text[] not null default '{}',           -- 'group_health_plan', 'federal_contractor', 'osha_partially_exempt_naics'…

  summary text,                                      -- our words, not the vendor's
  employer_duties text[] not null default '{}',
  deadline_note text,
  penalty_note text,

  -- Provenance. source_quote is the primary text this row was written from.
  source_quote text,
  verified_at timestamptz,
  verified_by_name text,
  review_status text not null default 'needs_review',
  next_review_date date,

  -- Coverage: what in the Hub already discharges this duty.
  linked_document_id uuid references public.documents(id) on delete set null,
  linked_training_module_id uuid references public.training_modules(id) on delete set null,
  linked_form_template_id uuid references public.form_templates(id) on delete set null,
  regulatory_source_id uuid references public.regulatory_sources(id) on delete set null,

  notes text,
  active boolean not null default true
);

comment on table public.law_obligations is
  'Employment-law obligations keyed to headcount/state/plan status, each carrying its primary authority. Feeds the applicable-law view.';
comment on column public.law_obligations.count_basis is
  'How the law counts employees — e.g. "20 or more calendar weeks in the current or preceding year".';
comment on column public.law_obligations.source_quote is
  'Verbatim text from the cited government source that this row was written from.';

do $$ begin
  alter table public.law_obligations
    add constraint law_obligations_review_status_check
    check (review_status in ('verified', 'needs_review', 'superseded'));
exception when duplicate_object then null; end $$;

drop trigger if exists trg_set_org_id on public.law_obligations;
create trigger trg_set_org_id before insert on public.law_obligations
  for each row execute function public.set_org_id();

alter table public.law_obligations enable row level security;

drop policy if exists law_obligations_read  on public.law_obligations;
drop policy if exists law_obligations_write on public.law_obligations;

create policy law_obligations_read on public.law_obligations
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy law_obligations_write on public.law_obligations
  for all to authenticated
  using (org_id in (select public.my_org_ids()) and (select public.is_privileged(org_id)))
  with check (org_id in (select public.my_org_ids()) and (select public.is_privileged(org_id)));

create index if not exists law_obligations_org_idx on public.law_obligations (org_id, jurisdiction, topic);
create index if not exists law_obligations_threshold_idx on public.law_obligations (org_id, min_employees);
