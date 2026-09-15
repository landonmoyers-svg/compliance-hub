-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260823023922  mt_phase1a_organizations_and_memberships
-- MULTI-TENANCY PHASE 1a (additive only — no existing policy or query changes).
-- Introduces the org + membership model. Role moves from a single global
-- profiles.account_role to a PER-ORG membership, so an admin at company A is
-- not an admin at company B. Nothing reads these yet.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  name text not null,
  slug text unique,
  active boolean not null default true
);
alter table public.organizations enable row level security;
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;

-- Membership = (user, org) -> role. all_locations=false means the member is
-- limited to the sites listed in org_member_locations.
create table if not exists public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  account_role text not null,
  all_locations boolean not null default true,
  active boolean not null default true,
  unique (org_id, user_id)
);
create index if not exists org_memberships_user_idx on public.org_memberships(user_id) where active;
create index if not exists org_memberships_org_idx on public.org_memberships(org_id);
alter table public.org_memberships enable row level security;
grant select, insert, update, delete on public.org_memberships to authenticated;
grant all on public.org_memberships to service_role;

create table if not exists public.org_member_locations (
  membership_id uuid not null references public.org_memberships(id) on delete cascade,
  location_id uuid not null,
  primary key (membership_id, location_id)
);
alter table public.org_member_locations enable row level security;
grant select, insert, update, delete on public.org_member_locations to authenticated;
grant all on public.org_member_locations to service_role;

-- Seed the existing practice as org #1 and migrate every current login into it,
-- preserving the role they have today.
insert into public.organizations (name, slug)
select coalesce((select org_name from public.organization_settings limit 1), 'Lone Peak Psychiatry'),
       'lone-peak'
where not exists (select 1 from public.organizations);

insert into public.org_memberships (org_id, user_id, account_role, all_locations, active)
select (select id from public.organizations order by created_date limit 1),
       p.user_id, coalesce(p.account_role,'staff'), true, coalesce(p.active, true)
from public.profiles p
where p.user_id is not null
on conflict (org_id, user_id) do nothing;
