-- =====================================================================
-- HomeVault — encrypted attachment storage.
--
-- Holds the scanned documents themselves. Everything in this bucket is
-- ciphertext produced on the household's device (see src/lib/attachments/),
-- so the server stores bytes it cannot read and cannot identify.
-- =====================================================================

-- Private bucket, 25 MB per object.
--
-- The size limit matches MAX_ATTACHMENT_BYTES in the client: encrypting in one
-- pass needs roughly twice the file size in browser memory, which is the real
-- constraint. Chunked streaming would lift it, and should come before video.
--
-- Every object declares `application/octet-stream`. Recording the true type
-- would tell anyone who can list the bucket whether a household stores PDFs of
-- legal documents or photos of ID cards — so nothing does.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 26214400, array['application/octet-stream'])
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400,
      allowed_mime_types = array['application/octet-stream'];

-- ---------------------------------------------------------------------
-- Access
--
-- Object paths are `{household_id}/{attachment_uuid}` — no filename and no
-- extension, because "2019 divorce decree.pdf" reveals plenty without anyone
-- decrypting a byte. The first path segment is the household, so these policies
-- reuse the same `is_member()` check as the tables.
--
-- This is the second fence. The encryption is the first: even a total failure
-- here yields opaque blobs.
-- ---------------------------------------------------------------------
drop policy if exists attachments_member_read   on storage.objects;
drop policy if exists attachments_member_insert on storage.objects;
drop policy if exists attachments_member_delete on storage.objects;

create policy attachments_member_read on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and is_member(((storage.foldername(name))[1])::uuid));

create policy attachments_member_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and is_member(((storage.foldername(name))[1])::uuid));

create policy attachments_member_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and is_member(((storage.foldername(name))[1])::uuid));

-- Deliberately NO update policy. An attachment is written once and deleted,
-- never edited in place — allowing overwrite would let one document be
-- substituted for another under a reference the household still trusts.
