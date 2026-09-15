-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260909170306  medical_supply_logs_occurred_at
-- Pace is only as good as the date it's measured against. medical_supply_logs
-- had no event date, so a Friday catch-up of the week's usage all landed on
-- Friday and skewed the rate. occurred_at defaults to created_date for every
-- existing row, so nothing changes retroactively — it just lets new entries be
-- dated when they actually happened.
alter table public.medical_supply_logs
  add column if not exists occurred_at timestamptz;

update public.medical_supply_logs
set occurred_at = created_date
where occurred_at is null;

alter table public.medical_supply_logs
  alter column occurred_at set default now();

create index if not exists medical_supply_logs_supply_idx
  on public.medical_supply_logs(supply_id, occurred_at desc);
