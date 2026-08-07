-- P2-7 duplicate prevention (2026-08-05). Add uniqueness only where it's a true
-- identity key with zero existing duplicates AND no legitimate repeat pattern.
-- Applied to prod as `prevent_duplicate_vendors_competency`.
--   • vendors: one vendor per (normalized) name.
--   • competency_records: one record per employee per competency (the app already
--     warns on this; this is the hard backstop).
-- Deliberately NOT constrained: insurance_policies and credentials — the same
-- policy_number / license number legitimately repeats across renewal terms
-- (superseding), so a unique constraint there would break the renewal workflow.
-- form_templates has real duplicates that must be cleaned up first via the in-app
-- Find-duplicates tool before any constraint could be added.
create unique index if not exists vendors_name_uniq
  on public.vendors (lower(btrim(vendor_name)));

create unique index if not exists competency_records_person_name_uniq
  on public.competency_records (employee_id, lower(btrim(competency_name)));
