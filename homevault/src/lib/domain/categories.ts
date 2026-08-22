import type { LucideIcon } from "lucide-react";
import {
  IdCard,
  KeyRound,
  Landmark,
  Scale,
  HeartPulse,
  ShieldCheck,
  Home,
  Plug,
  FlaskConical,
  Contact,
  ScrollText,
} from "lucide-react";

/**
 * Sensitivity tiers drive encryption-strength messaging, whether a reveal
 * requires step-up auth (a fresh passkey tap → capability token), and which
 * handover model defaults apply. See docs/SECURITY.md and docs/HANDOVER.md.
 */
export type SensitivityTier = "critical" | "high" | "standard";

export const TIER_LABEL: Record<SensitivityTier, string> = {
  critical: "Critical",
  high: "High",
  standard: "Standard",
};

/** Whether viewing a record of this tier requires a fresh step-up auth. */
export function requiresStepUp(tier: SensitivityTier): boolean {
  return tier === "critical";
}

export type CategoryKey =
  | "identity"
  | "accounts"
  | "financial"
  | "estate"
  | "medical"
  | "insurance"
  | "property"
  | "household"
  | "hazmat"
  | "contacts"
  | "directives";

export interface Category {
  key: CategoryKey;
  label: string;
  blurb: string;
  tier: SensitivityTier;
  icon: LucideIcon;
  /** This category typically references a physical original / location. */
  locationAware: boolean;
  /** Example record labels — shown as coaching prompts on an empty category. */
  examples: string[];
}

/**
 * The category taxonomy. Mirrors the things the household actually needs to
 * hand over. Kept as data (not hard-coded UI) so the completeness coach and the
 * handover tier-mapping can iterate over it. See docs/DATA-MODEL.md.
 */
export const CATEGORIES: Category[] = [
  {
    key: "identity",
    label: "Identity documents",
    blurb: "Birth & marriage certificates, SSN cards, passports, licenses.",
    tier: "critical",
    icon: IdCard,
    locationAware: true,
    examples: ["Birth certificate", "Social Security card", "Passport"],
  },
  {
    key: "accounts",
    label: "Passwords & accounts",
    blurb: "Logins, 2FA recovery codes, email and domain control.",
    tier: "critical",
    icon: KeyRound,
    locationAware: false,
    examples: ["Primary email login", "Password manager recovery kit", "2FA backup codes"],
  },
  {
    key: "financial",
    label: "Financial",
    blurb: "Bank & brokerage accounts, crypto seed phrases, tax records, safe-deposit.",
    tier: "critical",
    icon: Landmark,
    locationAware: true,
    examples: ["Primary checking", "Brokerage account", "Crypto seed phrase", "Safe-deposit box"],
  },
  {
    key: "estate",
    label: "Estate & legal",
    blurb: "Wills, trusts, powers of attorney, advance directives, beneficiaries.",
    tier: "critical",
    icon: Scale,
    locationAware: true,
    examples: ["Last will & testament", "Revocable living trust", "Durable power of attorney"],
  },
  {
    key: "medical",
    label: "Medical history",
    blurb: "Conditions, allergies, medications, physicians, directives.",
    tier: "high",
    icon: HeartPulse,
    locationAware: false,
    examples: ["Allergies & medications", "Primary physician", "Advance healthcare directive"],
  },
  {
    key: "insurance",
    label: "Insurance",
    blurb: "Life, home, auto, umbrella policies and agent contacts.",
    tier: "high",
    icon: ShieldCheck,
    locationAware: true,
    examples: ["Life insurance policy", "Homeowners policy", "Auto policy"],
  },
  {
    key: "property",
    label: "Property & titles",
    blurb: "Deeds, vehicle titles, registrations, appraisals, warranties.",
    tier: "high",
    icon: Home,
    locationAware: true,
    examples: ["Home deed", "Vehicle title", "Major appliance warranties"],
  },
  {
    key: "household",
    label: "Household & utilities",
    blurb: "Utilities, subscriptions, Wi-Fi, device PINs, service providers.",
    tier: "standard",
    icon: Plug,
    locationAware: true,
    examples: ["Wi-Fi network & password", "Electric utility account", "Streaming subscriptions"],
  },
  {
    key: "hazmat",
    label: "Hazardous materials",
    blurb: "Where dangerous substances are stored and how to handle them.",
    tier: "high",
    icon: FlaskConical,
    locationAware: true,
    examples: ["Firearms & ammunition storage", "Pool chemicals", "Propane / fuel storage"],
  },
  {
    key: "contacts",
    label: "Key contacts",
    blurb: "Attorney, accountant, executor, doctors, next-of-kin.",
    tier: "standard",
    icon: Contact,
    locationAware: false,
    examples: ["Estate attorney", "Accountant", "Named executor"],
  },
  {
    key: "directives",
    label: "Wishes & directives",
    blurb: "End-of-life wishes, letters to family, “if I'm gone, read this.”",
    tier: "high",
    icon: ScrollText,
    locationAware: true,
    examples: ["Funeral wishes", "Letter to my family", "Digital-legacy instructions"],
  },
];

export const CATEGORY_BY_KEY: Record<CategoryKey, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, Category>;
