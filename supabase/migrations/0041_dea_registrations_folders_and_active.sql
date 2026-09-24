-- Where a registration's records live, and whether it is in use yet.
--
-- The folder mapping was living in each person's browser, remembered per
-- registration. That meant every user pasting the same URLs, and a new
-- registration meaning everyone redoing it — setup repeated per person rather
-- than configured once. It belongs on the registration, where the app reads it
-- for everybody.
--
-- `active` is what lets the mapping exist before the registration does. A
-- location registration months away can have its libraries created and mapped
-- now and simply not be offered for filing; when the number arrives, filling
-- it in and switching this on is the whole change. No code is touched.

alter table public.dea_registrations
  add column if not exists inbox_folder_url text,
  add column if not exists archive_folder_url text,
  add column if not exists active boolean not null default true;

comment on column public.dea_registrations.inbox_folder_url is
  'SharePoint folder that filed pages are uploaded into, before the flow moves them to the archive.';
comment on column public.dea_registrations.archive_folder_url is
  'SharePoint library holding this registration''s records. An inspector asks per registration, so each has its own.';
comment on column public.dea_registrations.active is
  'False for a registration that is mapped but not yet in use — its folders exist, it is simply not offered for filing.';
