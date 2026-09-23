#!/usr/bin/env python3
"""
One-time import of LP Alert (Base44) data into the Hub's Emergency Alert tables.

    python3 scripts/lp-alert-import.py <folder of Base44 CSV exports> > import.sql

Reads the table CSVs exported from Base44 (Dashboard → Data → table → ⋯ → Export)
and prints idempotent SQL: re-running it never duplicates rows (incidents,
responses and requests are keyed on legacy_id, codes on name, profiles on
employee). Run the SQL as service_role — so org_id is set explicitly here
(the org trigger does not fire for service_role; handoff gotcha #5).

The CSVs hold staff phone numbers and emails, so they live OUTSIDE the repo.
Audio clip URLs are NOT imported — only how many clips existed and when
(audio stays off the Hub's servers; see migration 0026).
"""
import csv
import json
import os
import sys

ORG = "c5cdf8c6-4a26-4be3-b2d8-6092e366dcbd"  # Lone Peak Psychiatry

# LP Alert clinic name → Hub location name
SITE = {
    "Clinic 1": "Murray Clinic 1",
    "Clinic 2": "Murray Clinic 2",
    "Admin Building": "Murray Admin Building",
    "Lehi Clinic": "Lehi Clinic",
}

# LP Alert login email → Hub employee email. People with several LP Alert
# accounts map to one employee. Unmapped accounts (e.g. a family account,
# someone who isn't in Employees) are skipped for profiles; their history keeps
# the name only.
PERSON = {
    "landon@lonepeakpsychiatry.com": "landon@lonepeakpsychiatry.com",
    "landlmoyers@gmail.com": "landon@lonepeakpsychiatry.com",
    "landonmoyers@gmail.com": "landon@lonepeakpsychiatry.com",
    "michael.miles1990@gmail.com": "mike@lonepeakpsychiatry.com",
    "jolene.lonepeak@gmail.com": "jolene@lonepeakpsychiatry.com",
    "cierra.lonepeak@gmail.com": "cierra@lonepeakpsychiatry.com",
    "mackenzie.lonepeak@gmail.com": "mackenzie@lonepeakpsychiatry.com",
    "gwenlonepeakpsychiatry@gmail.com": "gwen@lonepeakpsychiatry.com",
    "cameron@lonepeakpsychiatry.com": "cameron@lonepeakpsychiatry.com",
    "joshuareedbentley@gmail.com": "josh@lonepeakpsychiatry.com",
    "nicole.lonepeak@gmail.com": "nicole@lonepeakpsychiatry.com",
    "emmett.lonepeak.com@gmail.com": "erin@lonepeakpsychiatry.com",
}
# The LP Alert account whose settings become that employee's profile, when
# someone had more than one account.
PROFILE_SOURCE = {"landon@lonepeakpsychiatry.com": "landon@lonepeakpsychiatry.com"}

CODE_ORDER = {"Code Blue": 1, "Code Red": 2, "Code Silver": 3, "Code Gray": 4}


def rows(folder, name):
    path = os.path.join(folder, f"{name}.csv")
    return list(csv.DictReader(open(path))) if os.path.exists(path) else []


def q(v):
    """SQL literal."""
    if v is None or v == "":
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def jarr(v):
    try:
        x = json.loads(v) if v else []
        return x if isinstance(x, list) else []
    except json.JSONDecodeError:
        return []


def jobj(v):
    try:
        x = json.loads(v) if v else {}
        return x if isinstance(x, dict) else {}
    except json.JSONDecodeError:
        return {}


def text_array(items):
    return "array[" + ",".join(q(i) for i in items) + "]::text[]" if items else "'{}'::text[]"


def loc(site_name):
    hub = SITE.get(site_name)
    return f"pg_temp.loc({q(hub)})" if hub else "null"


def emp(email, col="id"):
    if not email:
        return "null"
    return f"pg_temp.emp_user({q(email)})" if col == "user_id" else f"pg_temp.emp_id({q(email)})"


