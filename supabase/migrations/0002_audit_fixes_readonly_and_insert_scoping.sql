-- =====================================================================
-- Audit fixes — read_only enforcement + INSERT scoping (2026-08-04)
-- Verified against staging (noptrlztqiwpdhoxhcyo). Promote after review.
--
-- Finding (from live testing): the `read_only` account role was NOT enforced
--   at the RLS layer — a read_only user could INSERT/UPDATE broad-tier rows
--   (confirmed: read_only inserted a task). RLS only checked auth.uid() IS NOT
--   NULL, so read_only == staff for writes. Also, any writer could INSERT
--   personal records (credentials/insurance) attributed to OTHER users.
-- Fix: is_writer() helper (excludes read_only/inactive); broad staff-workflow
--   tables now READ-open but WRITE-gated on is_writer(); credentials/insurance
--   INSERT scoped to own record (or privileged). Verified read_only can still
--   READ, staff/owner can still write, and cross-user INSERT is blocked.
-- =====================================================================

create or replace function public.is_writer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and account_role not in ('read_only','inactive')
  );
$$;
revoke all on function public.is_writer() from public, anon;
grant execute on function public.is_writer() to authenticated;

-- Broad staff-workflow tables: read open to all authenticated; write requires is_writer().
drop policy if exists tasks_auth on public.tasks;
create policy tasks_read  on public.tasks for select to authenticated using (true);
create policy tasks_write on public.tasks for all    to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists inventory_auth on public.inventory;
create policy inventory_read  on public.inventory for select to authenticated using (true);
create policy inventory_write on public.inventory for all    to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists sds_records_auth on public.sds_records;
create policy sds_records_read  on public.sds_records for select to authenticated using (true);
create policy sds_records_write on public.sds_records for all    to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists osha_records_auth on public.osha_records;
create policy osha_records_read  on public.osha_records for select to authenticated using (true);
create policy osha_records_write on public.osha_records for all    to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists emergency_drills_auth on public.emergency_drills;
create policy emergency_drills_read  on public.emergency_drills for select to authenticated using (true);
create policy emergency_drills_write on public.emergency_drills for all    to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists policy_acks_auth on public.policy_acks;
create policy policy_acks_read  on public.policy_acks for select to authenticated using (true);
create policy policy_acks_write on public.policy_acks for all    to authenticated using (public.is_writer()) with check (public.is_writer());

-- Personal compliance tables: INSERT scoped to own record (or privileged), writer only.
drop policy if exists credentials_ins on public.credentials;
create policy credentials_ins on public.credentials for insert to authenticated
  with check (public.is_writer() and (public.is_privileged() or employee_user_id = auth.uid()));

drop policy if exists insurance_policies_ins on public.insurance_policies;
create policy insurance_policies_ins on public.insurance_policies for insert to authenticated
  with check (public.is_writer() and (public.is_privileged() or holder_user_id = auth.uid()));

-- NOTE (follow-up, not yet applied): the own-or-privileged personal tables'
-- UPDATE/DELETE branches (competency_records, completed_forms, form_assignments,
-- training_assignments, training_attempts, pto_balances, time_clock_entries,
-- time_off_requests) still use auth.uid() IS NOT NULL, so a read_only user could
-- edit their OWN such rows. Lower stakes; add is_writer() there too if desired.
