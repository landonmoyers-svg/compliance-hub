-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version (applied 2026-09-15)  medical_supply_lots_and_ordering
-- MEDICAL SUPPLIES: per-lot stock, expiry-aware use, and ordering.
--
-- A supply row carried ONE lot and ONE expiry, but a real closet holds several
-- lots at once — and receiving a new box silently erased the old box's expiry.
-- "Use it before it expires" is impossible to answer without lots, so stock now
-- lives in medical_supply_lots and the product row is kept in sync from them.
-- (0 medical_supplies rows existed in prod when this was written.)

create table if not exists public.medical_supply_lots (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  supply_id uuid not null references public.medical_supplies(id) on delete cascade,
  lot_number text,
  expiration_date date,
  quantity_received numeric not null default 0,
  quantity_remaining numeric not null default 0 check (quantity_remaining >= 0),
  received_at timestamptz not null default now(),
  note text
);

create index if not exists medical_supply_lots_org_idx on public.medical_supply_lots(org_id);
create index if not exists medical_supply_lots_supply_idx
  on public.medical_supply_lots(supply_id, expiration_date nulls last, received_at);

alter table public.medical_supply_lots enable row level security;
grant select, insert, update, delete on public.medical_supply_lots to authenticated;
grant all on public.medical_supply_lots to service_role;

-- Mirrors medical_supply_logs: org boundary, then is_writer() to write.
create policy medical_supply_lots_read on public.medical_supply_lots for select to authenticated
  using (org_id in (select my_org_ids()));
create policy medical_supply_lots_write on public.medical_supply_lots for all to authenticated
  using (org_id in (select my_org_ids()) and (select is_writer(medical_supply_lots.org_id)))
  with check (org_id in (select my_org_ids()) and (select is_writer(medical_supply_lots.org_id)));

create trigger trg_set_org_id before insert on public.medical_supply_lots
  for each row execute function public.set_org_id();

-- Which lot a movement touched, so the ledger stays traceable per lot.
alter table public.medical_supply_logs
  add column if not exists lot_id uuid references public.medical_supply_lots(id) on delete set null;

-- Ordering. Defaults (lead time, cover) are applied in code so "not set" stays
-- distinguishable from an explicit value.
alter table public.medical_supplies
  add column if not exists order_url text,
  add column if not exists lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  add column if not exists target_cover_days integer check (target_cover_days is null or target_cover_days > 0),
  add column if not exists pack_size numeric check (pack_size is null or pack_size > 0),
  add column if not exists last_ordered_at timestamptz,
  add column if not exists pending_order_qty numeric check (pending_order_qty is null or pending_order_qty >= 0);

-- The order link is rendered as a clickable href. Only http(s) — never
-- javascript: or data: — enforced here as well as in the UI.
alter table public.medical_supplies drop constraint if exists medical_supplies_order_url_http;
alter table public.medical_supplies add constraint medical_supplies_order_url_http
  check (order_url is null or order_url ~* '^https?://');

-- Keep the product row truthful for every other reader (calendar, dashboards,
-- the assistant): on-hand = sum of lots; expiry and lot number = the soonest-
-- expiring lot still in stock.
create or replace function public.sync_medical_supply_from_lots()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  ids uuid[];
  sid uuid;
begin
  ids := array_remove(array[
    case when tg_op in ('INSERT','UPDATE') then new.supply_id end,
    case when tg_op in ('UPDATE','DELETE') then old.supply_id end
  ], null);
  foreach sid in array ids loop
    update public.medical_supplies s set
      quantity_on_hand = coalesce((
        select sum(l.quantity_remaining) from public.medical_supply_lots l where l.supply_id = sid), 0),
      expiration_date = (
        select min(l.expiration_date) from public.medical_supply_lots l
        where l.supply_id = sid and l.quantity_remaining > 0),
      lot_number = (
        select l.lot_number from public.medical_supply_lots l
        where l.supply_id = sid and l.quantity_remaining > 0
        order by l.expiration_date asc nulls last, l.received_at asc limit 1)
    where s.id = sid;
  end loop;
  return null;
end $$;

drop trigger if exists trg_sync_medical_supply_from_lots on public.medical_supply_lots;
create trigger trg_sync_medical_supply_from_lots
  after insert or update or delete on public.medical_supply_lots
  for each row execute function public.sync_medical_supply_from_lots();
