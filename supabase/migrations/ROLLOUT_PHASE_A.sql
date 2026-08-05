-- ============================================================
-- PRODUCTION ROLLOUT — PHASE A (run BEFORE deploying the app)
-- Backward-compatible with the currently-deployed app.
-- Paste into Supabase SQL Editor for the PROD project and run.
-- ============================================================

-- >>>>>>>>>>>>>>>>>> 0001_audit_fixes_rls.sql <<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Audit fixes — RLS / access control (2026-08-04)
-- Verified against the staging project (noptrlztqiwpdhoxhcyo) by re-running
-- the exploit tests before/after. Promote to production after review.
--
-- H2: SECURITY DEFINER helper/trigger functions were callable via PostgREST
--     RPC by anon/authenticated. `purge_expired_audit_logs` (deletes audit
--     history) was invokable UNAUTHENTICATED. They run in definer context as
--     triggers regardless of EXECUTE grant, so revoking RPC access is safe.
-- M2: broad-tier CONTENT/PII tables had a single flat "any authenticated"
--     ALL policy, letting any staff/contractor edit/delete employee PII,
--     training answer keys, official policies, and regulatory content
--     (confirmed live: a staff user modified another user's employees row).
--     Fix: keep SELECT broad, restrict INSERT/UPDATE/DELETE to is_privileged().
--     Verified privileged users retain write access.
-- H1 residual: benefits/vendors are privileged-READ; make INSERT privileged
--     too so non-privileged users can't create junk rows they can't even read.
-- =====================================================================

-- ---- H2 ----
revoke all on function public.purge_expired_audit_logs() from public, anon, authenticated;
revoke all on function public.audit_delete_labeled()    from public, anon, authenticated;
revoke all on function public.propagate_employee_name()  from public, anon, authenticated;
revoke all on function public.propagate_module_title()   from public, anon, authenticated;
revoke all on function public.propagate_template_title() from public, anon, authenticated;
revoke all on function public.hr_admin_or_owner()        from public, anon, authenticated;

-- ---- M2: content/PII tables — read broad, write privileged ----
-- (Staff-workflow tables — inventory, tasks, policy_acks, sds_records,
--  osha_records, emergency_drills — intentionally left broadly writable.)

drop policy if exists employees_auth on public.employees;
create policy employees_read  on public.employees for select to authenticated using (true);
create policy employees_write on public.employees for all    to authenticated using (is_privileged()) with check (is_privileged());

drop policy if exists documents_auth on public.documents;
create policy documents_read  on public.documents for select to authenticated using (true);
create policy documents_write on public.documents for all    to authenticated using (is_privileged()) with check (is_privileged());

drop policy if exists training_modules_auth on public.training_modules;
create policy training_modules_read  on public.training_modules for select to authenticated using (true);
create policy training_modules_write on public.training_modules for all    to authenticated using (is_privileged()) with check (is_privileged());

drop policy if exists training_questions_auth on public.training_questions;
create policy training_questions_read  on public.training_questions for select to authenticated using (true);
create policy training_questions_write on public.training_questions for all    to authenticated using (is_privileged()) with check (is_privileged());

drop policy if exists form_templates_auth on public.form_templates;
create policy form_templates_read  on public.form_templates for select to authenticated using (true);
create policy form_templates_write on public.form_templates for all    to authenticated using (is_privileged()) with check (is_privileged());

drop policy if exists regulatory_sources_auth on public.regulatory_sources;
create policy regulatory_sources_read  on public.regulatory_sources for select to authenticated using (true);
create policy regulatory_sources_write on public.regulatory_sources for all    to authenticated using (is_privileged()) with check (is_privileged());

drop policy if exists locations_auth on public.locations;
create policy locations_read  on public.locations for select to authenticated using (true);
create policy locations_write on public.locations for all    to authenticated using (is_privileged()) with check (is_privileged());

-- ---- H1 residual ----
drop policy if exists benefits_ins on public.benefits;
create policy benefits_ins on public.benefits for insert to authenticated with check (is_privileged());
drop policy if exists vendors_ins on public.vendors;
create policy vendors_ins on public.vendors for insert to authenticated with check (is_privileged());

-- >>>>>>>>>>>>>>>>>> 0002_audit_fixes_readonly_and_insert_scoping.sql <<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>> 0003_ai_usage_return_role.sql <<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Role-based AI daily caps (2026-08-04)
-- bump_ai_usage() now returns {count, role} so the app can apply a per-role
-- daily cap in a single round-trip (no extra profile lookup per AI call).
-- Limits live in the app (src/lib/ai/usage.ts), env-tunable per tier:
--   AI_DAILY_CAP_PRIVILEGED (owner/admin/hr/clinical_leadership) default 500
--   AI_DAILY_CAP_MANAGER    default 300
--   AI_DAILY_CAP_STAFF      (staff/contractor, legacy AI_DAILY_CAP) default 150
--   AI_DAILY_CAP_READONLY   default 30
-- MUST deploy together with the matching src/lib/ai/usage.ts (return type changed).
-- =====================================================================
drop function if exists public.bump_ai_usage();
create function public.bump_ai_usage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare c integer; r text;
begin
  insert into public.ai_usage (user_id, usage_date, count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, usage_date) do update set count = ai_usage.count + 1
  returning count into c;
  select account_role into r from public.profiles where user_id = auth.uid();
  return jsonb_build_object('count', c, 'role', coalesce(r, 'staff'));
end;
$function$;
revoke all on function public.bump_ai_usage() from public, anon;
grant execute on function public.bump_ai_usage() to authenticated;

-- >>>>>>>>>>>>>>>>>> 0005_fix_m11_policy_ack_idempotency.sql <<<<<<<<<<<<<<<<<<
-- =====================================================================
-- M11 fix — policy acknowledgment idempotency (2026-08-04)
-- Finding (live-confirmed): two concurrent identical policy_acks inserts both
-- succeeded → duplicate rows (an index existed on (user_id, document_id) but no
-- UNIQUE constraint), so a double-click/retry duplicated the acknowledgment.
--
-- Fix: dedupe existing 'acknowledged' rows (keep the most recent per user+doc),
-- then a PARTIAL unique index scoped to status='acknowledged'. Chosen over a
-- plain UNIQUE(user_id, document_id) because re-acknowledgment after expiry
-- legitimately creates a new row — 'expired' rows are left uncovered so re-acks
-- still work, while duplicate ACTIVE acks are blocked.
--
-- Paired with the app's list() pagination fix (M12) in src/lib/data/supabase-client.ts.
-- =====================================================================
with ranked as (
  select id, row_number() over (
           partition by user_id, document_id
           order by acknowledged_at desc nulls last, created_date desc) as rn
  from public.policy_acks
  where status = 'acknowledged'
)
delete from public.policy_acks p using ranked r where p.id = r.id and r.rn > 1;

create unique index if not exists policy_acks_user_doc_ack_uniq
  on public.policy_acks (user_id, document_id)
  where status = 'acknowledged';

-- >>>>>>>>>>>>>>>>>> 0006_fix_m3_notification_scoping.sql <<<<<<<<<<<<<<<<<<
-- =====================================================================
-- M3 fix — notification recipient scoping (2026-08-04)
-- Finding (live-confirmed): every authenticated user (incl. read_only) could
-- read ALL notifications, leaking per-person compliance status
-- ("Credential expired: Dr. X"). Notifications had no recipient column.
--
-- Fix: nullable `user_id` recipient. NULL = org-wide (everyone sees); set =
-- only that person + privileged. The scan job (src/app/api/notifications/scan)
-- now sets it on person-specific alerts (credential/training/insurance/paneling)
-- and leaves org-wide alerts (policy review, BAA, business records) NULL.
-- Deploy this migration together with the scan-route change.
-- Verified on staging: read_only/staff no longer see others' person-specific
-- alerts; org-wide alerts and one's own alerts still show; privileged see all.
-- =====================================================================
alter table public.notifications add column if not exists user_id uuid;
create index if not exists notifications_user_idx on public.notifications (user_id);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id is null or user_id = (select auth.uid()) or (select public.is_privileged()));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id is null or user_id = (select auth.uid()) or (select public.is_privileged()))
  with check (user_id is null or user_id = (select auth.uid()) or (select public.is_privileged()));

