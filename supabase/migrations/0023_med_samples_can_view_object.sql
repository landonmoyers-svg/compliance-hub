-- [captured 2026-09-15] Applied to production via MCP on the date in its version; missing
-- from the repo until now. Body below is verbatim (verified by hash against
-- supabase_migrations.schema_migrations).
-- version 20260909164935  med_samples_can_view_object
-- Sample photos live at med_samples.image_url in the private documents bucket.
-- Without a clause here, /api/storage/sign refuses to mint a URL for anyone but
-- the uploader and the photo is unviewable.
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
  or exists (select 1 from public.med_samples where image_url = p)
  or exists (select 1 from public.training_assignments where certificate_url = p)
  or exists (select 1 from public.record_versions where file_path = p);
$f$;
