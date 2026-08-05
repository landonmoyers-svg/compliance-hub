-- Utah business personal property tax (Pub 20) fields on the clinical inventory
-- (2026-08-05). acquisition_cost_cents includes install/shipping/sales tax;
-- ppt_category is a Utah valuation class ("class_8") or an exempt reason
-- ("exempt_supply"). See src/lib/utah-ppt.ts. Applied to prod as
-- migration `inventory_utah_ppt_fields`.
alter table public.inventory
  add column if not exists acquisition_cost_cents integer,
  add column if not exists acquisition_year integer,
  add column if not exists ppt_category text;
