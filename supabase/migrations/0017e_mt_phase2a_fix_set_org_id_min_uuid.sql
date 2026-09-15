-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260823024611  mt_phase2a_fix_set_org_id_min_uuid
-- Fix: Postgres has no min(uuid) aggregate. Count first, then select the single
-- membership's org separately.
create or replace function public.set_org_id()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare n int; o uuid;
begin
  if new.org_id is not null then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  select count(*) into n
  from public.org_memberships
  where user_id = auth.uid() and active;
  if n = 1 then
    select org_id into o
    from public.org_memberships
    where user_id = auth.uid() and active
    limit 1;
    new.org_id := o;
  end if;
  return new;
end $$;

grant execute on function public.set_org_id() to authenticated, service_role;
