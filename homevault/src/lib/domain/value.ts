/**
 * What being organised is actually worth, in hours and dollars.
 *
 * The temptation with a feature like this is to pick the biggest number in the
 * literature, multiply it by a wage, and print it in a big font. That is how
 * you get "SAVES YOU $4,200 A YEAR!" — a fabricated figure used to drive
 * behaviour, which is the same manipulation this product avoids everywhere
 * else, just pointed somewhere friendly.
 *
 * So this module is built to be *audited by the household*, not believed:
 *
 *  • Every input is a named assumption with a stated source and a default,
 *    and every one can be changed. If our guess is wrong for you, change it.
 *  • Results are **ranges**, because the underlying studies disagree by a
 *    factor of two or more.
 *  • Defaults sit at the **conservative** end. If we are going to be wrong,
 *    be wrong low.
 *  • `NOT_INCLUDED` states what this does not count, out loud.
 *
 * ## On the quality of these sources
 *
 * Most published statistics in this space are vendor marketing. The password
 * numbers come from security companies; the lost-item survey was run by a
 * company that sells lost-item trackers. Each source below carries a
 * `provenance` note so a household can weigh it accordingly.
 *
 * One figure is deliberately EXCLUDED: the widely-quoted "knowledge workers
 * spend ~5 hours a week searching for documents" (IDC). That measures paid
 * office work, not household admin, and borrowing it here would inflate the
 * result by an order of magnitude. It is the most common sleight of hand in
 * calculators like this one, and we are not doing it.
 */

export interface Source {
  id: string;
  claim: string;
  publisher: string;
  url: string;
  /** How much weight this deserves, stated plainly. */
  provenance: string;
}

export const SOURCES: Source[] = [
  {
    id: "bls-wage",
    claim: "Average hourly earnings, all private non-farm employees: $37.62 (July 2026).",
    publisher: "U.S. Bureau of Labor Statistics",
    url: "https://www.bls.gov/news.release/empsit.t19.htm",
    provenance: "Government statistical agency. The most reliable figure here.",
  },
  {
    id: "password-resets",
    claim: "People spend roughly 11–26 hours a year remembering and resetting passwords.",
    publisher: "Multiple surveys (Bloomberg/Business Reporter; ExpressVPN; Statista)",
    url: "https://www.statista.com/statistics/1360065/resetting-account-passwords-in-selected-countries",
    provenance:
      "Mostly commissioned by security vendors, who benefit from larger numbers. Studies disagree widely, so we default to the low end.",
  },
  {
    id: "lost-items",
    claim:
      "Americans spend about 2.5 days a year (~60 hours) looking for misplaced items; paperwork and documents are among the most commonly lost.",
    publisher: "Pixie “Lost & Found” survey",
    url: "https://www.prnewswire.com/news-releases/lost-and-found-the-average-american-spends-25-days-each-year-looking-for-lost-items-collectively-costing-us-households-27-billion-annually-in-replacement-costs-300449305.html",
    provenance:
      "Run by a company selling lost-item trackers. Covers ALL misplaced items — keys, phones, wallets — so only a fraction is paperwork this app would help with.",
  },
  {
    id: "executor-hours",
    claim: "Settling an estate takes an executor roughly 390–1,200 hours, averaging around 570.",
    publisher: "Estate-administration law firms (widely repeated industry figure)",
    url: "https://www.elderlawanswers.com/how-long-does-an-executors-job-take-18746",
    provenance:
      "Repeated across many probate firms; the original methodology is not published. Treat as a rough order of magnitude, not a measurement.",
  },
];

export const SOURCE_BY_ID: Record<string, Source> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

/**
 * Every number the estimate depends on. Defaults are conservative and each one
 * is meant to be argued with.
 */
export interface ValueAssumptions {
  /** Dollars per hour used to price time. */
  hourlyRate: number;
  /** Adults in the household whose time this affects. */
  adults: number;
  /** Hours per adult per year lost to password resets and lookups. */
  passwordHoursPerYear: number;
  /** Hours per adult per year hunting for misplaced paperwork. */
  paperworkHoursPerYear: number;
  /**
   * Share of that time an organised, searchable vault actually removes.
   * Not 100%: you will still occasionally hunt for a physical document, and
   * some lookups are unavoidable.
   */
  recoverableShare: number;
  /** Hours an executor spends settling an estate. */
  executorHours: number;
  /**
   * Share of executor time that is *locating and gathering* rather than court
   * filings, tax returns, and waiting — the only part this app can affect.
   */
  executorSearchShare: number;
}

