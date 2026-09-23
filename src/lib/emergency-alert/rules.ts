/**
 * Emergency Alert — the response rules LP Alert encoded, made data-driven.
 *
 * LP Alert hard-coded Lone Peak's layout by matching site NAMES ("clinic 2",
 * "admin"…). Here the same rules read from emergency_site_settings, which an
 * admin edits: mutual aid (who cross-responds), physically connected sites
 * (shared exposure for fire / threats), where the AED and crash cart live, and
 * which site is a refuge for which. Lone Peak's settings were imported from LP
 * Alert, so behaviour is unchanged — but a second practice can describe its own.
 *
 * Pure functions only (no React, no I/O) so they are unit-testable.
 */

import type {
  EmergencyCode,
  EmergencyIncident,
  EmergencyResponderProfile,
  EmergencySiteSettings,
  WorkLocation,
} from "@/lib/data/schema";

export type CodeKind = "medical" | "armed" | "behavioral" | "fire" | "other";

/** What kind of emergency a code is, from its name (Code Blue → medical …). */
export function codeKind(name: string | null | undefined): CodeKind {
  const n = (name ?? "").toLowerCase();
  if (n.includes("blue") || n.includes("medical")) return "medical";
  if (n.includes("silver") || n.includes("shooter") || n.includes("weapon")) return "armed";
  if (n.includes("gray") || n.includes("grey")) return "behavioral";
  if (n.includes("red") || n.includes("fire") || n.includes("smoke")) return "fire";
  return "other";
}

/** Threat codes where "the building next door is affected too" matters. */
export function isExposureCode(kind: CodeKind): boolean {
  return kind === "armed" || kind === "fire" || kind === "behavioral";
}

/** Codes where an admin directs evacuate / shelter in place. */
export function needsEvacuationControl(kind: CodeKind): boolean {
  return kind === "armed" || kind === "fire";
}

export type SiteMessageType = "zone" | "exposure" | "equipment" | "refuge";
export interface SiteMessage { type: SiteMessageType; text: string }

function nameOf(id: string | null | undefined, locations: WorkLocation[]): string {
  return locations.find((l) => l.id === id)?.name ?? "another site";
}

function settingsFor(locationId: string | null | undefined, settings: EmergencySiteSettings[]) {
  return settings.find((s) => s.locationId === locationId);
}

export interface EquipmentPlan {
  aed: { onSite: boolean; from: string | null } | null;
  crashCart: { onSite: boolean; from: string | null } | null;
}

/** Where to get the AED and crash cart for an incident at this site. */
export function equipmentPlan(
  locationId: string | null | undefined,
  settings: EmergencySiteSettings[],
  locations: WorkLocation[],
): EquipmentPlan {
  const s = settingsFor(locationId, settings);
  const one = (src: string | null | undefined) =>
    src ? { onSite: src === locationId, from: src === locationId ? null : nameOf(src, locations) } : null;
  return { aed: one(s?.aedSourceLocationId), crashCart: one(s?.crashCartSourceLocationId) };
}

/** Sites expected to cross-respond to an incident at `locationId`. */
export function mutualAidSites(locationId: string | null | undefined, settings: EmergencySiteSettings[]): string[] {
  return settingsFor(locationId, settings)?.mutualAidLocationIds ?? [];
}

/** Sites physically connected to `locationId` (share a wall / building). */
export function connectedSites(locationId: string | null | undefined, settings: EmergencySiteSettings[]): string[] {
  const s = settingsFor(locationId, settings);
  // Connection is symmetric even if only one side recorded it.
  const back = settings.filter((o) => o.connectedLocationIds.includes(locationId ?? "")).map((o) => o.locationId);
  return Array.from(new Set([...(s?.connectedLocationIds ?? []), ...back]));
}

/**
 * Refuges for someone at `originId` when evacuation is ordered for an
 * incident at `incidentId`: a site that lists the origin as one it shelters,
 * as long as the refuge is not the incident site or connected to it.
 */
export function refugeFor(
  originId: string | null | undefined,
  incidentId: string | null | undefined,
  settings: EmergencySiteSettings[],
  locations: WorkLocation[],
): string[] {
  if (!originId) return [];
  const exposed = new Set([incidentId ?? "", ...connectedSites(incidentId, settings)]);
  return settings
    .filter((s) => s.refugeForLocationIds.includes(originId) && s.locationId !== originId && !exposed.has(s.locationId))
    .map((s) => nameOf(s.locationId, locations));
}

/** Every site-relationship message that applies to an incident. */
export function siteContext(
  incident: Pick<EmergencyIncident, "locationId" | "codeName">,
  settings: EmergencySiteSettings[],
  locations: WorkLocation[],
): SiteMessage[] {
  const out: SiteMessage[] = [];
  const loc = incident.locationId;
  if (!loc) return out;
  const kind = codeKind(incident.codeName);
  const aid = mutualAidSites(loc, settings);

  if (aid.length > 0) {
    out.push({
      type: "zone",
      text: `Mutual response: ${aid.map((id) => nameOf(id, locations)).join(", ")} may assist if safe.`,
    });
  } else if (settingsFor(loc, settings)) {
    out.push({
      type: "zone",
      text: `${nameOf(loc, locations)} is a standalone response zone — other sites give remote support only.`,
    });
  }

  if (isExposureCode(kind)) {
    const linked = connectedSites(loc, settings);
    if (linked.length > 0) {
      out.push({
        type: "exposure",
        text: `Physically connected: ${linked.map((id) => nameOf(id, locations)).join(" and ")} — treat as affected too.`,
      });
    }
  }

  if (kind === "medical") {
    const eq = equipmentPlan(loc, settings, locations);
    const parts: string[] = [];
    if (eq.aed && !eq.aed.onSite) parts.push(`AED from ${eq.aed.from}`);
    if (eq.crashCart && !eq.crashCart.onSite) parts.push(`crash cart from ${eq.crashCart.from}`);
    if (parts.length) out.push({ type: "equipment", text: `Bring ${parts.join(" and ")}.` });
  }
  return out;
}

