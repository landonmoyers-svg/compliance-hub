-- =====================================================================
-- HomeVault — owner access, and making the `viewer` role mean something.
--
-- The governing rule, which the handover machinery makes easy to lose sight
-- of: the people who own a vault can open it, always, without ceremony.
-- Thresholds, trustees and grace windows exist for one situation only — when
-- the people who could grant access are no longer able to.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. `viewer` was a label that lied.
--
-- `records_member_all` grants ALL to any member via is_member(), with no role
-- check, so a "viewer" could delete the household's records. Worse, `viewer`
-- was the column default, so anyone added without an explicit role silently
-- got full write access under a name suggesting otherwise.
--
-- A permission label that misrepresents what it permits is worse than having
-- no label at all.
-- ---------------------------------------------------------------------

create or replace function is_member_who_can_write(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members m
    where m.household_id = h
      and m.user_id = auth.uid()
      -- Owners and co-owners are deliberately equal here. This is a household,
      -- not an org chart; a partner who can read but not correct a record
      -- would defeat the point of keeping it in one place.
      and m.role in ('owner', 'co_owner')
  );
$$;
revoke all on function is_member_who_can_write(uuid) from public, anon, authenticated;
grant execute on function is_member_who_can_write(uuid) to authenticated;

-- Reading stays open to every member, including viewers: membership IS access.
-- Only the ability to CHANGE things is narrowed.
drop policy if exists records_member_all on records;

create policy records_member_read on records
  for select to authenticated using (is_member(household_id));

create policy records_member_insert on records
  for insert to authenticated with check (is_member_who_can_write(household_id));

create policy records_member_update on records
  for update to authenticated
  using (is_member_who_can_write(household_id))
  with check (is_member_who_can_write(household_id));

create policy records_member_delete on records
  for delete to authenticated using (is_member_who_can_write(household_id));

-- Handover configuration decides who inherits everything, so it is writable
-- only by full members — never by a viewer.
drop policy if exists plans_member_all on handover_plans;

create policy plans_member_read on handover_plans
  for select to authenticated using (is_member(household_id));
create policy plans_member_write on handover_plans
  for all to authenticated
  using (is_member_who_can_write(household_id))
  with check (is_member_who_can_write(household_id));

drop policy if exists recipients_member_write on handover_recipients;
create policy recipients_member_write on handover_recipients
  for all to authenticated
  using (is_member_who_can_write(household_id))
  with check (is_member_who_can_write(household_id));

-- Attachments follow their records: any member may read, only writers may add
-- or remove.
drop policy if exists attachments_member_insert on storage.objects;
drop policy if exists attachments_member_delete on storage.objects;

create policy attachments_member_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and is_member_who_can_write(((storage.foldername(name))[1])::uuid));

create policy attachments_member_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and is_member_who_can_write(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------
-- 2. Stop defaulting people to a role that isn't what anyone means.
--
-- An invited adult partner is the entire point of a shared household vault,
-- and the everyday failsafe — "the other owner already has their own key" —
-- only works if they actually have full access.
-- ---------------------------------------------------------------------
alter table household_members alter column role set default 'co_owner';
alter table household_invites alter column role set default 'co_owner';

-- Existing rows created under the old default were granted full access by the
-- policies in force at the time, so their real permission level was co-owner.
-- Relabel them to match, rather than silently revoking access someone already
-- has and relies on.
update household_members set role = 'co_owner' where role = 'viewer';

comment on column household_members.role is
  'owner: full access + manage people. co_owner: full access + invite. viewer: READ ONLY, enforced by is_member_who_can_write().';
