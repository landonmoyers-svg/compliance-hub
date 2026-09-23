-- CONTROLLED SUBSTANCES — receive a whole shipment from its paperwork.
--
-- Before this, a delivery was logged one box at a time and nothing tied the
-- boxes together. A real delivery is one manifest (packing slip / invoice /
-- 222) covering several sealed boxes, each with its own DSCSA label (GTIN,
-- serial number, lot, expiry), each holding N vials. This adds the two levels
-- that were missing — manifest and box — above the vial-level custody records
-- that already exist.

-- The paperwork for one delivery.
create table if not exists public.cs_manifests (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  supplier_name text,
  supplier_dea text,
  customer_dea text,
  ship_to_name text,
  ship_to_address text,
  po_number text,
  order_number text,
  packing_slip_number text,
  order_date date,
  received_date date,
  location_id uuid references public.locations(id) on delete set null,
  received_by_name text,
  received_by_user_id uuid,
  -- The scanned slip / box photos this was read from, and what the AI returned,
  -- kept verbatim so a reviewer can see what was proposed vs what was saved.
  document_urls text[] not null default '{}',
  extracted jsonb,
  ai_confidence text,
  -- What the paperwork says, for reconciliation against what was actually minted.
  expected_box_count int,
  expected_unit_count int,
  discrepancy boolean not null default false,
  discrepancy_note text,
  notes text
);

-- One sealed box from that delivery.
create table if not exists public.cs_boxes (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  manifest_id uuid references public.cs_manifests(id) on delete set null,
  label text not null,                 -- the box label in the practice's scheme, e.g. "M-A"
  box_number int,                      -- as written on the box ("1" in "1 = A")
  substance_name text,
  ndc text,
  gtin text,
  serial_number text,                  -- DSCSA serial from the box label
  lot_number text,
  expiration_date date,
  expiration_is_month boolean not null default false,  -- label said "2028/05"
  unit_count int not null default 0,   -- vials the box held when received
  unit_volume numeric,                 -- size of one vial
  unit_volume_uom text,
  strength_per_unit text,
  location_id uuid references public.locations(id) on delete set null,
  opened boolean not null default false,
  notes text
);

alter table public.controlled_substance_items
  add column if not exists manifest_id uuid references public.cs_manifests(id) on delete set null,
  add column if not exists box_id uuid references public.cs_boxes(id) on delete set null;

create index if not exists cs_manifests_org_idx on public.cs_manifests(org_id, received_date desc);
create index if not exists cs_boxes_manifest_idx on public.cs_boxes(manifest_id);
create index if not exists cs_boxes_org_idx on public.cs_boxes(org_id, label);
create index if not exists cs_items_manifest_idx on public.controlled_substance_items(manifest_id);
create index if not exists cs_items_box_idx on public.controlled_substance_items(box_id);
-- A serial number identifies exactly one physical box.
create unique index if not exists cs_boxes_serial_uq on public.cs_boxes(org_id, serial_number) where serial_number is not null;

do $$
declare t text;
begin
  foreach t in array array['cs_manifests','cs_boxes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create trigger trg_set_org_id before insert on public.%I for each row execute function public.set_org_id()', t);
  end loop;
end $$;

-- Same access as the vial-level records they group: site-scoped read for staff
-- who can see that site, writes for clinical admins / owner.
create policy cs_manifests_read on public.cs_manifests for select to authenticated
  using (org_id in (select my_org_ids()) and can_see_location(org_id, location_id));
create policy cs_manifests_write on public.cs_manifests for all to authenticated
  using (org_id in (select my_org_ids()) and can_see_location(org_id, location_id) and (select clinical_admin_or_owner(cs_manifests.org_id)))
  with check (org_id in (select my_org_ids()) and can_see_location(org_id, location_id) and (select clinical_admin_or_owner(cs_manifests.org_id)));

create policy cs_boxes_read on public.cs_boxes for select to authenticated
  using (org_id in (select my_org_ids()) and can_see_location(org_id, location_id));
create policy cs_boxes_write on public.cs_boxes for all to authenticated
  using (org_id in (select my_org_ids()) and can_see_location(org_id, location_id) and (select clinical_admin_or_owner(cs_boxes.org_id)))
  with check (org_id in (select my_org_ids()) and can_see_location(org_id, location_id) and (select clinical_admin_or_owner(cs_boxes.org_id)));

-- The manifest photos live in the documents bucket; without a clause here
-- can_view_object() refuses to sign them for anyone but the uploader
-- (handoff gotcha #6). Same body as 0023, plus the cs_manifests array.
create or replace function public.can_view_object(p text)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
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
  or exists (select 1 from public.record_versions where file_path = p)
  or exists (select 1 from public.cs_manifests m where p = any(m.document_urls));
$function$;
