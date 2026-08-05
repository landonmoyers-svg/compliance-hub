-- =====================================================================
-- Guard sensitive_docs_access (M5 fix hardening, 2026-08-05)
-- The broad profiles_update policy (is_privileged) would let ANY privileged user
-- self-grant sensitive_docs_access via a direct write, bypassing the "owner/HR
-- only" intent. Enforce it server-side: only owner/HR may set or change the flag.
-- Verified on staging: admin self-grant blocked, owner grant allowed.
-- Applied to prod as migration `guard_sensitive_docs_access`.
-- =====================================================================
create or replace function public.guard_sensitive_docs_access()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_hr boolean;
begin
  if (TG_OP = 'INSERT' and coalesce(NEW.sensitive_docs_access, false) = true)
     or (TG_OP = 'UPDATE' and NEW.sensitive_docs_access is distinct from OLD.sensitive_docs_access) then
    select exists (
      select 1 from public.profiles
      where user_id = auth.uid() and account_role in ('owner','hr')
    ) into is_hr;
    if not coalesce(is_hr, false) then
      raise exception 'Only owner or HR may change sensitive document access';
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists guard_sensitive_docs_access_trg on public.profiles;
create trigger guard_sensitive_docs_access_trg
  before insert or update on public.profiles
  for each row execute function public.guard_sensitive_docs_access();
