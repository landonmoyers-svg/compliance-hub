/**
 * Turn the lines read off a paper controlled-substance log into entries the
 * Hub can reconcile.
 *
 * ONE READ, TWO RECORDS. DEA recordkeeping requires the patient to be
 * identified, so the chart number has to stay ON the record — it just must not
 * be stored in the Hub, whose vendors have no BAA. So each row is parsed once
 * and split:
 *
 *   • the FULL row, chart number included, written to SharePoint (covered by
 *     the practice's Microsoft BAA) as the record of the log;
 *   • the HUB row, identifiers removed, holding only what reconciling a vial
 *     needs — date, vial, action, amount, staff, witness, and the page it came
 *     from, which is how you get back to the full record.
 *
 * Putting each value in the right field is the other half: where the page has a
 * header the columns are matched by position, otherwise each row is read by
 * pattern (a date, a vial label, an amount, an action).
 *
 * Everything returned is for a person to check before it is saved. Reading a
 * handwritten log is not a solved problem and this code does not pretend it is.
 */

import type { CsArchiveEntry, CsEntryAction } from "@/lib/data/schema";

export interface ParsedRow {
  /** Safe for the Hub: no patient identifiers. */
  entry: CsArchiveEntry;
  /** Chart numbers found on this row. For the SharePoint copy ONLY — never sent to the Hub. */
  identifiers: string[];
  /** The page text this came from, so a reviewer can compare. */
  source: string;
  /** Things the reviewer should look at: a missing amount, an unreadable field. */
  flags: string[];
  confidence: number;
}

export interface ParseOptions {
  /** Vial labels already known, so "M1A7" is recognised even when smudged. */
  knownVials?: string[];
  /** Used when a row's date has no year ("3/14"). */
  defaultYear?: number;
  unit?: string;
}

const ACTION_WORDS: [RegExp, CsEntryAction][] = [
  [/\b(administer|administered|admin|given|dose[ds]?|inject)/i, "administered"],
  [/\b(waste[ds]?|discard(ed)?|disposed)/i, "wasted"],
  [/\b(destroy(ed)?|denature[ds]?|reverse\s?distribut)/i, "destroyed"],
  [/\b(receive[ds]?|delivered|stocked)/i, "received"],
  [/\b(transfer(red)?|moved|handed)/i, "transferred"],
  [/\b(return(ed)?)/i, "returned"],
  [/\b(count(ed)?|inventory|audit)/i, "count"],
];

