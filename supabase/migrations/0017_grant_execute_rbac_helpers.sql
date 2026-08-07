-- FIX (2026-08-07) for a regression in 0014: RLS policies call these helper
-- functions AS THE QUERYING USER, so `authenticated` must have EXECUTE on them.
-- is_privileged() kept its grant (earlier hardening), but hr_admin_or_owner()
-- and can_view_sensitive_docs() had had EXECUTE revoked, and 0014 repointed
-- several tables' policies to hr_admin_or_owner() — so those reads failed with
-- "permission denied for function hr_admin_or_owner" (SQLSTATE 42501) for EVERY
-- role, breaking exclusion_screenings / performance_reviews / disciplinary_actions
-- / employee_documents. The new owner_or_* / clinical_admin_or_owner functions had
-- default PUBLIC execute so they were fine; granted here too for safety.
-- RULE: any function referenced in an RLS policy must be EXECUTE-able by authenticated.
grant execute on function public.hr_admin_or_owner() to authenticated;
grant execute on function public.owner_or_admin() to authenticated;
grant execute on function public.owner_or_hr() to authenticated;
grant execute on function public.clinical_admin_or_owner() to authenticated;
grant execute on function public.can_view_sensitive_docs() to authenticated;