export const DEFAULT_ASSUMPTIONS: ValueAssumptions = {
  // BLS, July 2026.
  hourlyRate: 37.62,
  adults: 2,
  // Low end of the 11–26 hour range, because the high end comes from vendors.
  passwordHoursPerYear: 11,
  // The lost-item survey says ~60 hours across ALL misplaced things. Paperwork
  // is one category among many (keys, phones, wallets), so we take a quarter.
  paperworkHoursPerYear: 15,
  // A vault removes the search, not the errand.
  recoverableShare: 0.6,
  // Middle of the cited 390–1,200 range.
  executorHours: 570,
  // Conservative: most executor time is process and waiting, not searching.
  executorSearchShare: 0.2,
};

/** Stated plainly wherever a number appears. */
export const NOT_INCLUDED = [
  "The time you spend putting information into HomeVault in the first place.",
  "Court filings, tax returns, and the waiting that makes up most of settling an estate — no app removes those.",
  "Anything you'd still have to physically go and find, like a document in a safe-deposit box.",
  "Money saved by not missing a renewal or a policy lapse, which we have no way to estimate honestly.",
];

export interface Estimate {
  /** Conservative and less-conservative bounds. */
  lowHours: number;
  highHours: number;
  lowDollars: number;
  highDollars: number;
}

function round(n: number): number {
  return Math.round(n);
}

/**
 * Recurring annual saving for the household itself.
 *
 * The low bound uses the assumptions as given; the high bound uses the upper
 * end of the published password range, since that is where the studies diverge
 * most.
 */
export function annualHouseholdSaving(a: ValueAssumptions = DEFAULT_ASSUMPTIONS): Estimate {
  const lowPerAdult = (a.passwordHoursPerYear + a.paperworkHoursPerYear) * a.recoverableShare;
  // 26 h/yr is the top of the cited password range.
  const highPerAdult = (26 + a.paperworkHoursPerYear) * a.recoverableShare;

  const lowHours = lowPerAdult * a.adults;
  const highHours = highPerAdult * a.adults;

  return {
    lowHours: round(lowHours),
    highHours: round(highHours),
    lowDollars: round(lowHours * a.hourlyRate),
    highDollars: round(highHours * a.hourlyRate),
  };
}

/**
 * One-time saving for whoever settles the estate.
 *
 * This is the figure most likely to be abused, so it is bounded hard: only the
 * *searching* portion of executor time, and only the share of that a complete
 * record set removes.
 */
export function handoverSaving(a: ValueAssumptions = DEFAULT_ASSUMPTIONS): Estimate {
  const searchHours = a.executorHours * a.executorSearchShare;
  // Even a perfect vault does not eliminate all of it — they still have to read
  // and act on what they find.
  const lowHours = searchHours * 0.5;
  const highHours = searchHours * 0.9;

  return {
    lowHours: round(lowHours),
    highHours: round(highHours),
    lowDollars: round(lowHours * a.hourlyRate),
    highDollars: round(highHours * a.hourlyRate),
  };
}

/** Formats a range without implying more precision than we have. */
export function formatHours(e: Estimate): string {
  return e.lowHours === e.highHours ? `${e.lowHours} hours` : `${e.lowHours}–${e.highHours} hours`;
}

export function formatDollars(e: Estimate): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  return e.lowDollars === e.highDollars ? fmt(e.lowDollars) : `${fmt(e.lowDollars)}–${fmt(e.highDollars)}`;
}

/**
 * The caveat that has to travel with the dollar figure.
 *
 * Pricing your own Saturday afternoon at an average wage is a modelling choice,
 * not a fact — you do not actually receive $37.62 for an hour you didn't spend
 * hunting for the insurance policy. Saying so is what separates an estimate
 * from a sales pitch.
 */
export const DOLLAR_CAVEAT =
  "Hours are priced at the national average wage, which is a way of making time comparable — not money you'll receive. The hours are the real claim; the dollars are a translation.";
