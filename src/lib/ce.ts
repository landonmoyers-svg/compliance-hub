import type { CeRecord } from "./data/schema";
import { type ProviderType } from "./credential-requirements";
import { parseDate } from "./dates";

/**
 * Continuing-education (CE) targets by clinical role, for a rolling renewal
 * cycle. These are sensible Utah defaults — a starting point the practice should
 * verify against current board rules, not legal advice. Prescribers additionally
 * carry a pharmacology sub-requirement.
 */
export interface CeTarget {
  hours: number;
  pharmacologyHours?: number;
  cycleMonths: number;
  label: string;
  note: string;
}

export const CE_TARGETS: Record<ProviderType, CeTarget | null> = {
  np: { hours: 30, pharmacologyHours: 15, cycleMonths: 24, label: "APRN", note: "Utah APRN: 30 contact hours per 2-year cycle, including ≥15 pharmacology hours for prescriptive authority. Verify current board rules." },
  pa: { hours: 100, cycleMonths: 24, label: "PA", note: "NCCPA / Utah PA: 100 CME per 2-year cycle. Verify current board rules." },
  rn: { hours: 30, cycleMonths: 24, label: "RN", note: "Utah RN: 30 contact hours per 2-year cycle (or the practice-hours option). Verify current board rules." },
  therapist: { hours: 40, cycleMonths: 24, label: "Therapist", note: "Utah LCSW / CMHC: ~40 hours per 2-year cycle. Verify current board rules." },
  none: null,
};

const sumHours = (rs: CeRecord[]) => rs.reduce((n, r) => n + (r.hours || 0), 0);

export interface CeSummary {
  target: CeTarget | null;
  windowStart: Date | null;
  totalHours: number;
  pharmacologyHours: number;
  remaining: number;
  pct: number;
  pharmacologyMet: boolean;
}

/** Accumulate a person's CE hours within their current cycle window against the
 *  role target. Undated records are counted (better to over-credit than lose a
 *  logged hour); the UI nudges the user to date them. */
export function summarizeCe(records: CeRecord[], type: ProviderType, now: Date = new Date()): CeSummary {
  const target = CE_TARGETS[type];
  if (!target) {
    const total = sumHours(records);
    return { target: null, windowStart: null, totalHours: total, pharmacologyHours: 0, remaining: 0, pct: 100, pharmacologyMet: true };
  }
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - target.cycleMonths);
  const inWindow = records.filter((r) => {
    const d = parseDate(r.completedDate);
    return d ? d >= windowStart : true;
  });
  const totalHours = sumHours(inWindow);
  const pharmacologyHours = sumHours(inWindow.filter((r) => r.category === "pharmacology"));
  const remaining = Math.max(0, target.hours - totalHours);
  const pct = Math.min(100, Math.round((totalHours / target.hours) * 100));
  const pharmacologyMet = !target.pharmacologyHours || pharmacologyHours >= target.pharmacologyHours;
  return { target, windowStart, totalHours, pharmacologyHours, remaining, pct, pharmacologyMet };
}

export const CE_CATEGORY_LABEL: Record<CeRecord["category"], string> = {
  general: "General",
  pharmacology: "Pharmacology",
  ethics: "Ethics",
  controlled_substance: "Controlled substance",
  infection_control: "Infection control",
  other: "Other",
};
