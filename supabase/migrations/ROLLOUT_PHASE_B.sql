-- ============================================================
-- PRODUCTION ROLLOUT — PHASE B (run AFTER deploying the app)
-- Tightens the storage bucket; the new app routes signing through
-- /api/storage/sign. Requires SUPABASE_SERVICE_ROLE_KEY in Vercel prod.
-- ============================================================
drop policy if exists documents_authenticated_all on storage.objects;
create policy documents_owner_or_privileged on storage.objects
  for all to authenticated
  using (bucket_id = 'documents' and (owner = auth.uid() or public.is_privileged()))
  with check (bucket_id = 'documents' and (owner = auth.uid() or public.is_privileged()));
