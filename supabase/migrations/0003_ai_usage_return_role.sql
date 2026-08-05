-- =====================================================================
-- Role-based AI daily caps (2026-08-04)
-- bump_ai_usage() now returns {count, role} so the app can apply a per-role
-- daily cap in a single round-trip (no extra profile lookup per AI call).
-- Limits live in the app (src/lib/ai/usage.ts), env-tunable per tier:
--   AI_DAILY_CAP_PRIVILEGED (owner/admin/hr/clinical_leadership) default 500
--   AI_DAILY_CAP_MANAGER    default 300
--   AI_DAILY_CAP_STAFF      (staff/contractor, legacy AI_DAILY_CAP) default 150
--   AI_DAILY_CAP_READONLY   default 30
-- MUST deploy together with the matching src/lib/ai/usage.ts (return type changed).
-- =====================================================================
drop function if exists public.bump_ai_usage();
create function public.bump_ai_usage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare c integer; r text;
begin
  insert into public.ai_usage (user_id, usage_date, count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, usage_date) do update set count = ai_usage.count + 1
  returning count into c;
  select account_role into r from public.profiles where user_id = auth.uid();
  return jsonb_build_object('count', c, 'role', coalesce(r, 'staff'));
end;
$function$;
revoke all on function public.bump_ai_usage() from public, anon;
grant execute on function public.bump_ai_usage() to authenticated;
