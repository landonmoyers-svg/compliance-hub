import type { ComplianceDocument, EmergencyPlan, EmergencyPlanType } from "./data/schema";
import { isExpired } from "./dates";

/**
 * The emergency scenarios a behavioral-health practice should hold a written
 * plan for — with the rules/citations behind each and the specific elements a
 * complete plan must cover. Grounded in the CMS Emergency Preparedness Rule's
 * core elements (risk assessment, communication plan, policies/procedures,
 * training/testing), OSHA, HIPAA contingency (§164.308(a)(7)), and behavioral-
 * health specifics (crisis, elopement, workplace violence). "required" plans
 * drive the gap analysis; others are recommended. Citations are reference, not
 * legal advice.
 */
export interface EmergencyPlanMeta {
  label: string;
  required: boolean;
  why: string;
  citations: string[];
  requiredElements: string[];
  /** Keywords used to match existing SOP documents to this scenario. */
  keywords: string[];
}

export const EMERGENCY_PLAN_META: Record<EmergencyPlanType, EmergencyPlanMeta> = {
  fire: {
    label: "Fire & smoke", required: true, why: "Life-safety code; the most common facility evacuation cause.",
    citations: ["OSHA 29 CFR 1910.38 (Emergency Action Plan)", "NFPA 101 Life Safety Code"],
    requiredElements: ["Evacuation routes & exits", "Alarm/notification method", "Accounting for all staff & patients after evacuation", "Fire extinguisher locations & use", "Assembly point", "EMS/fire dept activation"],
    keywords: ["fire", "smoke", "evacuation", "emergency action plan", "eap"],
  },
  severe_weather: {
    label: "Severe weather (tornado / storm)", required: true, why: "Shelter-in-place for wind/tornado warnings.",
    citations: ["OSHA 29 CFR 1910.38", "CMS 42 CFR §483.73 (emergency prep)"],
    requiredElements: ["Warning monitoring (NWS/alerts)", "Shelter-in-place location", "Trigger to shelter vs. continue", "Patient & staff accounting", "All-clear procedure"],
    keywords: ["severe weather", "tornado", "storm", "shelter", "wind"],
  },
  natural_disaster: {
    label: "Natural disaster (earthquake / flood)", required: true, why: "Utah seismic risk; regional flooding.",
    citations: ["CMS 42 CFR §483.73", "FEMA guidance"],
    requiredElements: ["Immediate protective actions (drop/cover/hold)", "Facility damage assessment", "Evacuation vs. shelter decision", "Utility shutoff locations", "Continuity of care / relocation"],
    keywords: ["earthquake", "flood", "natural disaster", "seismic"],
  },
  active_threat: {
    label: "Active threat / active shooter", required: true, why: "Run-Hide-Fight response and lockdown procedure.",
    citations: ["DHS/CISA Active Shooter guidance", "OSHA General Duty Clause §5(a)(1)"],
    requiredElements: ["Run-Hide-Fight response", "Lockdown procedure & signal", "Covert alarm / duress phrase", "Law-enforcement notification (911)", "Reunification after all-clear"],
    keywords: ["active shooter", "active threat", "lockdown", "intruder", "run hide fight"],
  },
  workplace_violence: {
    label: "Workplace violence", required: true, why: "Behavioral-health settings carry elevated violence risk (OSHA guidance).",
    citations: ["OSHA 3148 (WPV in healthcare)", "OSHA General Duty Clause §5(a)(1)"],
    requiredElements: ["Threat/behavior risk assessment", "De-escalation protocol", "Panic/duress alerting", "Staffing & environment controls", "Post-incident reporting & support"],
    keywords: ["workplace violence", "aggression", "de-escalation", "duress", "panic"],
  },
  medical_emergency: {
    label: "Medical emergency", required: true, why: "Cardiac/overdose/injury response, AED, EMS activation.",
    citations: ["OSHA 29 CFR 1910.151 (medical & first aid)", "OSHA 1910.1030 (bloodborne)"],
    requiredElements: ["Recognize & call 911", "CPR/AED locations & trained staff", "Naloxone for overdose", "First-aid kit", "Bloodborne-pathogen precautions", "Documentation/incident report"],
    keywords: ["medical emergency", "aed", "cpr", "first aid", "overdose", "naloxone"],
  },
  behavioral_crisis: {
    label: "Behavioral crisis / suicidal patient", required: true, why: "Psychiatric emergency, suicide risk, and de-escalation protocol.",
    citations: ["CMS Conditions of Participation", "Joint Commission NPSG suicide-risk", "988 crisis line"],
    requiredElements: ["Suicide/violence risk screening", "De-escalation steps", "When to call 988 / mobile crisis / 911", "Means restriction / safety", "Transfer to higher level of care", "Documentation & follow-up"],
    keywords: ["suicide", "crisis", "behavioral", "psychiatric emergency", "de-escalation", "988"],
  },
  elopement: {
    label: "Patient elopement / missing person", required: false, why: "A patient leaving against advice or going missing.",
    citations: ["CMS Conditions of Participation", "Facility policy"],
    requiredElements: ["Immediate search procedure", "Risk-based escalation (minor/at-risk)", "Notification of contacts / authorities", "Documentation"],
    keywords: ["elopement", "missing", "wander", "left against advice", "ama"],
  },
  utility_failure: {
    label: "Utility / power failure", required: true, why: "Loss of power, heat, water, or HVAC; downtime procedures.",
    citations: ["CMS 42 CFR §483.73(b)", "HIPAA §164.308(a)(7) contingency"],
    requiredElements: ["Power/heat/water loss response", "Backup power / lighting", "EHR & phone downtime procedure", "Medication/refrigeration safety", "When to close/relocate"],
    keywords: ["power", "utility", "outage", "hvac", "water", "downtime"],
  },
  evacuation_shelter: {
    label: "Evacuation & shelter-in-place", required: true, why: "How and when to evacuate vs. shelter, with assembly points.",
    citations: ["OSHA 29 CFR 1910.38", "CMS 42 CFR §483.73"],
    requiredElements: ["Evacuate-vs-shelter decision criteria", "Primary & secondary routes", "Assembly points", "Accounting for everyone", "Assistance for mobility-impaired", "Return/all-clear"],
    keywords: ["evacuation", "shelter in place", "assembly", "egress"],
  },
  communication: {
    label: "Emergency communication plan", required: true, why: "CMS core element: staff, patient, and authority notification chain.",
    citations: ["CMS 42 CFR §483.73(c) (communication plan)"],
    requiredElements: ["Staff notification chain & contacts", "Patient/family notification", "Notifying authorities (911, health dept)", "Alternate communication (if phones down)", "Roles & spokesperson", "Contact list kept current"],
    keywords: ["communication", "notification", "call tree", "contact list"],
  },
  infectious_disease: {
    label: "Infectious disease / pandemic", required: true, why: "Outbreak response, exposure control, and continuity.",
    citations: ["OSHA 1910.1030 (bloodborne)", "CDC guidance", "CMS 42 CFR §483.73"],
    requiredElements: ["Screening & isolation", "PPE & supplies", "Exposure control plan", "Cleaning/disinfection", "Staff exposure & return-to-work", "Continuity (telehealth)"],
    keywords: ["infection", "infectious", "pandemic", "exposure control", "ppe", "outbreak", "covid"],
  },
  bomb_threat: {
    label: "Bomb threat", required: false, why: "Threat checklist and response.",
    citations: ["DHS/CISA Bomb Threat guidance"],
    requiredElements: ["Bomb-threat call checklist", "Evacuate vs. search decision", "Notify 911", "Do-not-use radios/cell near device", "All-clear by authorities"],
    keywords: ["bomb", "threat"],
  },
  cyber_incident: {
    label: "Cyber / IT outage (downtime)", required: false, why: "EHR/phone downtime and data-availability continuity.",
    citations: ["HIPAA §164.308(a)(7) contingency", "HIPAA §164.308(a)(6) incident response"],
    requiredElements: ["EHR/phone downtime procedure", "Paper fallback forms", "Data backup & restore", "Breach/incident escalation", "Vendor/MSP contacts"],
    keywords: ["cyber", "ransomware", "downtime", "it outage", "ehr down", "breach"],
  },
  other: {
    label: "Other", required: false, why: "Any additional scenario specific to this practice.",
    citations: [], requiredElements: [], keywords: [],
  },
};

