-- The certificate itself, and when it runs out.
--
-- A registration record without the certificate attached is a transcription of
-- one — and the first thing anybody asks for is the document. It is a business
-- record, not a clinical one: it names the registrant, the address, the
-- schedules and the expiry, and no patient. So unlike the logs, it can live in
-- the Hub's own storage rather than needing SharePoint.
--
-- expires_on is the other half. A DEA registration has to be renewed, and a
-- lapsed one is not a paperwork problem — it is a registration you no longer
-- hold while continuing to order under it.

alter table public.dea_registrations
  add column if not exists document_url text,
  add column if not exists expires_on date;

comment on column public.dea_registrations.document_url is
  'The registration certificate. A business record naming no patient, so it is held in the Hub rather than SharePoint.';
comment on column public.dea_registrations.expires_on is
  'When the registration needs renewing. Distinct from retired_on, which is when it stopped being used.';
