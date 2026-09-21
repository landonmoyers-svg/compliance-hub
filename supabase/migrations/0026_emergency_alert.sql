-- EMERGENCY ALERT — LP Alert (the Base44 emergency-code app) rebuilt inside the Hub.
-- Staff trigger a code (Blue / Silver / Gray / Red …) at a site; everyone signed in
-- gets a live alarm; responders claim roles; an admin resolves. Also carries the
-- non-emergency "request admin assistance" flow and each person's responder
-- profile (default site, weekly schedule, clock-in override, per-code defaults).
--
-- AUDIO IS NOT STORED HERE. Incident audio streams phone → admin device and is
-- saved only on that device (Landon, 2026-09-21: the Hub has no BAA and the audio
-- will capture patients). The only audio data in the database is metadata — how
-- many clips exist and which device holds them — plus the access audit log.

-- 1. The codes staff can trigger, with their alarm and default roles.
create table if not exists public.emergency_codes (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  name text not null,
  description text,
  priority text not null default 'HIGH PRIORITY',
  color_hex text not null default '#E53935',
  alarm_sound text not null default 'default'
    check (alarm_sound in ('default','fire_alarm','beep_fast','beep_slow','siren_high','siren_low','triple_beep','silent')),
  required_roles text[] not null default '{}',
  audio_recording_enabled boolean not null default true,
  sort_order int not null default 0,
  active boolean not null default true
);

-- 2. How each site relates to the others during an emergency. Replaces the
--    Clinic fields in LP Alert. One row per location; location_id is unique.
create table if not exists public.emergency_site_settings (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  location_id uuid not null references public.locations(id) on delete cascade,
  response_zone text,
  mutual_aid_location_ids uuid[] not null default '{}',
  connected_location_ids uuid[] not null default '{}',
  refuge_for_location_ids uuid[] not null default '{}',
  aed_source_location_id uuid references public.locations(id) on delete set null,
  crash_cart_source_location_id uuid references public.locations(id) on delete set null,
  unique (org_id, location_id)
);

-- 3. An incident (LP Alert's CodeTrigger).
create table if not exists public.emergency_incidents (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  code_id uuid references public.emergency_codes(id) on delete set null,
  code_name text not null,
  location_id uuid references public.locations(id) on delete set null,
  location_name text,
  internal_location text,
  notes text,
  triggered_by uuid,                       -- auth user id
  triggered_by_name text,
  triggered_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  is_remote boolean not null default false,
  remote_address text,
  remote_city text,
  remote_state text,
  is_test boolean not null default false,
  evacuation_status text not null default 'pending'
    check (evacuation_status in ('pending','evacuate','shelter')),
  threat_location_details text,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by_name text,
  -- Audio METADATA only: [{clipIndex, recordedAt, durationSec, heldBy}] — no URLs, no audio.
  audio_clips jsonb not null default '[]'::jsonb,
  legacy_id text                           -- Base44 record id, for the one-time import
);

-- 4. A person responding to an incident.
create table if not exists public.emergency_responses (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  incident_id uuid not null references public.emergency_incidents(id) on delete cascade,
  user_id uuid,                            -- auth user id
  responder_name text,
  responded_at timestamptz not null default now(),
  response_role text,
  assistance_type text,
  items_bringing text[] not null default '{}',
  estimated_arrival text,
  status text not null default 'responding'
    check (status in ('responding','on_site','standby','completed')),
  status_updates jsonb not null default '[]'::jsonb,
  message text,
  is_remote boolean not null default false,
  distance_meters int,
  legacy_id text
);

-- 5. Non-emergency "I need a hand" requests.
create table if not exists public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  requested_by uuid,
  requested_by_name text not null,
  location_id uuid references public.locations(id) on delete set null,
  location_name text,
  assistance_type text not null,
  urgency text not null default 'now' check (urgency in ('now','within_5_mins')),
  notes text,
  responders jsonb not null default '[]'::jsonb,   -- [{userId, name, eta, respondedAt}]
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by_name text,
  legacy_id text
);

-- 6. Each person's responder profile (LP Alert kept these on the User record).
create table if not exists public.emergency_responder_profiles (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  user_id uuid not null,                   -- auth user id
  full_name text,
  emergency_role text,
  phone text,
  default_location_id text,                -- a location uuid, or 'remote'
  clocked_in_location_id text,             -- today's override: location uuid or 'remote'
  clocked_in_date date,
  weekly_schedule jsonb not null default '{}'::jsonb,   -- {monday: <location uuid|'remote'|'off'>, …}
  seniority int check (seniority between 1 and 100),
  code_defaults jsonb not null default '{}'::jsonb,     -- {"Code Blue": {assistanceType, itemsBringing[], estimatedArrival}}
  can_listen_audio boolean not null default false,
  show_in_contacts boolean not null default true,
  app_quiz_passed_at timestamptz,
  sop_quiz_passed_at timestamptz,
  unique (org_id, user_id)
);

