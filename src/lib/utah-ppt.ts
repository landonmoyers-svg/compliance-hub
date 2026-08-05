// Utah business personal property tax (Publication 20) valuation for the clinical
// asset inventory. Utah taxes most tangible business personal property annually:
// the business files a signed statement, the county depreciates each item on the
// Tax Commission's "percent good" schedule, and taxes the result — unless it's
// exempt (supplies, inventory-for-resale, sub-$500 non-critical items, or the
// per-county aggregate is at/under the small-taxpayer threshold). Registered
// vehicles are exempt from the property-tax statement and instead pay a DMV
// uniform or age-based fee.
//
// SOURCE (authoritative): Utah State Tax Commission — Pub 20 and the "2026
// Recommended Personal Property Valuation Schedules" (Admin Rule R884-24P-33),
// effective the 2026 assessment year. Every class below (and every factor) is
// transcribed from that schedule. The Tax Commission updates the factors
// annually — bump SCHEDULE_YEAR and the factors each year. These are estimates
// that mirror the recommended schedules; the county assessor's figures govern.
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

// Ad valorem depreciation classes (cost × percent-good → taxable value, counts
// toward the county roll and the small-taxpayer exemption).
export type PptClass =
  | "class_1" | "class_2" | "class_3" | "class_5" | "class_8" | "class_10"
  | "class_12" | "class_13" | "class_15" | "class_16" | "class_20"
  | "class_24" | "class_25" | "class_27" | "class_29";

// Registered vehicles/vessels/aircraft: exempt from the property-tax statement,
// pay a DMV uniform (1.5% of value) or flat age-based fee instead.
export type PptRegistered =
  | "class_6" | "class_9" | "class_9a" | "class_9b" | "class_11" | "class_14"
  | "class_17" | "class_17a" | "class_18" | "class_18a" | "class_21"
  | "class_21a" | "class_22" | "class_22a" | "class_23" | "class_26";

// Special/partial: residential-rental personal property (assessor applies a 55%
// residential exemption to the Class 5/8 factor).
export type PptSpecial = "class_45";

export type PptExempt =
  | "exempt_supply" | "exempt_resale" | "exempt_small" | "exempt_farm"
  | "exempt_livestock" | "exempt_irrigation" | "exempt_household" | "exempt_other";

export type PptCategory = PptClass | PptRegistered | PptSpecial | PptExempt | "unclassified";

interface ClassDef {
  label: string;
  life: string;
  /** Percent-good (%) by year since acquisition: factors[0] = 1st year
   *  (acquired SCHEDULE_YEAR-1). The LAST factor is the residual, applied to
   *  that year "and prior" (older items never drop below it). */
  factors: number[];
  examples: string;
}

