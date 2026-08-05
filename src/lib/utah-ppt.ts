// Utah business personal property tax (Publication 20) valuation for the clinical
// asset inventory. Utah taxes most tangible business personal property annually:
// the business files a signed statement, the county depreciates each item on the
// Tax Commission's "percent good" schedule, and taxes the result — unless it's
// exempt (supplies, inventory-for-resale, sub-$500 non-critical items, or the
// per-county aggregate is at/under the small-taxpayer threshold).
//
// SOURCE (authoritative): Utah State Tax Commission — Pub 20 (Rev. 2/26) and the
// "2026 Recommended Personal Property Valuation Schedules" (Admin Rule
// R884-24P-33), effective the 2026 assessment year. The Tax Commission updates
// the factors annually — bump SCHEDULE_YEAR and the factors each year. These are
// estimates that mirror the recommended schedules; the county assessor's figures
// govern.
//   https://tax.utah.gov/forms-pubs/pub-20/
//   https://files.tax.utah.gov/propertytax/personal-property/val_schedule_2026.pdf

export const SCHEDULE_YEAR = 2026;

/** ≤ this aggregate taxable FMV per taxpayer within a single county → exempt
 *  (must apply). UCA §59-2-1115, Rule R884-24P-68. $30,100 for 2026. */
export const PPT_COUNTY_EXEMPTION_CENTS = 30_100_00;

/** Items with acquisition cost below this AND "not critical" are exempt
 *  (UCA §59-2-1115). Used to suggest the exemption; the user confirms. */
export const PPT_SMALL_ITEM_CENTS = 500_00;

export const PPT_TAX_DUE = "May 15";
export const PPT_ASSESSMENT_DATE = "January 1";

export type PptClass = "class_12" | "class_8" | "class_5" | "class_3" | "class_1" | "class_16";
export type PptExempt = "exempt_supply" | "exempt_resale" | "exempt_small" | "exempt_other";
export type PptCategory = PptClass | PptExempt | "unclassified";

interface ClassDef {
  label: string;
  life: string;
  /** Percent-good (%) by year since acquisition: factors[0] = 1st year
   *  (acquired SCHEDULE_YEAR-1). The LAST factor is the residual, applied to
   *  that year "and prior" (older items never drop below it). */
  factors: number[];
  examples: string;
}

// 2026 Recommended Personal Property Valuation Schedules (verified from the PDF).
export const PPT_CLASSES: Record<PptClass, ClassDef> = {
  class_12: {
    label: "Class 12 — Computer hardware",
    life: "≈5-yr, 7% residual",
    factors: [62, 46, 21, 9, 7],
    examples: "computers, laptops, tablets, servers, monitors, networking gear",
  },
  class_8: {
    label: "Class 8 — Machinery & medical/dental equipment",
    life: "≈11-yr, 11% residual",
    factors: [97, 93, 89, 82, 74, 65, 54, 43, 33, 22, 11],
    examples: "medical/dental devices, exam tables & chairs, X-ray, sterilizers, microscopes, lab/clinical equipment",
  },
  class_5: {
    label: "Class 5 — Furniture & fixtures",
    life: "≈9-yr, 13% residual",
    factors: [96, 90, 83, 74, 64, 52, 39, 26, 13],
    examples: "office furniture, cabinets, fixtures, shelving",
  },
  class_3: {
    label: "Class 3 — Short-life equipment",
    life: "≈5-yr, 21% residual",
    factors: [90, 79, 59, 41, 21],
    examples: "shorter-life general equipment",
  },
  class_1: {
    label: "Class 1 — Short-life property",
    life: "≈3-yr, 12% residual",
    factors: [76, 47, 12],
    examples: "highly perishable/fungible property, canned software, uniforms, books",
  },
  class_16: {
    label: "Class 16 — Long-life property",
    life: "≈19-yr, 9% residual",
    factors: [97, 96, 94, 91, 90, 89, 85, 80, 73, 67, 59, 56, 54, 47, 40, 31, 25, 18, 9],
    examples: "long-lived equipment & fixtures",
  },
};

export const PPT_EXEMPT_LABELS: Record<PptExempt, string> = {
  exempt_supply: "Exempt — supplies",
  exempt_resale: "Exempt — inventory held for resale",
  exempt_small: "Exempt — under $500 & not critical",
  exempt_other: "Exempt — other",
};

export function pptCategoryLabel(cat: PptCategory): string {
  if (cat === "unclassified") return "Not classified";
  if (cat in PPT_EXEMPT_LABELS) return PPT_EXEMPT_LABELS[cat as PptExempt];
  return PPT_CLASSES[cat as PptClass].label;
}

