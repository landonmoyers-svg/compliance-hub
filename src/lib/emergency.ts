import type { EmergencyPlan, EmergencyPlanType } from "./data/schema";
import { isExpired } from "./dates";

/**
 * The emergency scenarios a behavioral-health practice should hold a written
 * plan for, and why. Grounded in the CMS Emergency Preparedness Rule's core
 * elements (risk assessment, communication plan, policies/procedures, training/
 * testing), OSHA, and behavioral-health specifics (crisis, elopement, workplace
 * violence). "required" plans drive the gap analysis; others are recommended.
 */
export interface EmergencyPlanMeta {
  label: string;
  required: boolean;
  why: string;
}

export const EMERGENCY_PLAN_META: Record<EmergencyPlanType, EmergencyPlanMeta> = {
  fire: { label: "Fire & smoke", required: true, why: "Life-safety code; the most common facility evacuation cause." },
  severe_weather: { label: "Severe weather (tornado / storm)", required: true, why: "Shelter-in-place for wind/tornado warnings." },
  natural_disaster: { label: "Natural disaster (earthquake / flood)", required: true, why: "Utah seismic risk; regional flooding." },
  active_threat: { label: "Active threat / active shooter", required: true, why: "Run-Hide-Fight response and lockdown procedure." },
  workplace_violence: { label: "Workplace violence", required: true, why: "Behavioral-health settings carry elevated violence risk (OSHA guidance)." },
  medical_emergency: { label: "Medical emergency", required: true, why: "Cardiac/overdose/injury response, AED, EMS activation." },
  behavioral_crisis: { label: "Behavioral crisis / suicidal patient", required: true, why: "Psychiatric emergency, suicide risk, and de-escalation protocol." },
  elopement: { label: "Patient elopement / missing person", required: false, why: "A patient leaving against advice or going missing." },
  utility_failure: { label: "Utility / power failure", required: true, why: "Loss of power, heat, water, or HVAC; downtime procedures." },
  evacuation_shelter: { label: "Evacuation & shelter-in-place", required: true, why: "How and when to evacuate vs. shelter, with assembly points." },
  communication: { label: "Emergency communication plan", required: true, why: "CMS core element: staff, patient, and authority notification chain." },
  infectious_disease: { label: "Infectious disease / pandemic", required: true, why: "Outbreak response, exposure control, and continuity." },
  bomb_threat: { label: "Bomb threat", required: false, why: "Threat checklist and response." },
  cyber_incident: { label: "Cyber / IT outage (downtime)", required: false, why: "EHR/phone downtime and data-availability continuity." },
  other: { label: "Other", required: false, why: "Any additional scenario specific to this practice." },
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
