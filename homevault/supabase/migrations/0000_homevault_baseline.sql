-- =====================================================================
-- HomeVault — baseline schema (design scaffold)
--
-- HomeVault is a ZERO-KNOWLEDGE store. This schema deliberately holds:
--   • ciphertext + wrapped keys (opaque to the server)
--   • non-secret metadata (category, label, dates) for reminders/coach
--   • the handover state machine + encrypted Shamir shares
-- It NEVER holds plaintext secrets or usable keys. See docs/SECURITY.md and
-- docs/DATA-MODEL.md. RLS here is the SECOND fence; the crypto is the first.
--
-- NOTE: this migration has not been applied to any project. Do not run it
-- against production data before the Phase-1 cryptographic review (docs/ROADMAP.md).
-- =====================================================================

-- Enums ---------------------------------------------------------------
create type sensitivity_tier as enum ('critical', 'high', 'standard');
create type record_kind      as enum ('digital', 'physical', 'both');
create type member_role      as enum ('owner', 'co_owner', 'viewer');
create type handover_state   as enum (
  'DRAFT','CONFIGURED','ARMED','PENDING','VERIFIED','RELEASED','COMPLETED','CANCELLED'
);

-- Households ----------------------------------------------------------
create table households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Wrapped Vault Key material (wrap(VK, PK⊕PRF)); the server can't unwrap it.
  wrapped_vault_key text,
  kdf_salt    text,                 -- Argon2id salt (a salt is not a secret)
  created_at  timestamptz not null default now()
);

create table household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null,       -- auth.users id
  role         member_role not null default 'viewer',
  public_key   text,                -- for wrapping shares/keys to this member
  created_at   timestamptz not null default now(),
  unique (household_id, user_id)
);

-- Records: non-secret meta + opaque ciphertext ------------------------
create table records (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households(id) on delete cascade,
  category            text not null,
  tier                sensitivity_tier not null,
  label               text not null,           -- non-secret ("Primary checking")
  kind                record_kind not null default 'digital',
  has_physical_location boolean not null default false,
  expires_on          date,                    -- drives reminders
  -- Opaque to the server:
  ciphertext          text not null,           -- base64 AES-GCM(DK, payload)
  iv                  text not null,
  wrapped_data_key    text not null,           -- base64 wrap(DK, VK)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index records_household_idx on records (household_id);
create index records_expiry_idx on records (household_id, expires_on) where expires_on is not null;

-- Handover: recipients, plans, shares, events -------------------------
create table handover_recipients (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid,                          -- null for a non-member (e.g. attorney)
  name          text not null,
  relationship  text,
  public_key    text not null,                 -- shares are encrypted to this key
  scope_tiers   sensitivity_tier[] not null default '{}',
  created_at    timestamptz not null default now()
);

create table handover_plans (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  tiers         sensitivity_tier[] not null,
  triggers      jsonb not null,                -- HandoverTrigger[] (see domain/handover.ts)
  combine       text not null default 'any' check (combine in ('any','all')),
  grace_days    int not null check (grace_days > 0),
  state         handover_state not null default 'DRAFT',
  pending_since timestamptz,                    -- set when entering PENDING (grace accounting)
  recipient_ids uuid[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Encrypted Shamir shares — each row encrypted to ONE holder's public key.
create table handover_shares (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references handover_plans(id) on delete cascade,
  holder_id     uuid not null references handover_recipients(id) on delete cascade,
  share_index   int not null,                  -- Shamir x-coordinate (1..255)
  encrypted_share text not null,               -- share encrypted to holder public_key
  released_at   timestamptz,                   -- non-null once handed to the holder
  unique (plan_id, share_index)
);

-- Append-only, hash-chained ceremony/state log.
create table handover_events (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references handover_plans(id) on delete cascade,
  actor         text not null,                 -- member/recipient id or 'system'
  action        text not null,                 -- transition / contribution / veto …
  from_state    handover_state,
  to_state      handover_state,
  prev_hash     text,                          -- hash of the previous event (chain)
  hash          text not null,                 -- hash(prev_hash || payload)
  payload       jsonb,
  created_at    timestamptz not null default now()
);
create index handover_events_plan_idx on handover_events (plan_id, created_at);

-- App-wide append-only access log (also hash-chained).
create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  actor_user_id uuid,
  action        text not null,                 -- 'record.reveal', 'record.create', …
  target        text,                          -- record id, plan id, …
  prev_hash     text,
  hash          text not null,
  created_at    timestamptz not null default now()
);
create index audit_log_household_idx on audit_log (household_id, created_at);

-- =====================================================================
-- Row-Level Security. Crypto is the primary control; RLS is defense in depth.
-- =====================================================================
alter table households          enable row level security;
alter table household_members   enable row level security;
alter table records             enable row level security;
alter table handover_recipients enable row level security;
alter table handover_plans      enable row level security;
alter table handover_shares     enable row level security;
alter table handover_events     enable row level security;
alter table audit_log           enable row level security;

-- Helper: is the current user a member of the given household?
create or replace function is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;
revoke all on function is_member(uuid) from public, anon, authenticated;
grant execute on function is_member(uuid) to authenticated;

-- Members see and write only their own household's data.
create policy members_self on household_members
  for select to authenticated using (user_id = auth.uid() or is_member(household_id));

create policy household_read on households
  for select to authenticated using (is_member(id));

create policy records_member_all on records
  for all to authenticated using (is_member(household_id)) with check (is_member(household_id));

create policy recipients_member_read on handover_recipients
  for select to authenticated using (is_member(household_id));
create policy recipients_member_write on handover_recipients
  for all to authenticated using (is_member(household_id)) with check (is_member(household_id));

create policy plans_member_all on handover_plans
  for all to authenticated using (is_member(household_id)) with check (is_member(household_id));

-- A NON-member recipient can read ONLY their own share rows (not records metadata)
-- until a handover reaches RELEASED. Members can read their household's shares.
create policy shares_holder_or_member on handover_shares
  for select to authenticated using (
    exists (
      select 1 from handover_recipients r
      where r.id = handover_shares.holder_id
        and (r.user_id = auth.uid() or is_member(r.household_id))
    )
  );

-- Events + audit are insert-only to clients; never updatable/deletable.
create policy events_member_read on handover_events
  for select to authenticated using (
    exists (select 1 from handover_plans p where p.id = handover_events.plan_id and is_member(p.household_id))
  );
create policy events_insert on handover_events
  for insert to authenticated with check (
    exists (select 1 from handover_plans p where p.id = handover_events.plan_id and is_member(p.household_id))
  );

create policy audit_member_read on audit_log
  for select to authenticated using (is_member(household_id));
create policy audit_insert on audit_log
  for insert to authenticated with check (is_member(household_id));

-- Keep updated_at fresh on records/plans.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger records_touch before update on records
  for each row execute function touch_updated_at();
create trigger plans_touch before update on handover_plans
  for each row execute function touch_updated_at();
