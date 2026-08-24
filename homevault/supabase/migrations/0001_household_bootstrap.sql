-- =====================================================================
-- HomeVault — household bootstrap, per-member key wrapping, invites,
-- recovery codes, and the Data-API grants.
--
-- Builds on 0000_homevault_baseline.sql. Still zero-knowledge: every key
-- column below holds a *wrapped* key that the server cannot unwrap.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Per-member key wrapping
--
-- The baseline put a single wrapped vault key on `households`, which only
-- works for one person. A household is several people, each unlocking the
-- SAME vault key with THEIR own passphrase and device — so the wrapped copy
-- and the KDF parameters that produced it belong on the membership row.
-- ---------------------------------------------------------------------
alter table household_members
  add column if not exists display_name       text,
  add column if not exists wrapped_vault_key  text,
  add column if not exists kdf                jsonb,
  add column if not exists device_salt        text,
  add column if not exists created_by_invite  uuid;

comment on column household_members.wrapped_vault_key is
  'AES-KW(KEK, VK) where KEK = HKDF(passphrase key || device factor). Opaque to the server.';
comment on column household_members.kdf is
  'Argon2id parameters + salt used for THIS member. Stored per member so cost can be raised without locking anyone out.';

-- ---------------------------------------------------------------------
-- 2. Recovery codes (docs/SECURITY.md § 7)
--
-- A second wrapped copy of the vault key, openable by a high-entropy code the
-- owner keeps on paper. Not a backdoor: HomeVault never sees the code and
-- cannot regenerate it. Without this, a forgotten passphrase means the
-- household's documents are gone for good.
-- ---------------------------------------------------------------------
alter table households
  add column if not exists recovery_wrapped_vault_key text,
  add column if not exists recovery_salt              text,
  add column if not exists recovery_created_at        timestamptz;

-- ---------------------------------------------------------------------
-- 3. Invites
--
-- Adding someone to a household means giving them the vault key — but only a
-- member who is currently unlocked can do that. So an invite carries VK
-- wrapped under a key derived from a single-use code, which the inviter passes
-- to the invitee out of band. Redeeming re-wraps VK under the newcomer's own
-- passphrase and device; the invite is then spent.
--
-- The row is therefore useless on its own: it is ciphertext plus a salt.
-- ---------------------------------------------------------------------
create table if not exists household_invites (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households(id) on delete cascade,
  email             text not null,
  display_name      text,
  role              member_role not null default 'co_owner',
  wrapped_vault_key text not null,          -- AES-KW(code-derived key, VK)
  salt              text not null,          -- for the code KDF; not a secret
  created_by        uuid not null,          -- auth.users id of the inviter
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '14 days',
  redeemed_at       timestamptz,
  redeemed_by       uuid
);
create index if not exists household_invites_household_idx on household_invites (household_id);

alter table household_invites enable row level security;

-- Members manage their own household's invites.
drop policy if exists invites_member_manage on household_invites;
create policy invites_member_manage on household_invites
  for all to authenticated using (is_member(household_id)) with check (is_member(household_id));

-- An invitee is NOT a member yet, so they must be able to read the one invite
-- they were handed. Scoped to live invites only. Safe because the row holds no
-- usable key material without the out-of-band code.
drop policy if exists invites_redeemable_read on household_invites;
create policy invites_redeemable_read on household_invites
  for select to authenticated
  using (redeemed_at is null and expires_at > now());

-- ---------------------------------------------------------------------
-- 4. Bootstrap + redemption as SECURITY DEFINER functions
--
-- Both need to write a `household_members` row, which RLS must not allow
-- directly: a plain "you may insert your own membership" policy would let any
-- signed-in user join ANY household just by knowing its id. Routing both paths
-- through these functions keeps that impossible while still letting a new user
-- create their first household.
-- ---------------------------------------------------------------------

