// Multi-industry configuration. The app ships as a healthcare compliance
// platform; this layer lets the SAME codebase present as a different industry by
// turning modules on/off and (later) importing the right regulatory sources.
//
// SAFETY INVARIANT: healthcare is the default and hides nothing, so with no
// configuration the app behaves byte-for-byte as it does today. Industry logic
// only ever SUBTRACTS modules for a non-healthcare industry. Kept free of
// client-only imports so both server and client can read it.

export const DEFAULT_INDUSTRY = "healthcare";

export interface Industry {
  slug: string;
  label: string;
  blurb: string;
  /** Nav hrefs that don't apply to this industry — hidden for everyone (incl.
   *  the owner), and their routes blocked. Healthcare = [] (nothing hidden). */
  hiddenModules: string[];
  /** Regulatory-pack keys that seed this industry's federal baseline (Phase 2). */
  regPacks: string[];
}

// Modules that are specific to a clinical healthcare practice. Non-healthcare
// industries hide these; healthcare keeps everything.
const CLINICAL_ONLY = [
  "/controlled-substances", // DEA per-bottle custody
  "/medical-supplies",      // clinical consumables (par/lot/expiration)
  "/payer-enrollment",      // provider paneling with insurance payers
  "/continuing-education",  // clinician CE hours
  "/competency-tracker",    // clinical competency validations
];

export const INDUSTRIES: Industry[] = [
  {
    slug: "healthcare",
    label: "Healthcare",
    blurb: "Behavioral health, medical, dental, and other clinical practices. HIPAA, OSHA, DEA, and payer compliance.",
    hiddenModules: [],
    regPacks: ["federal_universal", "hipaa", "osha_healthcare", "dea"],
  },
  {
    slug: "tech",
    label: "Technology",
    blurb: "Software and IT companies. Data-privacy, security, and employment compliance.",
    hiddenModules: [...CLINICAL_ONLY],
    regPacks: ["federal_universal", "data_privacy", "soc2"],
  },
  {
    slug: "retail",
    label: "Retail",
    blurb: "Stores and e-commerce. PCI-DSS, consumer protection, employment, and workplace safety.",
    hiddenModules: [...CLINICAL_ONLY],
    regPacks: ["federal_universal", "pci_dss", "osha_general"],
  },
  {
    slug: "services",
    label: "Professional services",
    blurb: "Agencies, consultancies, and firms. Employment, contracts, and general business compliance.",
    hiddenModules: [...CLINICAL_ONLY],
    regPacks: ["federal_universal"],
  },
  {
    slug: "food_service",
    label: "Food service",
    blurb: "Restaurants and food businesses. FDA Food Code, food safety, OSHA, and employment.",
    hiddenModules: [...CLINICAL_ONLY],
    regPacks: ["federal_universal", "fda_food_code", "osha_general"],
  },
  {
    slug: "warehouse",
    label: "Warehouse & logistics",
    blurb: "Distribution, warehousing, and transport. OSHA, DOT, hazmat, and employment compliance.",
    hiddenModules: [...CLINICAL_ONLY],
    regPacks: ["federal_universal", "osha_warehouse", "dot_hazmat"],
  },
];

const BY_SLUG: Record<string, Industry> = Object.fromEntries(INDUSTRIES.map((i) => [i.slug, i]));

/** Resolve an industry, always falling back to healthcare (the safe default). */
export function industryBySlug(slug: string | null | undefined): Industry {
  return (slug && BY_SLUG[slug]) || BY_SLUG[DEFAULT_INDUSTRY];
}

/** The nav hrefs hidden for the given industry (empty for healthcare/unknown). */
export function industryHiddenModules(slug: string | null | undefined): string[] {
  return industryBySlug(slug).hiddenModules;
}

/** A jurisdiction is where the business operates — drives which regulations apply. */
export interface Jurisdiction {
  country?: string;
  state?: string;
  county?: string;
  city?: string;
}

export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];
