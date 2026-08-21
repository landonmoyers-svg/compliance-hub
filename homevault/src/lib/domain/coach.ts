import { CATEGORIES, type Category } from "./categories";
import { expiryStatus, type RecordMeta } from "./records";

/**
 * The completeness coach — the household analog of the business app's guide.
 * Works entirely off non-secret metadata (no decryption), scoring how ready a
 * household is to hand over its "keys to the kingdom". See docs/ARCHITECTURE.md.
 */

export interface CategoryCoverage {
  category: Category;
  count: number;
  covered: boolean;
}

export interface CoachStep {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
}

export function categoryCoverage(records: RecordMeta[]): CategoryCoverage[] {
  return CATEGORIES.map((category) => {
    const count = records.filter((r) => r.category === category.key).length;
    return { category, count, covered: count > 0 };
  });
}

/** 0–100 completeness: weighted so critical categories matter most. */
export function completenessScore(records: RecordMeta[]): number {
  const weight = { critical: 3, high: 2, standard: 1 } as const;
  const coverage = categoryCoverage(records);
  const total = coverage.reduce((s, c) => s + weight[c.category.tier], 0);
  const got = coverage.reduce((s, c) => s + (c.covered ? weight[c.category.tier] : 0), 0);
  return Math.round((got / total) * 100);
}

/** Prioritized coaching steps: gaps in critical categories first, then expiries. */
export function coachSteps(records: RecordMeta[]): CoachStep[] {
  const steps: CoachStep[] = [];

  for (const c of categoryCoverage(records)) {
    if (!c.covered) {
      steps.push({
        id: `gap-${c.category.key}`,
        priority: c.category.tier === "critical" ? "high" : c.category.tier === "high" ? "medium" : "low",
        title: `Add your ${c.category.label.toLowerCase()}`,
        detail: `${c.category.blurb} Nothing here yet — your household can't hand this over if it isn't recorded.`,
      });
    }
  }

  const expiring = records.filter((r) => ["soon", "expired"].includes(expiryStatus(r)));
  for (const r of expiring) {
    const status = expiryStatus(r);
    steps.push({
      id: `expiry-${r.id}`,
      priority: status === "expired" ? "high" : "medium",
      title: `${status === "expired" ? "Renew (expired)" : "Renewing soon"}: ${r.label}`,
      detail: `Expires ${r.expiresOn}. Update the record once renewed so reminders stay accurate.`,
    });
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return steps.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
