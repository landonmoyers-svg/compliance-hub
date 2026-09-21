-- EMERGENCY ALERT — anchor responder setup on the EMPLOYEE, not the login.
-- Most staff don't have a Hub login yet (2026-09-21: 4 logins, 42 employees),
-- but an admin must be able to set everyone's site schedule and response roles
-- now. A person's profile follows them once employees.user_id links a login.

alter table public.emergency_responder_profiles
  add column if not exists employee_id uuid references public.employees(id) on delete cascade,
  alter column user_id drop not null;
alter table public.emergency_responder_profiles
  add constraint emergency_responder_profiles_person check (user_id is not null or employee_id is not null);
create unique index if not exists emergency_responder_profiles_employee_uq
  on public.emergency_responder_profiles(org_id, employee_id) where employee_id is not null;

alter table public.emergency_location_roles
  add column if not exists employee_id uuid references public.employees(id) on delete cascade,
  alter column user_id drop not null;
alter table public.emergency_location_roles
  add constraint emergency_location_roles_person check (user_id is not null or employee_id is not null);

-- "Is this row about me?" — by login, or by the employee record my login is linked to.
create or replace function public.is_my_person(p_user uuid, p_employee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_user is not null and p_user = auth.uid())
      or (p_employee is not null and exists (
            select 1 from public.employees e where e.id = p_employee and e.user_id = auth.uid()))
$$;
grant execute on function public.is_my_person(uuid, uuid) to authenticated;

drop policy if exists emergency_responder_profiles_write on public.emergency_responder_profiles;
create policy emergency_responder_profiles_write on public.emergency_responder_profiles for all to authenticated
  using (org_id in (select my_org_ids())
         and (public.is_my_person(user_id, employee_id) or (select is_privileged(emergency_responder_profiles.org_id))))
  with check (org_id in (select my_org_ids())
         and (public.is_my_person(user_id, employee_id) or (select is_privileged(emergency_responder_profiles.org_id))));
