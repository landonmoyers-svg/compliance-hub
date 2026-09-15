-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260823220427  mt_phase4a_platform_admin_flag
-- MULTI-TENANCY PHASE 4a. Creating a COMPANY is a platform-level action, above
-- any single org's owner/admin — an owner of company A must never be able to
-- spin up company B. Mark the platform operator explicitly.
alter table public.profiles
  add column if not exists platform_admin boolean not null default false;

-- Grant it to the existing owner of org #1 (the platform operator today).
update public.profiles
set platform_admin = true
where user_id = (
  select m.user_id from public.org_memberships m
  join public.organizations o on o.id = m.org_id
  where m.account_role = 'owner' and m.active
  order by o.created_date, m.created_date
  limit 1
);

-- Server-side check used by the create-organization route.
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and coalesce(platform_admin, false)
  );
$$;
grant execute on function public.is_platform_admin() to authenticated, service_role;