create or replace function create_household(
  p_name              text,
  p_wrapped_vault_key text,
  p_kdf               jsonb,
  p_device_salt       text,
  p_display_name      text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  insert into households (name) values (p_name) returning id into v_household;

  insert into household_members (household_id, user_id, role, display_name, wrapped_vault_key, kdf, device_salt)
  values (v_household, auth.uid(), 'owner', p_display_name, p_wrapped_vault_key, p_kdf, p_device_salt);

  return v_household;
end;
$$;
revoke all on function create_household(text, text, jsonb, text, text) from public, anon;
grant execute on function create_household(text, text, jsonb, text, text) to authenticated;

create or replace function redeem_household_invite(
  p_invite_id         uuid,
  p_wrapped_vault_key text,
  p_kdf               jsonb,
  p_device_salt       text,
  p_display_name      text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite household_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  -- Lock the row so two simultaneous redemptions can't both succeed.
  select * into v_invite from household_invites where id = p_invite_id for update;

  if not found then
    raise exception 'That invitation does not exist.';
  end if;
  if v_invite.redeemed_at is not null then
    raise exception 'That invitation has already been used.';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'That invitation has expired.';
  end if;

  insert into household_members (household_id, user_id, role, display_name, wrapped_vault_key, kdf, device_salt, created_by_invite)
  values (v_invite.household_id, auth.uid(), v_invite.role, coalesce(p_display_name, v_invite.display_name),
          p_wrapped_vault_key, p_kdf, p_device_salt, v_invite.id)
  on conflict (household_id, user_id) do update
    set wrapped_vault_key = excluded.wrapped_vault_key,
        kdf               = excluded.kdf,
        device_salt       = excluded.device_salt;

  update household_invites
     set redeemed_at = now(), redeemed_by = auth.uid()
   where id = v_invite.id;

  return v_invite.household_id;
end;
$$;
revoke all on function redeem_household_invite(uuid, text, jsonb, text, text) from public, anon;
grant execute on function redeem_household_invite(uuid, text, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Policies the baseline left out
-- ---------------------------------------------------------------------

-- Members may update their own household (recovery envelope, rename).
drop policy if exists household_member_update on households;
create policy household_member_update on households
  for update to authenticated using (is_member(id)) with check (is_member(id));

-- A member may update their OWN membership row — e.g. re-wrapping their vault
-- key after a passphrase change. Not anyone else's.
drop policy if exists members_update_self on household_members;
create policy members_update_self on household_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Data-API grants
--
-- The project was created with "automatically expose new tables" OFF, which is
-- the right default for a vault: nothing is reachable until it is granted
-- deliberately. That also means RLS policies alone are not enough — without
-- these grants every query returns permission-denied.
--
-- `anon` is granted nothing at all: there is no unauthenticated read path.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select                         on households          to authenticated;
grant update (name, recovery_wrapped_vault_key, recovery_salt, recovery_created_at)
                                     on households          to authenticated;
grant select, update                 on household_members   to authenticated;
grant select, insert, update, delete on records             to authenticated;
grant select, insert, update, delete on handover_recipients to authenticated;
grant select, insert, update, delete on handover_plans      to authenticated;
grant select                         on handover_shares     to authenticated;
grant select, insert                 on handover_events     to authenticated;
grant select, insert                 on audit_log           to authenticated;
grant select, insert, update, delete on household_invites   to authenticated;

-- Deliberately NOT granted: insert/delete on households and household_members
-- (both go through the SECURITY DEFINER functions above), and update/delete on
-- handover_events and audit_log — those two are append-only by design.

-- Strip the privileges Supabase's default roles arrive with.
--
-- `anon` is the unauthenticated API role and needs nothing at all here: every
-- read path in HomeVault requires a signed-in user. It ships with REFERENCES,
-- TRIGGER and TRUNCATE, and TRUNCATE in particular is a destructive privilege
-- no anonymous caller should hold.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- `authenticated` gets TRUNCATE by default too. Nothing needs it, and on
-- audit_log and handover_events it would let a member erase the tamper-evident
-- trail wholesale — which is exactly what those tables exist to prevent
-- (docs/SECURITY.md § 1.5).
revoke truncate on all tables in schema public from authenticated;
