-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260823024033  mt_phase1c_org_aware_role_helpers
-- MULTI-TENANCY PHASE 1c (additive). Org-aware role helpers, created as
-- OVERLOADS that take the row's org_id. The existing zero-arg helpers are left
-- untouched, so no current policy changes behavior. Phase 3 will swap policies
-- over to these.
-- Role sets mirror the existing helpers EXACTLY.

alter table public.org_memberships
  add column if not exists sensitive_docs_access boolean not null default false;

update public.org_memberships m
set sensitive_docs_access = coalesce(p.sensitive_docs_access, false)
from public.profiles p
where p.user_id = m.user_id and m.sensitive_docs_access = false;

-- Which orgs does the caller actively belong to? THE hard tenant boundary.
create or replace function public.my_org_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select org_id from public.org_memberships
  where user_id = auth.uid() and active;
$$;

-- Does the caller hold one of these roles IN THAT SPECIFIC ORG?
create or replace function public.has_org_role(org uuid, roles text[])
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and active
      and org_id = org and account_role = any(roles)
  );
$$;

create or replace function public.is_privileged(org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.has_org_role(org, array['owner','admin','hr','clinical_leadership']);
$$;

create or replace function public.owner_or_admin(org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.has_org_role(org, array['owner','admin']);
$$;

create or replace function public.hr_admin_or_owner(org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.has_org_role(org, array['owner','admin','hr']);
$$;

create or replace function public.owner_or_hr(org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.has_org_role(org, array['owner','hr']);
$$;

create or replace function public.clinical_admin_or_owner(org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.has_org_role(org, array['owner','admin','clinical_leadership']);
$$;

-- is_writer = any active member EXCEPT read_only/inactive, in that org.
create or replace function public.is_writer(org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and active
      and org_id = org and account_role not in ('read_only','inactive')
  );
$$;

create or replace function public.can_view_sensitive_docs(org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and active and org_id = org
      and (account_role in ('owner','hr') or coalesce(sensitive_docs_access,false))
  );
$$;

-- Site scoping INSIDE an org: org-wide members see every location; site-scoped
-- members only their assigned ones. Rows with no location are org-wide.
create or replace function public.can_see_location(org uuid, loc uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select loc is null or exists (
    select 1 from public.org_memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = org
      and (m.all_locations
           or exists (select 1 from public.org_member_locations ml
                      where ml.membership_id = m.id and ml.location_id = loc))
  );
$$;

grant execute on function public.my_org_ids() to authenticated, service_role;
grant execute on function public.has_org_role(uuid, text[]) to authenticated, service_role;
grant execute on function public.is_privileged(uuid) to authenticated, service_role;
grant execute on function public.owner_or_admin(uuid) to authenticated, service_role;
grant execute on function public.hr_admin_or_owner(uuid) to authenticated, service_role;
grant execute on function public.owner_or_hr(uuid) to authenticated, service_role;
grant execute on function public.clinical_admin_or_owner(uuid) to authenticated, service_role;
grant execute on function public.is_writer(uuid) to authenticated, service_role;
grant execute on function public.can_view_sensitive_docs(uuid) to authenticated, service_role;
grant execute on function public.can_see_location(uuid, uuid) to authenticated, service_role;
