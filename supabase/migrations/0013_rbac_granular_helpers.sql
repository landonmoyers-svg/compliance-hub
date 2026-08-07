-- Granular access helpers (2026-08-05) mirroring is_privileged()/hr_admin_or_owner(),
-- so RLS can enforce the documented minimum-necessary matrix instead of one coarse
-- privileged tier. Applied to prod as `rbac_granular_helpers`.
create or replace function public.owner_or_admin()
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.profiles where user_id = auth.uid() and account_role in ('owner','admin')); $$;

create or replace function public.owner_or_hr()
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.profiles where user_id = auth.uid() and account_role in ('owner','hr')); $$;

create or replace function public.clinical_admin_or_owner()
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.profiles where user_id = auth.uid() and account_role in ('owner','admin','clinical_leadership')); $$;
