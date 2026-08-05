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
