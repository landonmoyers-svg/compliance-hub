-- Who directed the treatment the log records.
--
-- A row in an administration log names the person who gave the dose, and that
-- is routinely not the person whose registration it was given under: the
-- medical director orders the medication and delegates administration to
-- licensed providers working under their direction. Read without that, the
-- log looks like it is claiming the administering provider's own authority.
--
-- It cannot be derived from the registration either. That works only while the
-- registrant is an individual; a location registration is held by the practice,
-- and the directing clinician is then a different fact entirely.

alter table public.dea_records
  add column if not exists directed_by_name text;

comment on column public.dea_records.directed_by_name is
  'The clinician under whose direction the treatments in this log were given. Distinct from the registrant and from whoever administered each dose.';
