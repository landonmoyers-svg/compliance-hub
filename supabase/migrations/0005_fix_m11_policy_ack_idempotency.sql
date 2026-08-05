-- =====================================================================
-- M11 fix — policy acknowledgment idempotency (2026-08-04)
-- Finding (live-confirmed): two concurrent identical policy_acks inserts both
-- succeeded → duplicate rows (an index existed on (user_id, document_id) but no
-- UNIQUE constraint), so a double-click/retry duplicated the acknowledgment.
--
-- Fix: dedupe existing 'acknowledged' rows (keep the most recent per user+doc),
-- then a PARTIAL unique index scoped to status='acknowledged'. Chosen over a
-- plain UNIQUE(user_id, document_id) because re-acknowledgment after expiry
-- legitimately creates a new row — 'expired' rows are left uncovered so re-acks
-- still work, while duplicate ACTIVE acks are blocked.
--
-- Paired with the app's list() pagination fix (M12) in src/lib/data/supabase-client.ts.
-- =====================================================================
with ranked as (
  select id, row_number() over (
           partition by user_id, document_id
           order by acknowledged_at desc nulls last, created_date desc) as rn
  from public.policy_acks
  where status = 'acknowledged'
)
delete from public.policy_acks p using ranked r where p.id = r.id and r.rn > 1;

create unique index if not exists policy_acks_user_doc_ack_uniq
  on public.policy_acks (user_id, document_id)
  where status = 'acknowledged';