export const REQUIRED_PLAN_TYPES: EmergencyPlanType[] =
  (Object.keys(EMERGENCY_PLAN_META) as EmergencyPlanType[]).filter((t) => EMERGENCY_PLAN_META[t].required);

export type PlanCoverageState = "missing" | "draft" | "needs_review" | "active";

export interface PlanCoverage {
  planType: EmergencyPlanType;
  label: string;
  required: boolean;
  why: string;
  state: PlanCoverageState;
  plan?: EmergencyPlan;
}

/** Coverage of every required plan type (plus any extra types the practice added),
 *  with each type's best existing plan and its state. Drives the gap checklist. */
export function planCoverage(plans: EmergencyPlan[]): PlanCoverage[] {
  const byType = new Map<EmergencyPlanType, EmergencyPlan[]>();
  for (const p of plans) {
    const arr = byType.get(p.planType);
    if (arr) arr.push(p); else byType.set(p.planType, [p]);
  }
  const extraTypes = [...byType.keys()].filter((t) => !EMERGENCY_PLAN_META[t]?.required);
  const types: EmergencyPlanType[] = [...REQUIRED_PLAN_TYPES, ...extraTypes.filter((t) => t !== "other" || byType.has("other"))];

  return types.map((planType) => {
    const meta = EMERGENCY_PLAN_META[planType];
    const list = byType.get(planType) ?? [];
    // Prefer an active plan, else the most recently created.
    const best = list.slice().sort((a, b) => (b.createdDate ?? "").localeCompare(a.createdDate ?? ""))
      .sort((a, b) => (a.status === "active" ? -1 : 0) - (b.status === "active" ? -1 : 0))[0];
    let state: PlanCoverageState = "missing";
    if (best) {
      const stale = best.reviewDate ? isExpired(best.reviewDate) : false;
      state = stale ? "needs_review" : best.status === "active" ? "active" : best.status === "needs_review" ? "needs_review" : "draft";
    }
    return { planType, label: meta.label, required: meta.required, why: meta.why, state, plan: best };
  });
}

