-- EMERGENCY ALERT — when an employee is linked to a login, their responder
-- profile and site roles follow automatically. Dispatch, presence and "your
-- assignment" all key on the login id, so without this a person set up by an
-- admin before they had an account would be invisible to the live views.

create or replace function public.sync_emergency_person_login()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id then
    update public.emergency_responder_profiles set user_id = new.user_id where employee_id = new.id;
    update public.emergency_location_roles set user_id = new.user_id where employee_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_emergency_person_login on public.employees;
create trigger trg_sync_emergency_person_login after update of user_id on public.employees
  for each row execute function public.sync_emergency_person_login();

-- Backfill anyone already linked.
update public.emergency_responder_profiles p set user_id = e.user_id
  from public.employees e where p.employee_id = e.id and e.user_id is not null and p.user_id is distinct from e.user_id;
update public.emergency_location_roles r set user_id = e.user_id
  from public.employees e where r.employee_id = e.id and e.user_id is not null and r.user_id is distinct from e.user_id;