# Session-local lookup helpers keep the generated SQL short.
HELPERS = f"""
create function pg_temp.loc(n text) returns uuid language sql stable as
  $$ select id from public.locations where org_id = '{ORG}' and name = n $$;
create function pg_temp.emp_id(m text) returns uuid language sql stable as
  $$ select id from public.employees where org_id = '{ORG}' and lower(email) = m limit 1 $$;
create function pg_temp.emp_user(m text) returns uuid language sql stable as
  $$ select user_id from public.employees where org_id = '{ORG}' and lower(email) = m limit 1 $$;
"""


def main(folder):
    clinics = rows(folder, "Clinic")
    clinic_name = {c["id"]: c["name"] for c in clinics}
    codes = rows(folder, "EmergencyCode")
    users = rows(folder, "User")

    # Base44 user id → login email, recovered from created_by on records
    # people made themselves (the Users export has no id column).
    uid_email = {}
    for t, col in [("EmergencyResponse", "userId"), ("CodeTrigger", "userId"),
                   ("AssistanceRequest", "requestedById"), ("UserLocationRole", "userId")]:
        for r in rows(folder, t):
            if r.get(col) and r.get(col) == r.get("created_by_id"):
                uid_email[r[col]] = r["created_by"].lower()

    def hub_email(b44_uid):
        return PERSON.get(uid_email.get(b44_uid, ""))

    def site_ref(b44_clinic_id):
        if b44_clinic_id == "remote":
            return q("remote")
        return f"({loc(clinic_name.get(b44_clinic_id, ''))})::text" if b44_clinic_id in clinic_name else "null"

    out = ["begin;", HELPERS.strip()]

    # Coordinates for the Murray sites (the Hub had none; LP Alert uses them to
    # tell an on-site trigger from a remote one). Never overwrite existing ones.
    for c in clinics:
        if c.get("latitude") and c.get("longitude"):
            out.append(f"update public.locations set lat = {c['latitude']}, lng = {c['longitude']} "
                       f"where org_id = {q(ORG)} and name = {q(SITE.get(c['name']))} and lat is null;")

    for c in codes:
        out.append(
            "insert into public.emergency_codes (org_id, name, description, priority, color_hex, alarm_sound, "
            "required_roles, audio_recording_enabled, sort_order) "
            f"select {q(ORG)}, {q(c['name'])}, {q(c['description'])}, {q(c['priority'])}, {q(c['colorHex'] or '#E53935')}, "
            f"{q(c['alarmSound'] or 'default')}, {text_array(jarr(c['requiredRoles']))}, "
            f"{q(c['audioRecordingEnabled'] == 'true')}, {CODE_ORDER.get(c['name'], 9)} "
            f"where not exists (select 1 from public.emergency_codes where org_id = {q(ORG)} and name = {q(c['name'])});")

    def loc_array(ids):
        refs = [loc(clinic_name[i]) for i in jarr(ids) if i in clinic_name]
        return "array[" + ",".join(refs) + "]::uuid[]" if refs else "'{}'::uuid[]"

    for c in clinics:
        if c["name"] not in SITE:
            continue
        aed = loc(clinic_name[c["aedSourceLocation"]]) if c.get("aedSourceLocation") in clinic_name else "null"
        cart = loc(clinic_name[c["crashCartSourceLocation"]]) if c.get("crashCartSourceLocation") in clinic_name else "null"
        out.append(
            "insert into public.emergency_site_settings (org_id, location_id, response_zone, mutual_aid_location_ids, "
            "connected_location_ids, refuge_for_location_ids, aed_source_location_id, crash_cart_source_location_id) "
            f"values ({q(ORG)}, {loc(c['name'])}, {q(c.get('responseZone'))}, {loc_array(c['mutualAidLocations'])}, "
            f"{loc_array(c['physicallyConnectedLocations'])}, {loc_array(c['refugeForLocations'])}, {aed}, {cart}) "
            "on conflict (org_id, location_id) do update set mutual_aid_location_ids = excluded.mutual_aid_location_ids, "
            "connected_location_ids = excluded.connected_location_ids, refuge_for_location_ids = excluded.refuge_for_location_ids, "
            "aed_source_location_id = excluded.aed_source_location_id, crash_cart_source_location_id = excluded.crash_cart_source_location_id;")

    # Responder profiles, one per employee.
    seen = set()
    for u in users:
        login = u["email"].lower()
        target = PERSON.get(login)
        if not target or (target in PROFILE_SOURCE and PROFILE_SOURCE[target] != login) or target in seen:
            continue
        seen.add(target)
        sched_sql = []
        for day, v in jobj(u["weeklySchedule"]).items():
            if v in ("remote", "off"):
                sched_sql.append(f"{q(day)}, {q(v)}")
            elif v in clinic_name:
                sched_sql.append(f"{q(day)}, {loc(clinic_name[v])}")
        sched_json = f"jsonb_strip_nulls(jsonb_build_object({', '.join(sched_sql)}))" if sched_sql else "'{}'::jsonb"
        seniority = u.get("seniority") or None
        out.append(
            "insert into public.emergency_responder_profiles (org_id, employee_id, user_id, full_name, emergency_role, phone, "
            "default_location_id, weekly_schedule, seniority, code_defaults, can_listen_audio, show_in_contacts, "
            "app_quiz_passed_at, sop_quiz_passed_at) "
            f"select {q(ORG)}, e.id, e.user_id, e.first_name || ' ' || e.last_name, {q(u['emergencyRole'])}, {q(u['phoneNumber'])}, "
            f"{site_ref(u['defaultClinicId'])}, {sched_json}, {seniority if seniority else 'null'}, "
            f"{q(json.dumps(jobj(u['codeDefaults'])))}::jsonb, {q(u['canListenToAudio'] == 'true')}, "
            f"{q(u['showInContacts'] != 'false')}, {q(u['appFunctionsQuizPassedAt'])}, {q(u['sopQuizPassedAt'])} "
            f"from public.employees e where e.org_id = {q(ORG)} and lower(e.email) = {q(target)} "
            "on conflict (org_id, employee_id) where employee_id is not null do nothing;")

    for r in rows(folder, "UserLocationRole"):
        target = hub_email(r["userId"])
        if not target or r["clinicId"] not in clinic_name:
            continue
        out.append(
            "insert into public.emergency_location_roles (org_id, employee_id, user_id, location_id, code_name, response_role, "
            "expected_assistance, notes) "
            f"select {q(ORG)}, e.id, e.user_id, {loc(clinic_name[r['clinicId']])}, {q(r['codeType'])}, {q(r['responseRole'])}, "
            f"{q(r['expectedAssistance'])}, {q(r['notes'])} from public.employees e "
            f"where e.org_id = {q(ORG)} and lower(e.email) = {q(target)} and not exists (select 1 from public.emergency_location_roles x "
            f"where x.org_id = {q(ORG)} and x.employee_id = e.id and x.location_id = {loc(clinic_name[r['clinicId']])} "
            f"and x.code_name = {q(r['codeType'])} and x.response_role = {q(r['responseRole'])});")

    # Remote triggers keep city/state only: incident history is visible to all
    # staff, and a remote trigger's street address is usually someone's home.
    code_name = {c["id"]: c["name"] for c in codes}
    for t in rows(folder, "CodeTrigger"):
        clips = [{"clipIndex": c.get("clipIndex", i), "recordedAt": c.get("recordedAt"), "heldBy": "Base44 (not yet moved)"}
                 for i, c in enumerate(jarr(t["audioClips"]))]
        name = t["codeName"] or code_name.get(t["codeId"], "Unknown code")
        target = hub_email(t["userId"])
        out.append(
            "insert into public.emergency_incidents (org_id, code_id, code_name, location_id, location_name, internal_location, "
            "notes, triggered_by, triggered_by_name, triggered_at, lat, lng, is_remote, remote_address, remote_city, remote_state, "
            "is_test, resolved, resolved_at, resolved_by_name, audio_clips, legacy_id) "
            f"select {q(ORG)}, (select id from public.emergency_codes where org_id = {q(ORG)} and name = {q(name)}), {q(name)}, "
            f"{loc(t['clinicName']) if t['clinicName'] in SITE else 'null'}, {q(SITE.get(t['clinicName'], t['clinicName']))}, "
            f"{q(t['internalLocation'])}, {q(t['notes'])}, {emp(target, 'user_id')}, {q(t['triggeredByName'])}, "
            f"{q(t['timestamp'] or t['created_date'])}, {t['latitude'] or 'null'}, {t['longitude'] or 'null'}, "
            f"{q(t['isRemoteTrigger'] == 'true')}, null, {q(t['remoteCity'])}, {q(t['remoteState'])}, "
            f"{q(t['isTest'] == 'true')}, {q(t['resolved'] == 'true')}, {q(t['resolvedAt'])}, {q(t['resolvedByName'])}, "
            f"{q(json.dumps(clips))}::jsonb, {q(t['id'])} "
            f"where not exists (select 1 from public.emergency_incidents where org_id = {q(ORG)} and legacy_id = {q(t['id'])});")

    for r in rows(folder, "EmergencyResponse"):
        target = hub_email(r["userId"])
        dist = jobj(r["distanceWarningShown"]).get("distanceMeters")
        name_sql = (f"(select first_name || ' ' || last_name from public.employees where org_id = {q(ORG)} and lower(email) = {q(target)} limit 1)"
                    if target else q(uid_email.get(r["userId"], "Unknown")))
        out.append(
            "insert into public.emergency_responses (org_id, incident_id, user_id, responder_name, responded_at, response_role, "
            "assistance_type, items_bringing, estimated_arrival, status, status_updates, message, is_remote, distance_meters, legacy_id) "
            f"select {q(ORG)}, i.id, {emp(target, 'user_id')}, {name_sql}, {q(r['timestamp'] or r['created_date'])}, "
            f"{q(r['responseRole'])}, {q(r['assistanceType'])}, {text_array(jarr(r['itemsBringing']))}, {q(r['estimatedArrival'])}, "
            f"{q(r['status'] or 'responding')}, {q(json.dumps(jarr(r['statusUpdates'])))}::jsonb, {q(r['message'])}, "
            f"{q(r['isRemoteResponse'] == 'true')}, {int(dist) if dist else 'null'}, {q(r['id'])} "
            f"from public.emergency_incidents i where i.org_id = {q(ORG)} and i.legacy_id = {q(r['triggerId'])} "
            f"and not exists (select 1 from public.emergency_responses where org_id = {q(ORG)} and legacy_id = {q(r['id'])});")

    for r in rows(folder, "AssistanceRequest"):
        target = hub_email(r["requestedById"])
        responders = [{"userId": x.get("userId", ""), "name": x.get("name", ""), "eta": x.get("eta"), "respondedAt": x.get("respondedAt")}
                      for x in jarr(r["responders"])]
        out.append(
            "insert into public.assistance_requests (org_id, requested_by, requested_by_name, location_id, location_name, "
            "assistance_type, urgency, notes, responders, resolved, resolved_at, resolved_by_name, legacy_id) "
            f"select {q(ORG)}, {emp(target, 'user_id')}, {q(r['requestedByName'])}, "
            f"{loc(r['clinicName']) if r['clinicName'] in SITE else 'null'}, {q(SITE.get(r['clinicName'], r['clinicName']))}, "
            f"{q(r['assistanceType'])}, {q(r['urgency'] or 'now')}, {q(r['notes'])}, {q(json.dumps(responders))}::jsonb, "
            f"{q(r['resolved'] == 'true')}, {q(r['resolvedAt'])}, {q(r['resolvedByName'])}, {q(r['id'])} "
            f"where not exists (select 1 from public.assistance_requests where org_id = {q(ORG)} and legacy_id = {q(r['id'])});")

    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
