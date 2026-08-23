import type { CategoryKey } from "./categories";

/**
 * Why this household is here.
 *
 * The same vault serves two very different people. One is organising a busy
 * household and wants either partner to be able to find the insurance policy on
 * a Tuesday; they are not thinking about dying and would rather not. The other
 * is preparing a handover they know is coming, and urgency is welcome rather
 * than morbid.
 *
 * Serving both with one voice means serving neither. So the journey a household
 * picks changes the order of the work, the milestones, the cadence, and — most
 * of all — the language. The machinery underneath is identical.
 *
 * ## The design rule this file exists to enforce
 *
 * HomeVault is a **completion product**, not a habit product. There is a finish
 * line, followed by a long quiet maintenance tail. Streaks, daily goals and
 * "don't break your chain" mechanics are therefore actively wrong here: they
 * manufacture recurring engagement for a task that is supposed to *end*.
 *
 * Success is a household that finishes, feels relief, and afterwards hears from
 * us a few times a year. Every mechanic below is measured against that.
 */

export type JourneyKey = "organized" | "handover" | "caregiver" | "security";

/**
 * A named, human-sized win. Milestones replace a bare percentage because
 * "you're at 47%" says nothing about what you got, and a number that only goes
 * up is a treadmill. "Either of you can pay any bill" is a thing you can finish
 * and feel.
 */
export interface Milestone {
  key: string;
  /** Stated as a capability the household gains, never as a task list. */
  title: string;
  /** Why it matters, in this journey's terms. */
  why: string;
  /** Categories that must have at least one current record. */
  requires: CategoryKey[];
}

export interface Journey {
  key: JourneyKey;
  /** How the household describes itself, in their words not ours. */
  label: string;
  tagline: string;
  /** The outcome they actually want. Shown back to them so they can course-correct. */
  goal: string;
  /** Work order. The first milestone should be reachable in one sitting. */
  milestones: Milestone[];
  /**
   * How we refer to the eventual handover. The point is not to hide it — it is
   * in the product name and the nav — but to lead with the door this person
   * actually walked through.
   */
  handoverFraming: string;
  /** Roughly how often a *finished* household should hear from us, in days. */
  maintenanceCadenceDays: number;
}