export function isTaxableClass(cat: PptCategory): cat is PptClass {
  return cat in PPT_CLASSES;
}

/** Percent-good (0..1) for a class given acquisition year + assessment year.
 *  Property acquired IN the assessment year isn't on the roll yet → 0. */
export function percentGood(cls: PptClass, acquisitionYear: number, assessmentYear = SCHEDULE_YEAR): number {
  const f = PPT_CLASSES[cls].factors;
  const age = assessmentYear - acquisitionYear;
  if (age <= 0) return 0;
  return f[Math.min(age, f.length) - 1] / 100;
}

export interface PptItemInput {
  pptCategory?: string | null; // a PptCategory value, or unset/unknown
  acquisitionCostCents?: number | null;
  acquisitionYear?: number | null;
  removedFromInventory?: boolean;
}

export interface PptResult {
  taxable: boolean;
  reason: string;
  cls?: PptClass;
  percentGood?: number;
  fmvCents: number;
  needsInput: boolean; // classified taxable but missing cost/year
}

/** Pub 20 taxable value for one item (the item's own classification is authoritative). */
export function pptValue(item: PptItemInput, assessmentYear = SCHEDULE_YEAR): PptResult {
  if (item.removedFromInventory) return { taxable: false, reason: "Removed from inventory", fmvCents: 0, needsInput: false };
  const cat = item.pptCategory ?? "";
  if (cat === "" || cat === "unclassified") return { taxable: false, reason: "Not classified", fmvCents: 0, needsInput: true };
  if (cat in PPT_EXEMPT_LABELS) return { taxable: false, reason: PPT_EXEMPT_LABELS[cat as PptExempt], fmvCents: 0, needsInput: false };
  if (!(cat in PPT_CLASSES)) return { taxable: false, reason: "Not classified", fmvCents: 0, needsInput: true };

  const cls = cat as PptClass;
  const cost = item.acquisitionCostCents ?? 0;
  const yr = item.acquisitionYear ?? 0;
  if (!cost || !yr) {
    return { taxable: false, reason: "Missing acquisition cost/year", cls, fmvCents: 0, needsInput: true };
  }
  const pg = percentGood(cls, yr, assessmentYear);
  const fmv = Math.round(cost * pg);
  return {
    taxable: fmv > 0,
    reason: `${PPT_CLASSES[cls].label} · ${Math.round(pg * 100)}% good`,
    cls,
    percentGood: pg,
    fmvCents: fmv,
    needsInput: false,
  };
}

/** Suggest a category from an inventory item's type + cost (user confirms). */
export function suggestPptCategory(itemType: string | undefined, costCents?: number | null): PptCategory {
  if (costCents != null && costCents > 0 && costCents < PPT_SMALL_ITEM_CENTS) return "exempt_small";
  const t = (itemType ?? "").toLowerCase();
  if (/electronic|computer|laptop|tablet|monitor|server|network|printer|\bit\b/.test(t)) return "class_12";
  if (/medical|dental|clinical|diagnostic|device|instrument|equipment/.test(t)) return "class_8";
  if (/furniture|fixture|cabinet|desk|chair|shelv|couch|sofa/.test(t)) return "class_5";
  if (/supply|supplies|consumable/.test(t)) return "exempt_supply";
  return "unclassified";
}

export interface PptLocationSummary {
  locationId: string | null;
  taxableCents: number;
  taxableCount: number;
  exemptCount: number;
  needsInputCount: number;
  overThreshold: boolean; // aggregate taxable FMV over the per-county exemption
}

/** Aggregate a set of items per location (≈ per county) for the signed statement. */
export function summarizeByLocation<T extends PptItemInput & { locationId?: string | null }>(
  items: T[],
  assessmentYear = SCHEDULE_YEAR,
): PptLocationSummary[] {
  const m = new Map<string, PptLocationSummary>();
  for (const it of items) {
    const key = it.locationId ?? "__none__";
    let s = m.get(key);
    if (!s) {
      s = { locationId: it.locationId ?? null, taxableCents: 0, taxableCount: 0, exemptCount: 0, needsInputCount: 0, overThreshold: false };
      m.set(key, s);
    }
    const r = pptValue(it, assessmentYear);
    if (r.needsInput) s.needsInputCount++;
    else if (r.taxable) { s.taxableCents += r.fmvCents; s.taxableCount++; }
    else s.exemptCount++;
  }
  for (const s of m.values()) s.overThreshold = s.taxableCents > PPT_COUNTY_EXEMPTION_CENTS;
  return [...m.values()];
}
