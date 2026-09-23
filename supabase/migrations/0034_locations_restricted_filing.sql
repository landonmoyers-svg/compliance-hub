-- A site whose controlled-substance log is closed to routine filing.
--
-- Murray Clinic 1's registration is retired: no new shipments arrive, so the
-- medical staff who keep the day-to-day logs have no reason to file against
-- it. Supervisors still do — people are fallible and an inspector can require
-- an amendment years later, so the ability to append is never removed, only
-- narrowed.
--
-- The Hub hides a restricted site from the filing picker for everyone else,
-- which is a courtesy rather than the control: SharePoint's own permissions on
-- that clinic's inbox are what actually decide. Better to not offer it than to
-- let someone scan twenty pages and be refused at the last step.

alter table public.locations
  add column if not exists restricted_filing boolean not null default false;

comment on column public.locations.restricted_filing is
  'Only supervisors may file controlled-substance logs here — for retired registrations that still need to accept amendments.';

update public.locations set restricted_filing = true where name = 'Murray Clinic 1';