export const JOURNEYS: Journey[] = [
  {
    key: "organized",
    label: "Getting our household organised",
    tagline: "So either of us can find what we need, when we need it.",
    goal:
      "Nothing important lives only in one person's head. Either partner can handle any household task without hunting or asking.",
    handoverFraming:
      "Everything you organise here is also what your family would need if you were ever out of action for a while — but that is a side effect, not the point. Set it up when you're ready.",
    maintenanceCadenceDays: 180,
    milestones: [
      {
        key: "day-to-day",
        title: "Either of you can run the house",
        why: "Wi-Fi, utilities, subscriptions and the numbers you need on an ordinary Tuesday.",
        requires: ["household", "contacts"],
      },
      {
        key: "money",
        title: "Either of you can handle the money",
        why: "If one of you is travelling, ill, or just unavailable, the other can still pay everything.",
        requires: ["financial", "accounts"],
      },
      {
        key: "emergency",
        title: "Either of you can handle an emergency",
        why: "Allergies, medications, doctors and the insurance details you'd need at 2am.",
        requires: ["medical", "insurance"],
      },
      {
        key: "the-paperwork",
        title: "The paperwork is findable",
        why: "Passports, birth certificates, deeds and titles — with where the originals physically live.",
        requires: ["identity", "property"],
      },
    ],
  },
  {
    key: "handover",
    label: "Preparing to hand things over",
    tagline: "So the people I leave behind aren't left guessing.",
    goal:
      "One coherent, complete set of instructions your family can actually act on — without a scavenger hunt during the worst week of their lives.",
    handoverFraming:
      "This is the part you came for. Once your records are in, you'll choose who receives what, and how that transfer is verified.",
    maintenanceCadenceDays: 90,
    milestones: [
      {
        key: "the-essentials",
        title: "The essentials are recorded",
        why: "Identity documents and the accounts that have to be dealt with first.",
        requires: ["identity", "financial"],
      },
      {
        key: "legal",
        title: "The legal picture is clear",
        why: "Will, trust, powers of attorney — and, just as importantly, where the signed originals are.",
        requires: ["estate", "contacts"],
      },
      {
        key: "wishes",
        title: "Your wishes are written down",
        why: "The things no document captures: what you want, and what you'd want them to know.",
        requires: ["directives", "medical"],
      },
      {
        key: "the-practical",
        title: "The practical details won't be lost",
        why: "Insurance, property, logins and the household details an executor always ends up hunting for.",
        requires: ["insurance", "property", "accounts", "household"],
      },
    ],
  },
  {
    key: "caregiver",
    label: "Helping a parent or relative",
    tagline: "So I can step in without starting from nothing.",
    goal:
      "Know where everything is and what's in force, before you're making decisions under pressure on someone else's behalf.",
    handoverFraming:
      "When the time comes, the handover process here is designed so you aren't relying on a single person's memory or a drawer full of paper.",
    maintenanceCadenceDays: 90,
    milestones: [
      {
        key: "medical-first",
        title: "You can speak to a doctor with confidence",
        why: "Conditions, medications, physicians and the advance directive — the things asked for first.",
        requires: ["medical", "directives"],
      },
      {
        key: "authority",
        title: "You know who is allowed to act",
        why: "Powers of attorney, named contacts, and the professionals already involved.",
        requires: ["estate", "contacts"],
      },
      {
        key: "money-and-cover",
        title: "The money and cover are mapped",
        why: "Accounts, insurance and what's actually in force before anything lapses.",
        requires: ["financial", "insurance"],
      },
      {
        key: "the-house",
        title: "The house and papers are accounted for",
        why: "Identity documents, property, and the day-to-day details of running their home.",
        requires: ["identity", "property", "household"],
      },
    ],
  },
  {
    key: "security",
    label: "Getting our digital life secure",
    tagline: "So our accounts and identity aren't one breach away from chaos.",
    goal:
      "Credentials and identity documents out of notes apps and spreadsheets, and into something that's actually encrypted.",
    handoverFraming:
      "The same encryption that protects these accounts is what makes handing them over safe later — whenever you want to set that up.",
    maintenanceCadenceDays: 180,
    milestones: [
      {
        key: "the-keys",
        title: "The keys to everything are secured",
        why: "Email, password manager recovery, and the 2FA backups that unlock everything else.",
        requires: ["accounts"],
      },
      {
        key: "identity",
        title: "Your identity documents are protected",
        why: "SSNs, passports and birth certificates — the documents identity theft actually needs.",
        requires: ["identity"],
      },
      {
        key: "financial",
        title: "Financial access is locked down",
        why: "Bank, brokerage and any crypto — the accounts with the most to lose.",
        requires: ["financial"],
      },
      {
        key: "the-rest",
        title: "The rest of the household is covered",
        why: "Insurance, property and the household logins that tend to get forgotten.",
        requires: ["insurance", "property", "household"],
      },
    ],
  },
];

export const JOURNEY_BY_KEY: Record<JourneyKey, Journey> = Object.fromEntries(
  JOURNEYS.map((j) => [j.key, j]),
) as Record<JourneyKey, Journey>;

/** The default when a household hasn't chosen — the least presumptuous path. */
export const DEFAULT_JOURNEY: JourneyKey = "organized";

/**
 * Categories in this journey's working order, so the vault and the coach both
 * lead with what this household came for.
 */
export function priorityOrder(journey: Journey): CategoryKey[] {
  const seen = new Set<CategoryKey>();
  const ordered: CategoryKey[] = [];
  for (const m of journey.milestones) {
    for (const c of m.requires) {
      if (!seen.has(c)) {
        seen.add(c);
        ordered.push(c);
      }
    }
  }
  return ordered;
}
