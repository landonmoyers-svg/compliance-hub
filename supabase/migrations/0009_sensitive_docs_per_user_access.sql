-- =====================================================================
-- Per-user access to SENSITIVE employee documents (M5 fix, 2026-08-05)
-- Owner + HR always have access; owner/HR grant it to individual other
-- privileged users (admin, clinical_leadership) via profiles.sensitive_docs_access.
-- Enforced in RLS so it holds regardless of the UI. Verified on staging
-- (admin-without-grant sees 0, admin-with-grant sees 1, owner sees 1).
-- Applied to prod as migration `sensitive_docs_per_user_access`.
-- =====================================================================

alter table public.profiles
  add column if not exists sensitive_docs_access boolean not null default false;

create or replace function public.can_view_sensitive_docs()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and (account_role in ('owner','hr') or coalesce(sensitive_docs_access, false) = true)
  );
$$;
revoke all on function public.can_view_sensitive_docs() from public, anon;
grant execute on function public.can_view_sensitive_docs() to authenticated;

drop policy if exists employee_documents_sel on public.employee_documents;
create policy employee_documents_sel on public.employee_documents for select to authenticated
using (
  (employee_id in (select id from employees where user_id = (select auth.uid())))
  or ((select is_privileged()) and (coalesce(sensitive, false) = false or (select public.can_view_sensitive_docs())))
);
