-- Multi-industry platform, Phase 0 (2026-08-05). Additive columns on the org
-- settings so the SAME codebase can present as different industries and know
-- which jurisdiction's regulations apply. Defaults reproduce today's behavior
-- exactly: industry='healthcare' (hides nothing), jurisdiction={} (Utah address
-- already lives in the `address` field). Applied to prod as
-- `org_settings_industry_jurisdiction`.
alter table public.organization_settings
  add column if not exists industry text not null default 'healthcare',
  add column if not exists jurisdiction jsonb not null default '{}'::jsonb;