-- 7. Who does what, per site and code (LP Alert's UserLocationRole).
create table if not exists public.emergency_location_roles (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  user_id uuid not null,
  location_id uuid not null references public.locations(id) on delete cascade,
  code_name text not null,
  response_role text not null,
  expected_assistance text,
  notes text
);

-- 8. Audit trail for incident audio: who listened / saved / deleted which clip,
--    on which device. The audio itself never touches the server.
create table if not exists public.emergency_audio_log (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  incident_id uuid references public.emergency_incidents(id) on delete set null,
  incident_label text,
  action text not null check (action in ('listened_live','saved_clip','played_clip','exported_clip','deleted_clip','accessed','downloaded_clip','downloaded_all','deleted_audio')),
  performed_by uuid,
  performed_by_name text not null,
  performed_by_email text,
  clip_index int,
  clip_count int,
  device_label text,
  details text
);

-- 9. Browser push subscriptions, so an alert reaches a closed tab / locked screen.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  org_id uuid references public.organizations(id),
  user_id uuid not null default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_used_at timestamptz,
  unique (endpoint)
);

create index if not exists emergency_codes_org_idx on public.emergency_codes(org_id);
create index if not exists emergency_site_settings_org_idx on public.emergency_site_settings(org_id);
create index if not exists emergency_incidents_org_idx on public.emergency_incidents(org_id, triggered_at desc);
create index if not exists emergency_incidents_active_idx on public.emergency_incidents(org_id) where not resolved;
create index if not exists emergency_responses_incident_idx on public.emergency_responses(incident_id);
create index if not exists assistance_requests_org_idx on public.assistance_requests(org_id, created_date desc);
create index if not exists emergency_responder_profiles_user_idx on public.emergency_responder_profiles(user_id);
create index if not exists emergency_location_roles_org_idx on public.emergency_location_roles(org_id, location_id);
create index if not exists emergency_audio_log_org_idx on public.emergency_audio_log(org_id, created_date desc);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

