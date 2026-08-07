-- Enforce the documented access matrix in RLS (2026-08-05). Previously most
-- sensitive tables were gated at one coarse is_privileged() tier; the /access-matrix
-- documented finer per-table rules. Provisioning is unaffected (service-role route).
-- Applied to prod as `rbac_enforce_documented_matrix`. Verified live: staff denied
-- controlled substances + audit log; policies confirmed on the new helpers.

-- Benefits: close the write hole (was: any authenticated user) → privileged, matching its read policy.
alter policy benefits_upd on public.benefits using (is_privileged()) with check (is_privileged());
alter policy benefits_del on public.benefits using (is_privileged());

-- Payroll: Owner/HR only.
alter policy payroll_records_priv on public.payroll_records using (owner_or_hr()) with check (owner_or_hr());

-- Controlled substances: Owner/Admin/Clinical Leadership — exclude HR (DEA).
alter policy controlled_substance_logs_priv on public.controlled_substance_logs using (clinical_admin_or_owner()) with check (clinical_admin_or_owner());

-- Performance / disciplinary / exclusion screening: Owner/Admin/HR — exclude Clinical Leadership.
alter policy performance_reviews_priv on public.performance_reviews using (hr_admin_or_owner()) with check (hr_admin_or_owner());
alter policy disciplinary_actions_priv on public.disciplinary_actions using (hr_admin_or_owner()) with check (hr_admin_or_owner());
alter policy exclusion_screenings_priv on public.exclusion_screenings using (hr_admin_or_owner()) with check (hr_admin_or_owner());

-- User management & Settings: Owner/Admin only (role/settings writes).
alter policy organization_settings_write on public.organization_settings using (owner_or_admin()) with check (owner_or_admin());
alter policy profiles_update on public.profiles using (owner_or_admin()) with check (owner_or_admin());
alter policy profiles_delete on public.profiles using (owner_or_admin());

-- Audit / activity log: Owner/Admin only.
alter policy activity_log_select on public.activity_log using (owner_or_admin());
alter policy activity_log_update on public.activity_log using (owner_or_admin()) with check (owner_or_admin());

-- Employee documents: exclude Clinical Leadership from non-sensitive too (sensitive already gated per-user).
alter policy employee_documents_sel on public.employee_documents using (
  (employee_id in (select employees.id from public.employees where employees.user_id = (select auth.uid())))
  or (hr_admin_or_owner() and ((coalesce(sensitive,false) = false) or (select can_view_sensitive_docs())))
);
alter policy employee_documents_upd on public.employee_documents using (hr_admin_or_owner()) with check (hr_admin_or_owner());
alter policy employee_documents_del on public.employee_documents using (hr_admin_or_owner());
