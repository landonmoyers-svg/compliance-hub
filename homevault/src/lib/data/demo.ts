import type { CategoryKey } from "../domain/categories";
import type { RecordMeta } from "../domain/records";
import type { HandoverPlan } from "../domain/handover";

/**
 * In-memory demo data for the scaffold. This is the DataClient's `DemoClient`
 * backing store (see docs/ARCHITECTURE.md "data seam"). It holds only NON-SECRET
 * metadata — the same shape the real server would see. No plaintext secrets and
 * no keys live here; the encrypted payloads are simulated as "sealed" in the UI.
 */

export interface DemoRecipient {
  id: string;
  name: string;
  role: "spouse" | "child" | "executor" | "trustee" | "attorney" | "friend";
  relationship: string;
  isMember: boolean;
  scopeTiers: Array<"critical" | "high" | "standard">;
}

export interface DemoMember {
  id: string;
  name: string;
  role: "owner" | "co_owner" | "viewer";
}

const now = "2026-08-21T12:00:00.000Z";

function meta(
  id: string,
  category: CategoryKey,
  tier: RecordMeta["tier"],
  label: string,
  kind: RecordMeta["kind"],
  hasLocation: boolean,
  expiresOn: string | null,
): RecordMeta {
  return {
    id,
    householdId: "demo-household",
    category,
    tier,
    label,
    kind,
    hasPhysicalLocation: hasLocation,
    expiresOn,
    createdAt: now,
    updatedAt: now,
  };
}

export const DEMO_RECORDS: RecordMeta[] = [
  meta("r-passport", "identity", "critical", "Passport — Alex", "both", true, "2027-03-14"),
  meta("r-birth", "identity", "critical", "Birth certificate — Alex", "physical", true, null),
  meta("r-ssn", "identity", "critical", "Social Security card — Alex", "physical", true, null),
  meta("r-checking", "financial", "critical", "Primary checking", "digital", false, null),
  meta("r-brokerage", "financial", "critical", "Brokerage account", "digital", false, null),
  meta("r-safedeposit", "financial", "critical", "Safe-deposit box", "physical", true, null),
  meta("r-will", "estate", "critical", "Last will & testament", "both", true, null),
  meta("r-trust", "estate", "critical", "Revocable living trust", "both", true, null),
  meta("r-poa", "estate", "critical", "Durable power of attorney", "both", true, null),
  meta("r-pwmgr", "accounts", "critical", "Password manager recovery kit", "physical", true, null),
  meta("r-email", "accounts", "critical", "Primary email login", "digital", false, null),
  meta("r-life", "insurance", "high", "Life insurance policy", "digital", false, "2026-11-01"),
  meta("r-home", "insurance", "high", "Homeowners policy", "digital", false, "2026-09-30"),
  meta("r-meds", "medical", "high", "Allergies & medications", "digital", false, null),
  meta("r-directive", "medical", "high", "Advance healthcare directive", "both", true, null),
  meta("r-deed", "property", "high", "Home deed", "physical", true, null),
  meta("r-firearms", "hazmat", "high", "Firearms & ammunition storage", "physical", true, null),
  meta("r-pool", "hazmat", "high", "Pool chemicals", "physical", true, null),
  meta("r-wifi", "household", "standard", "Wi-Fi network & password", "digital", false, null),
  meta("r-attorney", "contacts", "standard", "Estate attorney", "digital", false, null),
  meta("r-letter", "directives", "high", "Letter to my family", "both", true, null),
];

export const DEMO_MEMBERS: DemoMember[] = [
  { id: "m-owner", name: "Alex Rivera", role: "owner" },
  { id: "m-spouse", name: "Sam Rivera", role: "co_owner" },
];

export const DEMO_RECIPIENTS: DemoRecipient[] = [
  { id: "rc-spouse", name: "Sam Rivera", role: "spouse", relationship: "Spouse", isMember: true, scopeTiers: ["critical", "high", "standard"] },
  { id: "rc-child", name: "Jordan Rivera", role: "child", relationship: "Adult child", isMember: false, scopeTiers: ["high", "standard"] },
  { id: "rc-trustee", name: "M. Okafor, Esq.", role: "trustee", relationship: "Trustee / attorney", isMember: false, scopeTiers: ["critical", "high", "standard"] },
];

export const DEMO_PLANS: HandoverPlan[] = [
  {
    id: "plan-critical",
    householdId: "demo-household",
    tiers: ["critical"],
    triggers: [
      { kind: "legal_proof", reviewerHolders: ["rc-trustee"], requireVendorVerification: true },
      { kind: "dual_key", shareCount: 3, threshold: 2, requiredHolders: ["rc-trustee"] },
    ],
    combine: "all",
    graceDays: 14,
    recipientIds: ["rc-spouse", "rc-trustee"],
    state: "ARMED",
  },
  {
    id: "plan-practical",
    householdId: "demo-household",
    tiers: ["high", "standard"],
    triggers: [
      { kind: "inactivity", inactivityDays: 90, requireContactConfirmation: true },
      { kind: "dual_key", shareCount: 3, threshold: 2, requiredHolders: [] },
    ],
    combine: "any",
    graceDays: 30,
    recipientIds: ["rc-spouse", "rc-child"],
    state: "ARMED",
  },
];
