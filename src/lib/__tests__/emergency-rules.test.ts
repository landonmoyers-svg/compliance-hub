import {
  codeKind, siteContext, equipmentPlan, refugeFor, connectedSites, effectiveLocationId, isClockedInToday,
  claimedCoreRoles, codeRoleStatus, isUrgentRole, todayISO,
} from "../emergency-alert/rules";
import type { EmergencyCode, EmergencyResponderProfile, EmergencySiteSettings, WorkLocation } from "../data/schema";

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

// Lone Peak's layout, as imported from LP Alert.
const loc = (id: string, name: string) => ({ id, createdDate: "", name, type: "clinic", active: true } as WorkLocation);
const C1 = "c1", C2 = "c2", ADMIN = "adm", LEHI = "lehi";
const locations = [loc(C1, "Murray Clinic 1"), loc(C2, "Murray Clinic 2"), loc(ADMIN, "Murray Admin Building"), loc(LEHI, "Lehi Clinic")];
const s = (locationId: string, p: Partial<EmergencySiteSettings>): EmergencySiteSettings =>
  ({ id: locationId, createdDate: "", locationId, mutualAidLocationIds: [], connectedLocationIds: [], refugeForLocationIds: [], ...p });
const settings = [
  s(C1, { mutualAidLocationIds: [C2, ADMIN], connectedLocationIds: [ADMIN, C2], refugeForLocationIds: [C2, ADMIN], aedSourceLocationId: C2, crashCartSourceLocationId: C2 }),
  s(C2, { mutualAidLocationIds: [C1, ADMIN], connectedLocationIds: [ADMIN], refugeForLocationIds: [C1], aedSourceLocationId: C2, crashCartSourceLocationId: C2 }),
  s(ADMIN, { mutualAidLocationIds: [C1, C2], connectedLocationIds: [C2], refugeForLocationIds: [C1], aedSourceLocationId: C2, crashCartSourceLocationId: C2 }),
  s(LEHI, {}),
];

// Code classification
chk("Code Blue is medical", codeKind("Code Blue"), "medical");
chk("Code Silver is armed", codeKind("Code Silver"), "armed");
chk("Code Gray is behavioral", codeKind("Code Gray"), "behavioral");
chk("Code Red is fire", codeKind("Code Red"), "fire");
chk("unknown code", codeKind("Code Pink"), "other");

// Equipment: Clinic 1 fetches from Clinic 2; Clinic 2 has it on site; Lehi has nothing configured
chk("C1 AED from Clinic 2", equipmentPlan(C1, settings, locations).aed, { onSite: false, from: "Murray Clinic 2" });
chk("C2 AED on site", equipmentPlan(C2, settings, locations).aed, { onSite: true, from: null });
chk("Lehi no equipment info", equipmentPlan(LEHI, settings, locations), { aed: null, crashCart: null });

// Site messages
const blueC1 = siteContext({ locationId: C1, codeName: "Code Blue" }, settings, locations);
chk("Code Blue @C1 mentions mutual response", blueC1.some((m) => m.type === "zone" && m.text.includes("Murray Clinic 2")), true);
chk("Code Blue @C1 says bring AED from C2", blueC1.find((m) => m.type === "equipment")?.text, "Bring AED from Murray Clinic 2 and crash cart from Murray Clinic 2.");
chk("Code Blue @C2 no equipment message (on site)", siteContext({ locationId: C2, codeName: "Code Blue" }, settings, locations).some((m) => m.type === "equipment"), false);
const lehi = siteContext({ locationId: LEHI, codeName: "Code Red" }, settings, locations);
chk("Lehi is a standalone zone", lehi[0]?.text.includes("standalone"), true);
chk("Lehi fire: no shared exposure", lehi.some((m) => m.type === "exposure"), false);
chk("Silver @Admin exposes Clinic 2", siteContext({ locationId: ADMIN, codeName: "Code Silver" }, settings, locations).find((m) => m.type === "exposure")?.text.includes("Murray Clinic 2"), true);
chk("Blue @Admin: no exposure message", siteContext({ locationId: ADMIN, codeName: "Code Blue" }, settings, locations).some((m) => m.type === "exposure"), false);

// Connection is symmetric even if only one side recorded it
chk("connection symmetric", connectedSites(C2, [s(C1, { connectedLocationIds: [C2] }), s(C2, {})]).includes(C1), true);

// Refuge: Admin shelters Clinic 1 — but not when the threat is in Admin or its connected Clinic 2
chk("C1 staff, fire at Lehi -> Clinic 2 and Admin", refugeFor(C1, LEHI, settings, locations), ["Murray Clinic 2", "Murray Admin Building"]);
chk("C1 staff, fire at Admin -> neither (C2 is connected to Admin)", refugeFor(C1, ADMIN, settings, locations), []);
chk("C1 staff, fire at C2 -> neither (Admin is connected to C2)", refugeFor(C1, C2, settings, locations), []);
chk("Lehi staff -> no refuge configured", refugeFor(LEHI, C1, settings, locations), []);

// Where am I today: clock-in > weekly schedule > default
const monday = new Date("2026-09-21T15:00:00"); // a Monday
const prof = (p: Partial<EmergencyResponderProfile>) =>
  ({ id: "p", createdDate: "", weeklySchedule: {}, codeDefaults: {}, canListenAudio: false, showInContacts: true, ...p } as EmergencyResponderProfile);
chk("default only", effectiveLocationId(prof({ defaultLocationId: ADMIN }), monday), ADMIN);
chk("schedule beats default", effectiveLocationId(prof({ defaultLocationId: ADMIN, weeklySchedule: { monday: LEHI } }), monday), LEHI);
chk("'off' falls back to default", effectiveLocationId(prof({ defaultLocationId: ADMIN, weeklySchedule: { monday: "off" } }), monday), ADMIN);
chk("today's clock-in beats schedule", effectiveLocationId(prof({ weeklySchedule: { monday: LEHI }, clockedInLocationId: C1, clockedInDate: todayISO(monday) }), monday), C1);
chk("yesterday's clock-in is ignored", isClockedInToday(prof({ clockedInLocationId: C1, clockedInDate: "2026-09-20" }), monday), false);
chk("no profile", effectiveLocationId(null, monday), null);

// Roles
const claimed = claimedCoreRoles([
  { responseRole: "General Support", assistanceType: "Calling 911" },
  { responseRole: "Primary Medical Responder", assistanceType: "Primary Medical" },
  { responseRole: "Primary Safety", status: "completed" }, // finished — no longer covering
]);
chk("911 claimed", claimed.has("calling911"), true);
chk("medical claimed", claimed.has("medical"), true);
chk("completed responder doesn't cover safety", claimed.has("safety"), false);
chk("911 always urgent", isUrgentRole("calling911", "fire"), true);
chk("medical urgent for Code Blue", isUrgentRole("medical", "medical"), true);
chk("medical not urgent for fire", isUrgentRole("medical", "fire"), false);
const code = { requiredRoles: ["Calling 911", "Incident Commander"] } as EmergencyCode;
chk("code role status", codeRoleStatus(code, [{ assistanceType: "Calling 911" }]).map((r) => r.claimedBy), [1, 0]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