export interface CoverageSummary { total: number; ready: number; missing: number; needsWork: number; pct: number; }

export function coverageSummary(cov: PlanCoverage[]): CoverageSummary {
  const required = cov.filter((c) => c.required);
  const ready = required.filter((c) => c.state === "active").length;
  const missing = required.filter((c) => c.state === "missing").length;
  const needsWork = required.filter((c) => c.state === "draft" || c.state === "needs_review").length;
  const total = required.length;
  return { total, ready, missing, needsWork, pct: total ? Math.round((ready / total) * 100) : 0 };
}

/* ------------------------- SOP linkage & gap analysis ------------------------- */

type SopDoc = Pick<ComplianceDocument, "id" | "title" | "documentType" | "summary" | "content" | "status" | "reviewDate">;

function docMatches(doc: SopDoc, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const hay = `${doc.title} ${doc.summary ?? ""} ${(doc.content ?? "").slice(0, 4000)}`.toLowerCase();
  return keywords.some((k) => hay.includes(k.toLowerCase()));
}

const isPolicyDoc = (d: SopDoc) => ["policy", "sop", "procedure", "plan"].includes((d.documentType ?? "").toLowerCase());

/** Existing SOP documents relevant to a plan scenario (keyword match). */
export function relatedSops<T extends SopDoc>(planType: EmergencyPlanType, docs: T[]): T[] {
  const kw = EMERGENCY_PLAN_META[planType]?.keywords ?? [];
  return docs.filter((d) => isPolicyDoc(d) && docMatches(d, kw));
}

/** The SOP/policy documents an emergency program should maintain, with the rule
 *  behind each — the basis for "which SOPs are missing or need updating". */
export interface RequiredSop { key: string; name: string; citation: string; keywords: string[]; }

export const REQUIRED_EMERGENCY_SOPS: RequiredSop[] = [
  { key: "eap", name: "Emergency Action Plan (EAP)", citation: "OSHA 29 CFR 1910.38", keywords: ["emergency action plan", "eap", "evacuation"] },
  { key: "fire", name: "Fire Safety & Evacuation Policy", citation: "OSHA 1910.38 / NFPA 101", keywords: ["fire", "smoke", "evacuation"] },
  { key: "severe_weather", name: "Severe Weather / Shelter-in-Place Policy", citation: "CMS 42 CFR §483.73", keywords: ["severe weather", "tornado", "shelter"] },
  { key: "active_threat", name: "Active Threat / Lockdown Policy", citation: "DHS/CISA; OSHA §5(a)(1)", keywords: ["active shooter", "active threat", "lockdown"] },
  { key: "wpv", name: "Workplace Violence Prevention Policy", citation: "OSHA 3148; §5(a)(1)", keywords: ["workplace violence", "de-escalation", "duress"] },
  { key: "medical", name: "Medical Emergency & First Aid Policy", citation: "OSHA 29 CFR 1910.151", keywords: ["medical emergency", "aed", "cpr", "first aid", "naloxone"] },
  { key: "behavioral", name: "Behavioral Crisis / Suicide-Risk Policy", citation: "Joint Commission NPSG; 988", keywords: ["suicide", "crisis", "988", "de-escalation"] },
  { key: "infection", name: "Infection / Exposure Control Plan", citation: "OSHA 1910.1030; CDC", keywords: ["infection", "exposure control", "bloodborne", "ppe"] },
  { key: "communication", name: "Emergency Communication Plan", citation: "CMS 42 CFR §483.73(c)", keywords: ["emergency communication", "call tree", "notification"] },
  { key: "continuity", name: "Contingency / Business-Continuity & Downtime Plan", citation: "HIPAA §164.308(a)(7)", keywords: ["contingency", "business continuity", "downtime", "disaster recovery", "backup"] },
];

export type SopState = "present" | "stale" | "missing";
export interface SopGap { sop: RequiredSop; state: SopState; doc?: SopDoc; }

/** Which required emergency SOPs exist, are stale (past review), or are missing. */
export function emergencySopGaps<T extends SopDoc>(docs: T[]): (SopGap & { doc?: T })[] {
  return REQUIRED_EMERGENCY_SOPS.map((sop) => {
    const matches = docs.filter((d) => isPolicyDoc(d) && docMatches(d, sop.keywords));
    const best = matches.find((d) => (d.status ?? "").toLowerCase() === "active") ?? matches[0];
    if (!best) return { sop, state: "missing" as const };
    const stale = best.reviewDate ? isExpired(best.reviewDate) : false;
    return { sop, state: stale ? ("stale" as const) : ("present" as const), doc: best };
  });
}