/* ------------------------------------------------------------- where am I */

export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export function isClockedInToday(p: EmergencyResponderProfile | null | undefined, now = new Date()): boolean {
  return !!(p?.clockedInLocationId && p.clockedInDate === todayISO(now));
}

/**
 * Where this person is today, for dispatch: today's clock-in override, else the
 * weekly schedule, else their default site. Returns a location id, "remote", or null.
 * ("off" on the schedule falls through to the default so the person still sees a site.)
 */
export function effectiveLocationId(p: EmergencyResponderProfile | null | undefined, now = new Date()): string | null {
  if (!p) return null;
  if (isClockedInToday(p, now)) return p.clockedInLocationId ?? null;
  const scheduled = p.weeklySchedule?.[DAY_KEYS[now.getDay()]];
  if (scheduled && scheduled !== "off") return scheduled;
  return p.defaultLocationId ?? null;
}

/* ------------------------------------------------------------- roles */

/** LP Alert's four always-needed response roles, and how a free-text role claims one. */
export const CORE_ROLES = [
  { key: "calling911", name: "Calling 911", match: (r: string) => r.includes("911") },
  { key: "medical", name: "Primary Medical", match: (r: string) => /medical|cpr|acls/i.test(r) },
  { key: "safety", name: "Primary Safety", match: (r: string) => /safety|de-?escalat/i.test(r) },
  { key: "inPerson", name: "In-person support", match: (r: string) => /support|staff|responder/i.test(r) },
] as const;

export type CoreRoleKey = (typeof CORE_ROLES)[number]["key"];

/** Which core roles are claimed, from responders' role + assistance text. */
export function claimedCoreRoles(responses: { responseRole?: string | null; assistanceType?: string | null; status?: string }[]): Set<CoreRoleKey> {
  const out = new Set<CoreRoleKey>();
  for (const r of responses) {
    if (r.status === "completed") continue;
    const text = `${r.responseRole ?? ""} ${r.assistanceType ?? ""}`;
    for (const role of CORE_ROLES) if (role.match(text)) out.add(role.key);
  }
  return out;
}

/** A core role is urgent (pulses red) when it's unclaimed and this code depends on it. */
export function isUrgentRole(key: CoreRoleKey, kind: CodeKind): boolean {
  return key === "calling911" || (kind === "medical" && key === "medical") || ((kind === "armed" || kind === "behavioral") && key === "safety");
}

/** A code's own required-role list, marked claimed when a responder's text names it. */
export function codeRoleStatus(code: EmergencyCode | undefined, responses: { responseRole?: string | null; assistanceType?: string | null; status?: string }[]) {
  const active = responses.filter((r) => r.status !== "completed");
  return (code?.requiredRoles ?? []).map((role) => ({
    role,
    claimedBy: active.filter((r) => {
      const t = `${r.responseRole ?? ""} ${r.assistanceType ?? ""}`.toLowerCase();
      return t.includes(role.toLowerCase());
    }).length,
  }));
}

/* ------------------------------------------------------------- response form */

export const ASSISTANCE_TYPES = [
  "Primary Medical",
  "Primary Safety",
  "Calling 911",
  "Coordinating with 911 & Emergency Responders",
  "General Support",
] as const;

const ITEMS: Record<CodeKind, string[]> = {
  medical: ["AED", "Crash Cart", "First Aid Kit", "Oxygen", "Stretcher", "Other"],
  armed: ["First Aid Kit", "Other"],
  behavioral: ["First Aid Kit", "Other"],
  fire: ["Fire Extinguisher", "First Aid Kit", "Other"],
  other: ["First Aid Kit", "Other"],
};
export function itemsFor(codeName: string): string[] {
  return ITEMS[codeKind(codeName)];
}

/** Two minutes' walk. Farther than this, a responder is asked to confirm or support remotely. */
export const ON_FOOT_METERS = 160;
/** A trigger farther than this from the chosen site is flagged as remote. */
export const REMOTE_TRIGGER_METERS = 500;

export const ASSISTANCE_OPTIONS = [
  "Patient support / extra hands",
  "Administrative / paperwork help",
  "Equipment issue",
  "Technology / computer issue",
  "Supply needed",
  "Coverage / staffing",
  "Other",
] as const;

/* ------------------------------------------------------------- display */

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

export function incidentPlace(i: Pick<EmergencyIncident, "locationName" | "isRemote" | "remoteCity" | "remoteState">): string {
  if (i.isRemote && !i.locationName) return `Remote — ${[i.remoteCity, i.remoteState].filter(Boolean).join(", ") || "location unknown"}`;
  return i.locationName ?? "Unknown site";
}

export function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}