// 2026 Recommended Personal Property Valuation Schedules — ad valorem classes,
// every factor transcribed from the official schedule (Table 1 + per-class pages).
export const PPT_CLASSES: Record<PptClass, ClassDef> = {
  class_1: {
    label: "Class 1 — Short-life property",
    life: "≈3-yr, 12% residual",
    factors: [76, 47, 12],
    examples: "canned software, uniforms, books/library, patterns/jigs/dies, linens, silverware, pallets",
  },
  class_2: {
    label: "Class 2 — Computer-integrated machinery",
    life: "≈8-yr",
    factors: [96, 89, 79, 68, 56, 43, 29, 14],
    examples: "CT scanners, MRI units, mammography, computer-driven mills/lathes (machine + computer as one unit)",
  },
  class_3: {
    label: "Class 3 — Short-life trade fixtures",
    life: "≈5-yr, 21% residual",
    factors: [90, 79, 59, 41, 21],
    examples: "alarm systems, phone systems, office machines, cameras, cash registers, drones, sound systems",
  },
  class_5: {
    label: "Class 5 — Furniture & fixtures (long-life)",
    life: "≈9-yr, 13% residual",
    factors: [96, 90, 83, 74, 64, 52, 39, 26, 13],
    examples: "office furniture, cabinets & shelves, tables/chairs, movable partitions, signs, displays",
  },
  class_8: {
    label: "Class 8 — Machinery & medical/dental equipment",
    life: "≈11-yr, 11% residual",
    factors: [97, 93, 89, 82, 74, 65, 54, 43, 33, 22, 11],
    examples: "medical/dental devices & instruments, exam tables & chairs, X-ray, sterilizers, microscopes, lab equipment",
  },
  class_10: {
    label: "Class 10 — Railroad cars",
    life: "≈14-yr, 10% residual",
    factors: [97, 95, 93, 90, 85, 78, 69, 61, 53, 44, 36, 28, 19, 10],
    examples: "all types of railroad cars",
  },
  class_12: {
    label: "Class 12 — Computer hardware",
    life: "≈5-yr, 7% residual",
    factors: [62, 46, 21, 9, 7],
    examples: "computers, laptops, tablets, servers, monitors, networking gear, copiers/fax/scanner combos",
  },
  class_13: {
    label: "Class 13 — Heavy equipment",
    life: "≈14-yr, 39% residual",
    factors: [75, 72, 69, 67, 64, 61, 58, 55, 53, 50, 47, 44, 41, 39],
    examples: "construction/forestry/quarry machinery: backhoes, loaders, excavators, graders, pavers",
  },
  class_15: {
    label: "Class 15 — Semiconductor manufacturing equipment",
    life: "≈5-yr, 6% residual",
    factors: [47, 34, 24, 15, 6],
    examples: "clean-room, crystal-growing, wafer/photo-mask, semiconductor test equipment",
  },
  class_16: {
    label: "Class 16 — Long-life property",
    life: "≈19-yr, 9% residual",
    factors: [97, 96, 94, 91, 90, 89, 85, 80, 73, 67, 59, 56, 54, 47, 40, 31, 25, 18, 9],
    examples: "solar panels, towers, pipelines, buried cable, bulk tanks, storage containers, truck scales",
  },
  class_20: {
    label: "Class 20 — Petroleum & natural-gas equipment",
    life: "≈13-yr, 11% residual",
    factors: [97, 95, 93, 91, 85, 78, 69, 58, 49, 40, 30, 21, 11],
    examples: "oil & gas exploration/production: drill rigs, wellheads, compressors, separators, pumping units",
  },
  class_24: {
    label: "Class 24 — Leasehold improvements on tax-exempt real property",
    life: "≈12-yr, 30% residual",
    factors: [94, 88, 82, 77, 71, 65, 59, 54, 48, 42, 36, 30],
    examples: "tenant improvements when the landlord is property-tax exempt: walls, ceilings, HVAC, wiring, storefronts",
  },
  class_25: {
    label: "Class 25 — Aircraft manufacturing tools & dies",
    life: "≈6-yr, 4% residual",
    factors: [91, 79, 60, 42, 23, 4],
    examples: "jigs, dies, molds, patterns used exclusively to make aircraft parts",
  },
  class_27: {
    label: "Class 27 — Electrical power-generating equipment & fixtures",
    life: "≈35-yr, 9% residual",
    factors: [97, 95, 92, 90, 87, 84, 82, 79, 77, 74, 71, 69, 66, 64, 61, 58, 56, 53, 51, 48, 45, 43, 40, 38, 35, 32, 30, 27, 25, 22, 19, 17, 14, 12, 9],
    examples: "turbogenerators, boiler-plant equipment & piping, cooling towers, support electrical plant",
  },
  class_29: {
    label: "Class 29 — Pollution-control equipment",
    life: "≈5-yr, 6% residual",
    factors: [80, 60, 40, 20, 6],
    examples: "air/water pollution control used with a petroleum refinery (NAICS 324110)",
  },
};

interface RegDef {
  label: string;
  /** Short description of the fee treatment for the item dialog / worksheet. */
  fee: string;
  examples: string;
}

// Registered vehicles/vessels/aircraft — EXEMPT from the property-tax signed
// statement; pay a DMV uniform fee (1.5% of value) or a flat age-based fee.
// Included so every Pub 20 class is selectable, but excluded from the taxable roll.
export const PPT_REGISTERED: Record<PptRegistered, RegDef> = {
  class_6:   { label: "Class 6 — Heavy & medium-duty trucks", fee: "1.5% uniform fee of value (min $1,750 residual)", examples: "heavy/medium trucks, crane vehicles, concrete pump trucks" },
  class_9:   { label: "Class 9 — Off-highway recreational vehicles", fee: "age-based fee $4–$18", examples: "ATVs, dune buggies, dirt/trail motorcycles" },
  class_9a:  { label: "Class 9a — Street-legal ATVs", fee: "age-based fee $4–$38", examples: "street-legal ATVs" },
  class_9b:  { label: "Class 9b — Snowmobiles", fee: "age-based fee $10–$45", examples: "snowmobiles" },
  class_11:  { label: "Class 11 — Street motorcycles", fee: "age-based fee $10–$95", examples: "street motorcycles, scooters, mopeds" },
  class_14:  { label: "Class 14 — Motor homes", fee: "age-based fee $90–$690", examples: "motor homes" },
  class_17:  { label: "Class 17 — Vessels 31 ft & longer", fee: "1.5% uniform fee of value", examples: "yachts, houseboats, large sloops" },
  class_17a: { label: "Class 17a — Vessels under 31 ft", fee: "age-based / $5 flat fee", examples: "smaller boats, canoes, jon boats" },
  class_18:  { label: "Class 18 — Travel trailers", fee: "age-based fee $20–$175", examples: "bumper-pull & 5th-wheel travel trailers" },
  class_18a: { label: "Class 18a — Tent trailers & truck campers", fee: "age-based fee $10–$70", examples: "tent trailers, truck campers" },
  class_21:  { label: "Class 21 — Commercial trailers", fee: "1.5% uniform fee of value (min $1,000 residual)", examples: "dry-van, flatbed, reefer, dump, tank trailers" },
  class_21a: { label: "Class 21a — Other (non-commercial) trailers", fee: "age-based fee $10–$30", examples: "utility, cargo, horse, boat trailers" },
  class_22:  { label: "Class 22 — Passenger vehicles", fee: "age-based fee $10–$150", examples: "cars, SUVs, vans, light-duty trucks" },
  class_22a: { label: "Class 22a — Small motor vehicles", fee: "age-based fee $10–$25", examples: "≤5 hp / ≤150 cc vehicles" },
  class_23:  { label: "Class 23 — Aircraft", fee: "$25 uniform fee + 0.4% registration", examples: "FAA-registered civil/commercial aircraft" },
  class_26:  { label: "Class 26 — Personal watercraft", fee: "age-based fee $10–$55", examples: "personal watercraft, jet skis" },
};

