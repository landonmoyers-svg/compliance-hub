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
