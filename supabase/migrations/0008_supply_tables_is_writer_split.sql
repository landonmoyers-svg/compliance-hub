-- =====================================================================
-- Follow-up to 0002 — staff/medical supply tables read/write split (2026-08-05)
-- The supply modules were added AFTER migrations 0001–0007, so their tables
-- kept a flat "<table>_auth" ALL policy (auth.uid() is not null) — a read_only
-- user could write them. Bring them to the same read-broad / write-gated tier
-- as inventory/tasks/sds_records: SELECT open to all authenticated, write
-- requires is_writer() (excludes read_only/inactive). Auth call wrapped in a
-- scalar subselect (initplan perf, matching 0007).
-- Applied to prod as migration `supply_tables_is_writer_split`.
-- =====================================================================

drop policy if exists supply_items_auth on public.supply_items;
create policy supply_items_read  on public.supply_items for select to authenticated using (true);
create policy supply_items_write on public.supply_items for all    to authenticated using ((select public.is_writer())) with check ((select public.is_writer()));

drop policy if exists supply_movements_auth on public.supply_movements;
create policy supply_movements_read  on public.supply_movements for select to authenticated using (true);
create policy supply_movements_write on public.supply_movements for all    to authenticated using ((select public.is_writer())) with check ((select public.is_writer()));

drop policy if exists medical_supplies_auth on public.medical_supplies;
create policy medical_supplies_read  on public.medical_supplies for select to authenticated using (true);
create policy medical_supplies_write on public.medical_supplies for all    to authenticated using ((select public.is_writer())) with check ((select public.is_writer()));

drop policy if exists medical_supply_logs_auth on public.medical_supply_logs;
create policy medical_supply_logs_read  on public.medical_supply_logs for select to authenticated using (true);
create policy medical_supply_logs_write on public.medical_supply_logs for all    to authenticated using ((select public.is_writer())) with check ((select public.is_writer()));
