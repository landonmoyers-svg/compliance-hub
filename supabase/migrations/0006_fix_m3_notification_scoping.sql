-- =====================================================================
-- M3 fix — notification recipient scoping (2026-08-04)
-- Finding (live-confirmed): every authenticated user (incl. read_only) could
-- read ALL notifications, leaking per-person compliance status
-- ("Credential expired: Dr. X"). Notifications had no recipient column.
--
-- Fix: nullable `user_id` recipient. NULL = org-wide (everyone sees); set =
-- only that person + privileged. The scan job (src/app/api/notifications/scan)
-- now sets it on person-specific alerts (credential/training/insurance/paneling)
-- and leaves org-wide alerts (policy review, BAA, business records) NULL.
-- Deploy this migration together with the scan-route change.
-- Verified on staging: read_only/staff no longer see others' person-specific
-- alerts; org-wide alerts and one's own alerts still show; privileged see all.
-- =====================================================================
alter table public.notifications add column if not exists user_id uuid;
create index if not exists notifications_user_idx on public.notifications (user_id);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id is null or user_id = (select auth.uid()) or (select public.is_privileged()));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id is null or user_id = (select auth.uid()) or (select public.is_privileged()))
  with check (user_id is null or user_id = (select auth.uid()) or (select public.is_privileged()));
