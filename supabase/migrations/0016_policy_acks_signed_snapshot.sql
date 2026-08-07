-- P1-5 read-and-sign attestations (2026-08-05). Each signature permanently
-- captures a snapshot of the exact document version signed, so a later change to
-- the policy requires a fresh attestation while the prior one is kept (superseded).
-- Applied to prod as `policy_acks_signed_snapshot`.
alter table public.policy_acks
  add column if not exists document_version text,
  add column if not exists document_fingerprint text,
  add column if not exists signed_content text,
  add column if not exists signed_file_url text;
