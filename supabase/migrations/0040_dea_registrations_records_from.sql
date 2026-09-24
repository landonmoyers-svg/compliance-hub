-- When THIS practice's records under a number begin.
--
-- A DEA registration renews every three years, so the certificate shows the
-- CURRENT term while records under the number go back further. But the number
-- follows the REGISTRANT, not the practice: it can have been issued years
-- earlier at a previous employer's address and moved here later, and records
-- from before that move belong to the practice that held the address then.
--
-- So reconciliation needs neither the certificate's term nor the number's
-- original issue date. It needs the date from which this practice is
-- answerable for what was kept under it — usually when the practice opened or
-- the registration moved to its address.
--
-- Measuring from the certificate would put years of archive outside the window
-- so they'd never show up as gaps; measuring from first issue would claim
-- records that were somebody else's.
--
-- effective_from / expires_on stay exactly as printed on the certificate.

alter table public.dea_registrations
  add column if not exists records_from date;

comment on column public.dea_registrations.records_from is
  'The date from which THIS practice keeps records under this number — usually when it opened or the registration moved to this address. Not when the number was first issued, which may predate the practice. Coverage is measured from here.';
