-- Table privileges for dea_registrations and record_recovery_items.
--
-- This project does not grant table privileges to `authenticated` by default,
-- so a new table is invisible to the app until granted explicitly — every read
-- and write is refused at the privilege level, before RLS is consulted, and
-- the client sees a bare permission error rather than an empty result.
--
-- The RLS policies on these tables are what actually decide who sees what;
-- these grants only let the role reach the table to be checked.
--
-- Worth remembering when adding any future table: RLS alone is not enough.

grant select, insert, update, delete on public.dea_registrations to authenticated;
grant select, insert, update, delete on public.record_recovery_items to authenticated;