-- >>>>>>>>>>>>>>>>>> 0007_fix_m6_rls_initplan_perf.sql <<<<<<<<<<<<<<<<<<
-- =====================================================================
-- M6 fix — RLS auth-call initplan performance (2026-08-04)
-- The advisor flagged 80 `auth_rls_initplan` warnings: RLS policies calling
-- auth.uid()/is_privileged()/is_writer() were re-evaluated PER ROW. Wrapping
-- each in a scalar subselect makes Postgres evaluate it ONCE per query
-- (initplan). Behavior-identical (all three are STABLE); verified on staging
-- that the privileged tier, read_only, and M2 enforcement are unchanged, and
-- the advisor's auth_rls_initplan count dropped 80 -> 0.
--
-- NOTE: the ~18 `multiple_permissive_policies` (SELECT) warnings are an accepted
-- minor tradeoff of the read/write policy split (a FOR ALL write policy also
-- covers SELECT); not worth 3x policy count to silence.
-- =====================================================================

-- Bulk: wrap bare auth calls in every policy that isn't already using a SELECT.
do $$
declare
  r record; nq text; nc text; stmt text;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and coalesce(qual,'')       !~* 'select'
      and coalesce(with_check,'') !~* 'select'
      and (coalesce(qual,'')       ~ '(auth\.uid|is_privileged|is_writer)\(\)'
        or coalesce(with_check,'') ~ '(auth\.uid|is_privileged|is_writer)\(\)')
  loop
    nq := r.qual; nc := r.with_check;
    if nq is not null then
      nq := regexp_replace(nq, 'auth\.uid\(\)',     '( SELECT auth.uid() )',     'g');
      nq := regexp_replace(nq, 'is_privileged\(\)', '( SELECT is_privileged() )','g');
      nq := regexp_replace(nq, 'is_writer\(\)',     '( SELECT is_writer() )',    'g');
    end if;
    if nc is not null then
      nc := regexp_replace(nc, 'auth\.uid\(\)',     '( SELECT auth.uid() )',     'g');
      nc := regexp_replace(nc, 'is_privileged\(\)', '( SELECT is_privileged() )','g');
      nc := regexp_replace(nc, 'is_writer\(\)',     '( SELECT is_writer() )',    'g');
    end if;
    stmt := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if nq is not null then stmt := stmt || format(' using (%s)', nq); end if;
    if nc is not null then stmt := stmt || format(' with check (%s)', nc); end if;
    execute stmt;
  end loop;
