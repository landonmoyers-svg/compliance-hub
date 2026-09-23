-- Amendments to filed paper logs.
--
-- The archive is append-only: nobody can edit or delete a record once it is
-- filed, which is what makes it worth anything as a DEA record. So a
-- correction is a NEW filing that supersedes an earlier one — and without a
-- link between them the register degenerates into a stack of near-identical
-- files with no way to tell which one is current.
--
-- amends_record_id points at the log being corrected. The chain is displayed
-- newest-first with prior versions nested beneath, and — the part that is easy
-- to get wrong — only the newest version of a chain counts towards
-- reconciliation. Counting both would double the period totals and invent a
-- discrepancy that never happened.
--
-- The superseded record is never deleted. Its file stays in SharePoint and its
-- entries stay here; an erasable record is one you cannot defend.

alter table public.dea_records
  add column if not exists amends_record_id uuid references public.dea_records(id) on delete set null,
  add column if not exists amendment_reason text;

-- Finding a record's amendments is the common read (drawing the chain), so
-- index the direction that is actually queried.
create index if not exists dea_records_amends_idx
  on public.dea_records (amends_record_id)
  where amends_record_id is not null;

comment on column public.dea_records.amends_record_id is
  'The filed log this one corrects. The superseded record is retained, not removed; only the newest in a chain counts towards reconciliation.';
