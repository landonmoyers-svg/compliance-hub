-- =====================================================================
-- S1 fix — storage bucket per-user access control (2026-08-04)
-- Finding (live-confirmed): the `documents` bucket's only policy was
-- `documents_authenticated_all USING (bucket_id='documents')`, and signed-URL
-- minting was client-side — so ANY authenticated user (incl. read_only) could
-- list + download EVERY file (credential scans, insurance cards, employee I-9/
-- W-4/disciplinary docs).
--
-- Fix (paired with a new server route /api/storage/sign + src/lib/storage.ts):
--  Layer 1 — direct client access is now owner-or-privileged only.
--  Layer 2 — can_view_object(path) (SECURITY INVOKER) authorizes the server
--            route by RE-APPLYING the caller's RLS: true iff the caller can see
--            the object directly OR a record they may read references the path.
-- Verified on staging: staff/read_only can no longer list or reach another
-- user's private file; own-record files and broad-read SOPs still resolve.
--
-- NOTE: storage policies live in the dashboard on prod, not prior migrations —
-- confirm the exact prod policy name to drop when promoting.
-- =====================================================================

drop policy if exists documents_authenticated_all on storage.objects;
create policy documents_owner_or_privileged on storage.objects
  for all to authenticated
  using (bucket_id = 'documents' and (owner = auth.uid() or public.is_privileged()))
  with check (bucket_id = 'documents' and (owner = auth.uid() or public.is_privileged()));

create or replace function public.can_view_object(p text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $function$
  select
       exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p)
    or exists (select 1 from public.credentials             where document_url = p)
    or exists (select 1 from public.insurance_policies      where document_url = p)
    or exists (select 1 from public.employee_documents      where file_url = p)
    or exists (select 1 from public.documents               where file_url = p)
    or exists (select 1 from public.form_templates          where file_url = p)
    or exists (select 1 from public.business_records        where document_url = p)
    or exists (select 1 from public.vendors                 where baa_document_url = p or insurance_document_url = p)
    or exists (select 1 from public.osha_records            where document_url = p)
    or exists (select 1 from public.exclusion_screenings    where document_url = p)
    or exists (select 1 from public.incidents               where evidence_url = p)
    or exists (select 1 from public.controlled_substance_events where document_url = p)
    or exists (select 1 from public.dea_records             where document_url = p)
    or exists (select 1 from public.regulatory_sources      where attachment_url = p)
    or exists (select 1 from public.emergency_plans         where file_url = p)
    or exists (select 1 from public.payer_contracts         where contract_document_url = p or fee_schedule_url = p)
    or exists (select 1 from public.payer_enrollments       where application_document_url = p)
    or exists (select 1 from public.audit_items             where evidence_url = p)
    or exists (select 1 from public.ce_records              where document_url = p)
    or exists (select 1 from public.inventory               where image_url = p)
    or exists (select 1 from public.medical_supplies        where image_url = p)
    or exists (select 1 from public.supply_items            where image_url = p)
    or exists (select 1 from public.record_versions         where file_path = p);
$function$;
revoke all on function public.can_view_object(text) from public, anon;
grant execute on function public.can_view_object(text) to authenticated;
