-- Where a filed log lives in the archive, and what it looked like when filed.
--
-- archive_key is decided in the browser BEFORE the upload, because the thing
-- that files the record into its folder runs afterwards and can't wait for a
-- database id. An amendment reuses the key of the log it corrects, so a
-- correction lands in the same folder as the original rather than starting a
-- new one — the folder stays named and dated for the original filing.
--
-- file_hashes is a map of filename to SHA-256, computed in the browser before
-- the bytes leave it. It is what makes tampering DETECTABLE rather than merely
-- difficult: the hash lives in a different system, under different
-- administrators, from the file it describes. Neither side can be quietly
-- altered to agree with the other.

alter table public.dea_records
  add column if not exists archive_key text,
  add column if not exists file_hashes jsonb not null default '{}'::jsonb;

create index if not exists dea_records_archive_key_idx
  on public.dea_records (archive_key)
  where archive_key is not null;

comment on column public.dea_records.archive_key is
  'Stable key chosen at upload time; groups a log and its later amendments into one archive folder.';
comment on column public.dea_records.file_hashes is
  'filename -> SHA-256, computed in the browser before upload. Held here so the record of what was filed is not in the same system as the file.';