end $$;

-- The three own-or-privileged policies that embed a correlated subquery (skipped
-- above because they already contain SELECT): wrap their bare calls explicitly.
alter policy competency_records_sel on public.competency_records using
  (( SELECT is_privileged() ) OR (employee_id IN ( SELECT employees.id FROM employees WHERE (employees.user_id = ( SELECT auth.uid() )))));
alter policy completed_forms_sel on public.completed_forms using
  (( SELECT is_privileged() ) OR (employee_id IN ( SELECT employees.id FROM employees WHERE (employees.user_id = ( SELECT auth.uid() )))));
alter policy employee_documents_sel on public.employee_documents using
  (( SELECT is_privileged() ) OR (employee_id IN ( SELECT employees.id FROM employees WHERE (employees.user_id = ( SELECT auth.uid() )))));

-- >>>>>>>>>>>>>>>>>> 0004 (function only — storage policy deferred to Phase B) <<<<<<<<<<<<<<<<<<
create or replace function public.can_view_object(p text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $function$
  select
       exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p)
    or exists (select 1 from public.credentials             where document_url = p)
    or exists (select 1 from public.insurance_policies      where document_url = p)
    or exists (select 1 from public.employee_documents      where file_url = p)
    or exists (select 1 from public.documents               where file_url = p)
    or exists (select 1 from public.form_templates          where file_url = p)
    or exists (select 1 from public.business_records        where document_url = p)
    or exists (select 1 from public.vendors                 where baa_document_url = p or insurance_document_url = p)
    or exists (select 1 from public.osha_records            where document_url = p)
    or exists (select 1 from public.exclusion_screenings    where document_url = p)
    or exists (select 1 from public.incidents               where evidence_url = p)
    or exists (select 1 from public.controlled_substance_events where document_url = p)
    or exists (select 1 from public.dea_records             where document_url = p)
    or exists (select 1 from public.regulatory_sources      where attachment_url = p)
    or exists (select 1 from public.emergency_plans         where file_url = p)
    or exists (select 1 from public.payer_contracts         where contract_document_url = p or fee_schedule_url = p)
    or exists (select 1 from public.payer_enrollments       where application_document_url = p)
    or exists (select 1 from public.audit_items             where evidence_url = p)
    or exists (select 1 from public.ce_records              where document_url = p)
    or exists (select 1 from public.inventory               where image_url = p)
    or exists (select 1 from public.medical_supplies        where image_url = p)
    or exists (select 1 from public.supply_items            where image_url = p)
    or exists (select 1 from public.record_versions         where file_path = p);
$function$;
revoke all on function public.can_view_object(text) from public, anon;
grant execute on function public.can_view_object(text) to authenticated;
