/**
 * Row mappers for the Emergency Alert tables (LP Alert rebuilt in the Hub).
 *
 * Each table is described ONCE as a list of [camelCase, snake_case, default]
 * fields, and both directions are generated from that list. That makes the
 * From/To parity bug (handoff gotcha #1 — a field read but never written)
 * impossible for these tables: a field is either in the list or it isn't.
 */

import type {
  AssistanceRequest,
  EmergencyAudioLog,
  EmergencyCode,
  EmergencyIncident,
  EmergencyLocationRole,
  EmergencyResponderProfile,
  EmergencyResponse,
  EmergencySiteSettings,
} from "./schema";

type Row = Record<string, unknown>;
/** [app field, db column, value used when the column is null] */
type Field<T> = readonly [keyof T & string, string, unknown?];

function mapper<T extends { id: string; createdDate: string }>(fields: readonly Field<T>[]) {
  const from = (r: Row): T => {
    const out: Row = { id: r.id, createdDate: r.created_date };
    for (const [key, col, dflt] of fields) {
      const v = r[col];
      out[key] = v === null || v === undefined ? (dflt ?? undefined) : v;
    }
    return out as T;
  };
  const to = (d: Partial<T>): Row => {
    const out: Row = {};
    for (const [key, col] of fields) {
      const v = (d as Row)[key];
      if (v !== undefined) out[col] = v;
    }
    return out;
  };
  return { from, to };
}

export const emergencyCodeMap = mapper<EmergencyCode>([
  ["name", "name"],
  ["description", "description"],
  ["priority", "priority", "HIGH PRIORITY"],
  ["colorHex", "color_hex", "#E53935"],
  ["alarmSound", "alarm_sound", "default"],
  ["requiredRoles", "required_roles", []],
  ["audioRecordingEnabled", "audio_recording_enabled", true],
  ["sortOrder", "sort_order", 0],
  ["active", "active", true],
]);

export const emergencySiteSettingsMap = mapper<EmergencySiteSettings>([
  ["locationId", "location_id"],
  ["responseZone", "response_zone"],
  ["mutualAidLocationIds", "mutual_aid_location_ids", []],
  ["connectedLocationIds", "connected_location_ids", []],
  ["refugeForLocationIds", "refuge_for_location_ids", []],
  ["aedSourceLocationId", "aed_source_location_id"],
  ["crashCartSourceLocationId", "crash_cart_source_location_id"],
]);

export const emergencyIncidentMap = mapper<EmergencyIncident>([
  ["codeId", "code_id"],
  ["codeName", "code_name"],
  ["locationId", "location_id"],
  ["locationName", "location_name"],
  ["internalLocation", "internal_location"],
  ["notes", "notes"],
  ["triggeredBy", "triggered_by"],
  ["triggeredByName", "triggered_by_name"],
  ["triggeredAt", "triggered_at"],
  ["lat", "lat"],
  ["lng", "lng"],
  ["isRemote", "is_remote", false],
  ["remoteAddress", "remote_address"],
  ["remoteCity", "remote_city"],
  ["remoteState", "remote_state"],
  ["isTest", "is_test", false],
  ["evacuationStatus", "evacuation_status", "pending"],
  ["threatLocationDetails", "threat_location_details"],
  ["resolved", "resolved", false],
  ["resolvedAt", "resolved_at"],
  ["resolvedByName", "resolved_by_name"],
  ["audioClips", "audio_clips", []],
  ["legacyId", "legacy_id"],
]);

export const emergencyResponseMap = mapper<EmergencyResponse>([
  ["incidentId", "incident_id"],
  ["userId", "user_id"],
  ["responderName", "responder_name"],
  ["respondedAt", "responded_at"],
  ["responseRole", "response_role"],
  ["assistanceType", "assistance_type"],
  ["itemsBringing", "items_bringing", []],
  ["estimatedArrival", "estimated_arrival"],
  ["status", "status", "responding"],
  ["statusUpdates", "status_updates", []],
  ["message", "message"],
  ["isRemote", "is_remote", false],
  ["distanceMeters", "distance_meters"],
  ["legacyId", "legacy_id"],
]);

export const assistanceRequestMap = mapper<AssistanceRequest>([
  ["requestedBy", "requested_by"],
  ["requestedByName", "requested_by_name"],
  ["locationId", "location_id"],
  ["locationName", "location_name"],
  ["assistanceType", "assistance_type"],
  ["urgency", "urgency", "now"],
  ["notes", "notes"],
  ["responders", "responders", []],
  ["resolved", "resolved", false],
  ["resolvedAt", "resolved_at"],
  ["resolvedByName", "resolved_by_name"],
  ["legacyId", "legacy_id"],
]);

export const emergencyResponderProfileMap = mapper<EmergencyResponderProfile>([
  ["employeeId", "employee_id"],
  ["userId", "user_id"],
  ["fullName", "full_name"],
  ["emergencyRole", "emergency_role"],
  ["phone", "phone"],
  ["defaultLocationId", "default_location_id"],
  ["clockedInLocationId", "clocked_in_location_id"],
  ["clockedInDate", "clocked_in_date"],
  ["weeklySchedule", "weekly_schedule", {}],
  ["seniority", "seniority"],
  ["codeDefaults", "code_defaults", {}],
  ["canListenAudio", "can_listen_audio", false],
  ["showInContacts", "show_in_contacts", true],
  ["appQuizPassedAt", "app_quiz_passed_at"],
  ["sopQuizPassedAt", "sop_quiz_passed_at"],
]);

export const emergencyLocationRoleMap = mapper<EmergencyLocationRole>([
  ["employeeId", "employee_id"],
  ["userId", "user_id"],
  ["locationId", "location_id"],
  ["codeName", "code_name"],
  ["responseRole", "response_role"],
  ["expectedAssistance", "expected_assistance"],
  ["notes", "notes"],
]);

export const emergencyAudioLogMap = mapper<EmergencyAudioLog>([
  ["incidentId", "incident_id"],
  ["incidentLabel", "incident_label"],
  ["action", "action"],
  ["performedBy", "performed_by"],
  ["performedByName", "performed_by_name"],
  ["performedByEmail", "performed_by_email"],
  ["clipIndex", "clip_index"],
  ["clipCount", "clip_count"],
  ["deviceLabel", "device_label"],
  ["details", "details"],
]);