do $$
declare t text;
begin
  foreach t in array array['emergency_codes','emergency_site_settings','emergency_incidents','emergency_responses',
                           'assistance_requests','emergency_responder_profiles','emergency_location_roles',
                           'emergency_audio_log','push_subscriptions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create trigger trg_set_org_id before insert on public.%I for each row execute function public.set_org_id()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- policies
-- Emergencies cross sites (Murray mutual aid), so incidents are org-wide — NOT
-- scoped by can_see_location. Every active member can raise and see an alarm,
-- including read_only accounts: in an emergency anyone must be able to call it.

-- Reference data: everyone reads; privileged roles configure.
create policy emergency_codes_read on public.emergency_codes for select to authenticated
  using (org_id in (select my_org_ids()));
create policy emergency_codes_write on public.emergency_codes for all to authenticated
  using (org_id in (select my_org_ids()) and (select is_privileged(emergency_codes.org_id)))
  with check (org_id in (select my_org_ids()) and (select is_privileged(emergency_codes.org_id)));

create policy emergency_site_settings_read on public.emergency_site_settings for select to authenticated
  using (org_id in (select my_org_ids()));
create policy emergency_site_settings_write on public.emergency_site_settings for all to authenticated
  using (org_id in (select my_org_ids()) and (select is_privileged(emergency_site_settings.org_id)))
  with check (org_id in (select my_org_ids()) and (select is_privileged(emergency_site_settings.org_id)));

create policy emergency_location_roles_read on public.emergency_location_roles for select to authenticated
  using (org_id in (select my_org_ids()));
create policy emergency_location_roles_write on public.emergency_location_roles for all to authenticated
  using (org_id in (select my_org_ids()) and (select is_privileged(emergency_location_roles.org_id)))
  with check (org_id in (select my_org_ids()) and (select is_privileged(emergency_location_roles.org_id)));

-- Incidents: anyone raises one as themselves; the person who raised it or a
-- privileged role updates it (resolve, evacuation directive, audio metadata).
create policy emergency_incidents_read on public.emergency_incidents for select to authenticated
  using (org_id in (select my_org_ids()));
create policy emergency_incidents_insert on public.emergency_incidents for insert to authenticated
  with check (org_id in (select my_org_ids()) and triggered_by = auth.uid());
create policy emergency_incidents_update on public.emergency_incidents for update to authenticated
  using (org_id in (select my_org_ids()) and (triggered_by = auth.uid() or (select is_privileged(emergency_incidents.org_id))))
  with check (org_id in (select my_org_ids()) and (triggered_by = auth.uid() or (select is_privileged(emergency_incidents.org_id))));
create policy emergency_incidents_delete on public.emergency_incidents for delete to authenticated
  using (org_id in (select my_org_ids()) and (select owner_or_admin(emergency_incidents.org_id)));

-- Responses: you respond as yourself and update your own status.
create policy emergency_responses_read on public.emergency_responses for select to authenticated
  using (org_id in (select my_org_ids()));
create policy emergency_responses_insert on public.emergency_responses for insert to authenticated
  with check (org_id in (select my_org_ids()) and user_id = auth.uid());
create policy emergency_responses_update on public.emergency_responses for update to authenticated
  using (org_id in (select my_org_ids()) and (user_id = auth.uid() or (select is_privileged(emergency_responses.org_id))))
  with check (org_id in (select my_org_ids()) and (user_id = auth.uid() or (select is_privileged(emergency_responses.org_id))));
create policy emergency_responses_delete on public.emergency_responses for delete to authenticated
  using (org_id in (select my_org_ids()) and (select owner_or_admin(emergency_responses.org_id)));

-- Assistance requests: anyone asks as themselves; any member may add
-- themselves as a responder or mark it handled (it's a low-stakes, shared queue).
create policy assistance_requests_read on public.assistance_requests for select to authenticated
  using (org_id in (select my_org_ids()));
create policy assistance_requests_insert on public.assistance_requests for insert to authenticated
  with check (org_id in (select my_org_ids()) and requested_by = auth.uid());
create policy assistance_requests_update on public.assistance_requests for update to authenticated
  using (org_id in (select my_org_ids()))
  with check (org_id in (select my_org_ids()));
create policy assistance_requests_delete on public.assistance_requests for delete to authenticated
  using (org_id in (select my_org_ids()) and (select owner_or_admin(assistance_requests.org_id)));

-- Responder profiles: everyone sees who's where (that's the point during an
-- incident); you edit your own; privileged roles edit anyone's.
create policy emergency_responder_profiles_read on public.emergency_responder_profiles for select to authenticated
  using (org_id in (select my_org_ids()));
create policy emergency_responder_profiles_write on public.emergency_responder_profiles for all to authenticated
  using (org_id in (select my_org_ids()) and (user_id = auth.uid() or (select is_privileged(emergency_responder_profiles.org_id))))
  with check (org_id in (select my_org_ids()) and (user_id = auth.uid() or (select is_privileged(emergency_responder_profiles.org_id))));

-- Audio audit log: anyone may append their own entry; only privileged roles read it.
create policy emergency_audio_log_read on public.emergency_audio_log for select to authenticated
  using (org_id in (select my_org_ids()) and (select is_privileged(emergency_audio_log.org_id)));
create policy emergency_audio_log_insert on public.emergency_audio_log for insert to authenticated
  with check (org_id in (select my_org_ids()) and performed_by = auth.uid());

-- Push subscriptions: strictly your own. The server sends with service_role.
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and org_id in (select my_org_ids()));

-- ---------------------------------------------------------------- realtime
-- Live alarm + dashboard: stream row changes (RLS still applies per subscriber).
alter publication supabase_realtime add table public.emergency_incidents;
alter publication supabase_realtime add table public.emergency_responses;
alter publication supabase_realtime add table public.assistance_requests;

-- Private broadcast/presence channels, used for "who's online" and for the
-- WebRTC signalling that sets up the phone → admin audio stream. Topics are
-- named 'org:<org uuid>:<purpose>'; only active members of that org may join.
-- (Signalling carries connection offers only — never audio.)
create or replace function public.realtime_topic_org(topic text)
returns uuid language sql immutable as $$
  select case when topic ~ '^org:[0-9a-f-]{36}:' then substring(topic from 5 for 36)::uuid end
$$;
grant execute on function public.realtime_topic_org(text) to authenticated;

create policy org_members_receive on realtime.messages for select to authenticated
  using (public.realtime_topic_org(realtime.topic()) in (select public.my_org_ids()));
create policy org_members_send on realtime.messages for insert to authenticated
  with check (public.realtime_topic_org(realtime.topic()) in (select public.my_org_ids()));