// Class 45 — special qualifying primary-residential rental personal property.
export const PPT_SPECIAL: Record<PptSpecial, { label: string; note: string }> = {
  class_45: {
    label: "Class 45 — Residential-rental furnishings (55% exemption)",
    note: "Household furnishings/equipment used exclusively in a tenant's primary residence — the assessor applies a 55% residential exemption to the Class 5/8 percent-good. Enter the county-assessed value directly.",
  },
};

export const PPT_EXEMPT_LABELS: Record<PptExempt, string> = {
  exempt_supply: "Exempt — supplies (office/shipping/maintenance, consumables)",
  exempt_resale: "Exempt — inventory held for resale",
  exempt_small: "Exempt — under $500 & not critical",
  exempt_farm: "Exempt — farm machinery & equipment",
  exempt_livestock: "Exempt — livestock",
  exempt_irrigation: "Exempt — property used for irrigation",
  exempt_household: "Exempt — household furnishings",
  exempt_other: "Exempt — other",
};

export function pptCategoryLabel(cat: PptCategory): string {
  if (cat === "unclassified") return "Not classified";
  if (cat in PPT_EXEMPT_LABELS) return PPT_EXEMPT_LABELS[cat as PptExempt];
  if (cat in PPT_REGISTERED) return PPT_REGISTERED[cat as PptRegistered].label;
  if (cat in PPT_SPECIAL) return PPT_SPECIAL[cat as PptSpecial].label;
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
  registered?: boolean; // registered vehicle (DMV fee), not on the statement
}

/** Pub 20 taxable value for one item (the item's own classification is authoritative). */
export function pptValue(item: PptItemInput, assessmentYear = SCHEDULE_YEAR): PptResult {
  if (item.removedFromInventory) return { taxable: false, reason: "Removed from inventory", fmvCents: 0, needsInput: false };
  const cat = item.pptCategory ?? "";
  if (cat === "" || cat === "unclassified") return { taxable: false, reason: "Not classified", fmvCents: 0, needsInput: true };
  if (cat in PPT_EXEMPT_LABELS) return { taxable: false, reason: PPT_EXEMPT_LABELS[cat as PptExempt], fmvCents: 0, needsInput: false };
  if (cat in PPT_REGISTERED) {
    const r = PPT_REGISTERED[cat as PptRegistered];
    return { taxable: false, reason: `Registered vehicle — ${r.fee}; not on the property-tax statement`, fmvCents: 0, needsInput: false, registered: true };
  }
  if (cat in PPT_SPECIAL) return { taxable: false, reason: "Residential-rental (Class 45) — county applies the 55% residential exemption", fmvCents: 0, needsInput: false };
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
  if (/vehicle|truck|\bcar\b|van|trailer|motorcycle|atv|boat|vessel|aircraft|snowmobile/.test(t)) return "class_22";
  if (/supply|supplies|consumable/.test(t)) return "exempt_supply";
  if (/computer|laptop|tablet|monitor|server|network|printer|copier|scanner|\bit\b/.test(t)) return "class_12";
  if (/mri|ct scan|cat scan|mammograph|computer-integrated/.test(t)) return "class_2";
  if (/medical|dental|clinical|diagnostic|device|instrument|x-ray|sterili|microscope|equipment/.test(t)) return "class_8";
  if (/furniture|fixture|cabinet|desk|chair|shelv|couch|sofa|table/.test(t)) return "class_5";
  if (/alarm|phone|camera|register|office machine|sound|stereo|drone/.test(t)) return "class_3";
  if (/software|uniform|book|linen/.test(t)) return "class_1";
  if (/solar|tower|pipeline|cable|tank|container|sign|billboard/.test(t)) return "class_16";
  if (/leasehold|tenant improvement|build-?out/.test(t)) return "class_24";
  return "unclassified";
}

export interface PptLocationSummary {
  locationId: string | null;
  taxableCents: number;
  taxableCount: number;
  exemptCount: number;
  registeredCount: number;
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
      s = { locationId: it.locationId ?? null, taxableCents: 0, taxableCount: 0, exemptCount: 0, registeredCount: 0, needsInputCount: 0, overThreshold: false };
      m.set(key, s);
    }
    const r = pptValue(it, assessmentYear);
    if (r.needsInput) s.needsInputCount++;
    else if (r.taxable) { s.taxableCents += r.fmvCents; s.taxableCount++; }
    else if (r.registered) s.registeredCount++;
    else s.exemptCount++;
  }
  for (const s of m.values()) s.overThreshold = s.taxableCents > PPT_COUNTY_EXEMPTION_CENTS;
  return [...m.values()];
}