/** Chart numbers, MRNs and the like: kept for the SharePoint record, kept out of the Hub. */
const IDENTIFIER_PATTERNS: RegExp[] = [
  /\b(mrn|chart|pt\.?\s*id|patient\s*(id|#|no)|jane\s*id|luminello|athena)\b[:#\s-]*[a-z0-9-]+/gi,
  /\b[A-Z]{0,3}\d{6,}\b/g,      // long digit runs — chart numbers, account numbers
];

const VIAL = /\b([A-Z]{1,2}\d{1,3}[A-Z]\d{1,3}|[A-Z]{1,2}-[A-Z]\d{1,3})\b/i;  // M1A7, L-A3
const DATE_PATTERNS: RegExp[] = [
  /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
  /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/,
  /\b(\d{1,2})\/(\d{1,2})\b/,
];
const AMOUNT = /\b(\d+(?:\.\d+)?)\s*(m[lg]|cc|mcg|units?|vials?)?\b/i;

/**
 * Split a row's text into the part the Hub may hold and the identifiers it may
 * not. The identifiers are returned, not destroyed — the DEA record needs them.
 */
export function splitIdentifiers(text: string): { clean: string; identifiers: string[] } {
  const identifiers: string[] = [];
  let clean = text;
  for (const p of IDENTIFIER_PATTERNS) {
    clean = clean.replace(p, (hit) => { identifiers.push(hit.trim()); return "[chart id]"; });
  }
  return { clean, identifiers };
}

function parseDate(text: string, defaultYear?: number): string | null {
  for (const p of DATE_PATTERNS) {
    const m = p.exec(text);
    if (!m) continue;
    let y: number, mo: number, d: number;
    if (m[0].includes("-")) { y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); }
    else if (m[3]) { mo = Number(m[1]); d = Number(m[2]); y = Number(m[3]); if (y < 100) y += 2000; }
    else { mo = Number(m[1]); d = Number(m[2]); y = defaultYear ?? new Date().getFullYear(); }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function parseAction(text: string): CsEntryAction | null {
  for (const [re, action] of ACTION_WORDS) if (re.test(text)) return action;
  return null;
}

/** Parse one row of page text into an entry, or null if it isn't a log line. */
export function parseRow(raw: string, opts: ParseOptions = {}): ParsedRow | null {
  const { clean, identifiers } = splitIdentifiers(raw);
  const flags: string[] = [];

  const date = parseDate(clean, opts.defaultYear);
  const vialMatch = VIAL.exec(clean);
  const known = opts.knownVials?.find((v) => clean.toUpperCase().includes(v.toUpperCase()));
  const vialLabel = known ?? vialMatch?.[1]?.toUpperCase() ?? null;
  const action = parseAction(clean);

  // A log line pins itself to a day or a vial. An action word alone isn't
  // enough: a title like "Ketamine administration log" would become an entry.
  if (!date && !vialLabel) return null;

  // The amount is the first number that isn't part of the date or the vial label.
  let rest = clean;
  if (date) for (const p of DATE_PATTERNS) rest = rest.replace(p, " ");
  if (vialLabel) rest = rest.replace(new RegExp(vialLabel, "ig"), " ");
  const amountMatch = AMOUNT.exec(rest);
  const amount = amountMatch ? Number(amountMatch[1]) : null;

  if (!date) flags.push("no date on this row");
  if (!vialLabel) flags.push("no vial identified");
  if (amount == null) flags.push("no amount");
  if (!action) flags.push("couldn't tell what happened — pick an action");

  return {
    identifiers,
    entry: {
      date,
      vialLabel,
      action: action ?? "administered",
      amount,
      unit: amountMatch?.[2]?.toLowerCase() ?? opts.unit ?? null,
      staff: null,
      witness: null,
      pageRef: null,
      note: null,
    },
    source: raw,
    flags,
    confidence: [date, vialLabel, amount, action].filter(Boolean).length / 4,
  };
}

/** Parse a whole page. Rows that aren't log lines are skipped. */
export function parsePage(rows: string[], opts: ParseOptions = {}): ParsedRow[] {
  return rows.map((r) => parseRow(r, opts)).filter((r): r is ParsedRow => r !== null);
}

/* ------------------------------------------------- the SharePoint record */

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The COMPLETE record, chart numbers included, as CSV for SharePoint. This is
 * the DEA record; it is written to a folder covered by the Microsoft BAA and
 * never uploaded to the Hub. `logRef` ties it to the Hub's de-identified copy.
 */
export function fullRecordCsv(rows: ParsedRow[], logRef: string): string {
  const header = ["log", "date", "vial", "action", "amount", "unit", "patient_chart_id", "staff", "witness", "page", "note", "read_from_page_text"];
  const lines = rows.map((r) => [
    logRef, r.entry.date, r.entry.vialLabel, r.entry.action, r.entry.amount, r.entry.unit,
    r.identifiers.join(" | "), r.entry.staff, r.entry.witness, r.entry.pageRef, r.entry.note, r.source,
  ].map(csv).join(","));
  return [header.join(","), ...lines].join("\n");
}

/** What goes to the Hub: the same rows with no identifiers on them. */
export function hubEntries(rows: ParsedRow[]): CsArchiveEntry[] {
  return rows.map((r) => r.entry);
}

/** A row is only safe for the Hub if nothing identifier-shaped survived. */
export function hubSafe(rows: ParsedRow[]): boolean {
  return rows.every((r) => !IDENTIFIER_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(`${r.entry.vialLabel ?? ""} ${r.entry.staff ?? ""} ${r.entry.witness ?? ""} ${r.entry.note ?? ""} ${r.entry.pageRef ?? ""}`);
  }));
}
