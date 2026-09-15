-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260823024540  mt_phase2a_auto_stamp_org_id_trigger
-- NOTE: this version of set_org_id() uses min(uuid), which Postgres does not
-- have. It is superseded immediately by 0017e; kept verbatim as history.
-- MULTI-TENANCY PHASE 2a. Stamp org_id automatically on insert, at the DB layer
-- so no client or API route can forget it (and so server-side/service-role code
-- keeps working by passing org_id explicitly).
--
-- Rules:
--   * org_id already supplied  -> respect it (needed for service_role paths)
--   * caller has exactly ONE active membership -> use that org
--   * caller has several -> leave null; the app must choose explicitly
--   * no auth.uid() (service_role) -> leave null; caller must supply it

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
  select count(*), min(org_id) into n, o
  from public.org_memberships
  where user_id = auth.uid() and active;
  if n = 1 then
    new.org_id := o;
  end if;
  return new;
end $$;

grant execute on function public.set_org_id() to authenticated, service_role;

do $$
declare r record;
begin
  for r in
    select c.relname as t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('organizations','org_member_locations')
      and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name=c.relname and column_name='org_id')
    order by c.relname
  loop
    execute format('drop trigger if exists trg_set_org_id on public.%I', r.t);
    execute format(
      'create trigger trg_set_org_id before insert on public.%I
       for each row execute function public.set_org_id()', r.t);
  end loop;
end $$;
