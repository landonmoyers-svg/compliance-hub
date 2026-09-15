-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260823031048  mt_phase3b_storage_tenant_isolation
-- MULTI-TENANCY PHASE 3b — storage isolation.
--
-- Two cross-tenant holes closed:
-- 1. can_view_object() began with `exists (select 1 from storage.objects where
--    name = p)` — TRUE for ANY existing file, short-circuiting every ownership
--    check below it. Narrowed to the caller's OWN upload (so a just-uploaded
--    file is reachable before a record references it); everything else must be
--    referenced by a record the caller can read — and those record tables are
--    now org-scoped, so storage inherits tenant isolation automatically.
-- 2. The storage.objects policy used the GLOBAL is_privileged(), so any
--    owner/admin/hr in ANY org could see every object. Now a privileged member
--    may only see objects owned by members of their OWN organization.
--
-- Verified: owner keeps access to referenced docs + own uploads; an outsider
-- gets false/0; all 23 null-owner files remain reachable via their records.

create or replace function public.can_view_object(p text) returns boolean
language sql stable set search_path to 'public' as $f$
  select exists (select 1 from storage.objects o
                 where o.bucket_id='documents' and o.name = p and o.owner = auth.uid())
  or exists (select 1 from public.credentials where document_url = p)
  or exists (select 1 from public.insurance_policies where document_url = p)
  or exists (select 1 from public.employee_documents where file_url = p)
  or exists (select 1 from public.documents where file_url = p)
  or exists (select 1 from public.form_templates where file_url = p)
  or exists (select 1 from public.business_records where document_url = p)
  or exists (select 1 from public.vendors where baa_document_url = p or insurance_document_url = p)
  or exists (select 1 from public.osha_records where document_url = p)
  or exists (select 1 from public.exclusion_screenings where document_url = p)
  or exists (select 1 from public.incidents where evidence_url = p)
  or exists (select 1 from public.controlled_substance_events where document_url = p)
  or exists (select 1 from public.dea_records where document_url = p)
  or exists (select 1 from public.regulatory_sources where attachment_url = p)
  or exists (select 1 from public.emergency_plans where file_url = p)
  or exists (select 1 from public.payer_contracts where contract_document_url = p or fee_schedule_url = p)
  or exists (select 1 from public.payer_enrollments where application_document_url = p)
  or exists (select 1 from public.audit_items where evidence_url = p)
  or exists (select 1 from public.ce_records where document_url = p)
  or exists (select 1 from public.inventory where image_url = p)
  or exists (select 1 from public.medical_supplies where image_url = p)
  or exists (select 1 from public.supply_items where image_url = p)
  or exists (select 1 from public.record_versions where file_path = p);
$f$;

drop policy if exists documents_owner_or_privileged on storage.objects;
create policy documents_owner_or_privileged on storage.objects for all to authenticated
  using (bucket_id='documents' and (
    owner = auth.uid()
    or exists (select 1 from public.org_memberships me
               join public.org_memberships them on them.org_id = me.org_id
               where me.user_id = auth.uid() and me.active
                 and them.user_id = storage.objects.owner and them.active
                 and public.is_privileged(me.org_id))))
  with check (bucket_id='documents' and (
    owner = auth.uid()
    or exists (select 1 from public.org_memberships me
               join public.org_memberships them on them.org_id = me.org_id
               where me.user_id = auth.uid() and me.active
                 and them.user_id = storage.objects.owner and them.active
                 and public.is_privileged(me.org_id))));
