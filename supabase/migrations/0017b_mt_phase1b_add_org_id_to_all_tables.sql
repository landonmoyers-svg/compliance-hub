-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260823023945  mt_phase1b_add_org_id_to_all_tables
-- MULTI-TENANCY PHASE 1b (additive). Add a NULLABLE org_id to every data table
-- and backfill to the existing org. Still nothing reads it — no policy changes,
-- so live behavior is identical.
do $$
declare
  r record;
  home_org uuid;
begin
  select id into home_org from public.organizations order by created_date limit 1;

  for r in
    select c.relname as t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('organizations','org_memberships','org_member_locations')
    order by c.relname
  loop
    -- add the column if missing
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=r.t and column_name='org_id'
    ) then
      execute format('alter table public.%I add column org_id uuid references public.organizations(id)', r.t);
      execute format('create index if not exists %I on public.%I(org_id)', r.t||'_org_idx', r.t);
    end if;
    -- backfill existing rows to the home org
    execute format('update public.%I set org_id = $1 where org_id is null', r.t) using home_org;
  end loop;
end $$;
