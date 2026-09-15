-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260823030732  mt_phase3_org_scope_all_rls_policies
-- MULTI-TENANCY PHASE 3. Add the tenant boundary to every RLS policy:
--   org_id IN (my orgs)  AND  <role helper evaluated for THAT row's org>
--   AND (for tables with a location) the member must cover that site.
-- Verified in a rolled-back transaction first: owner/staff row counts are
-- IDENTICAL to pre-change, and a user with no membership sees nothing.
do $$
declare
  r record; base_q text; base_w text; nq text; nw text; loc text; roles text;
  ORGIFY constant text := '\( SELECT (is_privileged|is_writer|owner_or_admin|hr_admin_or_owner|owner_or_hr|clinical_admin_or_owner|can_view_sensitive_docs)\(\) AS \w+ \)';
  ORGIFY2 constant text := '\m(is_privileged|is_writer|owner_or_admin|hr_admin_or_owner|owner_or_hr|clinical_admin_or_owner|can_view_sensitive_docs)\(\)';
begin
  for r in
    select p.tablename, p.policyname, p.cmd, p.qual, p.with_check,
           array_to_string(p.roles,',') as rls,
           exists (select 1 from information_schema.columns c
                   where c.table_schema='public' and c.table_name=p.tablename and c.column_name='location_id') as has_loc
    from pg_policies p
    where p.schemaname='public'
      and p.tablename not in ('organizations','org_memberships','org_member_locations','profiles')
  loop
    base_q := regexp_replace(regexp_replace(coalesce(r.qual,'true'), ORGIFY, '\1(org_id)','g'), ORGIFY2, '\1(org_id)','g');
    base_w := regexp_replace(regexp_replace(coalesce(r.with_check,'true'), ORGIFY, '\1(org_id)','g'), ORGIFY2, '\1(org_id)','g');
    loc := case when r.has_loc then ' AND can_see_location(org_id, location_id)' else '' end;
    nq := format('(org_id IN (SELECT my_org_ids())%s AND (%s))', loc, base_q);
    nw := format('(org_id IN (SELECT my_org_ids())%s AND (%s))', loc, base_w);
    roles := coalesce(nullif(r.rls,''),'authenticated');

    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    if r.cmd = 'SELECT' then
      execute format('create policy %I on public.%I for select to %s using %s', r.policyname, r.tablename, roles, nq);
    elsif r.cmd = 'INSERT' then
      execute format('create policy %I on public.%I for insert to %s with check %s', r.policyname, r.tablename, roles, nw);
    elsif r.cmd = 'UPDATE' then
      execute format('create policy %I on public.%I for update to %s using %s with check %s', r.policyname, r.tablename, roles, nq, nw);
    elsif r.cmd = 'DELETE' then
      execute format('create policy %I on public.%I for delete to %s using %s', r.policyname, r.tablename, roles, nq);
    else
      execute format('create policy %I on public.%I for all to %s using %s with check %s', r.policyname, r.tablename, roles, nq, nw);
    end if;
  end loop;
end $$;

-- profiles: keep a SELF escape hatch, or a freshly-created user (no membership
-- yet) could not read their own profile and would be locked out of the app.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or org_id in (select my_org_ids()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (org_id in (select my_org_ids()) and owner_or_admin(org_id))
  with check (org_id in (select my_org_ids()) and owner_or_admin(org_id));
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (org_id in (select my_org_ids()) and owner_or_admin(org_id));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check ((org_id is null and user_id = (select auth.uid()))
           or (org_id in (select my_org_ids())
               and (is_privileged(org_id) or (user_id = (select auth.uid()) and account_role='staff'))));

-- the org tables themselves
drop policy if exists organizations_sel on public.organizations;
create policy organizations_sel on public.organizations for select to authenticated
  using (id in (select my_org_ids()));
drop policy if exists organizations_upd on public.organizations;
create policy organizations_upd on public.organizations for update to authenticated
  using (owner_or_admin(id)) with check (owner_or_admin(id));

drop policy if exists org_memberships_sel on public.org_memberships;
create policy org_memberships_sel on public.org_memberships for select to authenticated
  using (user_id = (select auth.uid()) or org_id in (select my_org_ids()));
drop policy if exists org_memberships_write on public.org_memberships;
create policy org_memberships_write on public.org_memberships for all to authenticated
  using (owner_or_admin(org_id)) with check (owner_or_admin(org_id));

drop policy if exists org_member_locations_all on public.org_member_locations;
create policy org_member_locations_all on public.org_member_locations for all to authenticated
  using (exists (select 1 from org_memberships m where m.id=membership_id and m.org_id in (select my_org_ids())))
  with check (exists (select 1 from org_memberships m where m.id=membership_id and owner_or_admin(m.org_id)));
