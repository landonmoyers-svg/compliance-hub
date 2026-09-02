import type {
  TrainingAssignment,
  TrainingImportRow,
  TrainingModule,
} from "@/lib/data/schema";

/**
 * Vendor-delivered training.
 *
 * Some required courses play in an outside platform (today: Mineral, reached
 * through Select Health). The course is theirs; the completion RECORD is ours,
 * because vendor access ends with the subscription and an inspector asks us,
 * not them. This module holds the two halves of that:
 *
 *   1. where to send someone to take the course, and
 *   2. how to reconcile the vendor's own completion report against what people
 *      told us they did.
 */

/** Providers we know how to link to. Anything else still works — it just needs a URL on the module. */
export const TRAINING_PROVIDERS = ["Mineral", "Other"] as const;
export type TrainingProvider = (typeof TRAINING_PROVIDERS)[number];

/** Landing page used when a module has no course-specific deep link. */
export const PROVIDER_HOME: Record<string, string> = {
  Mineral: "https://apps.trustmineral.com/training/course-catalog",
};

export function isExternal(m: Pick<TrainingModule, "delivery"> | undefined | null): boolean {
  return m?.delivery === "external";
}

/**
 * Where to send someone to take an external module: its own deep link when we
 * have one, otherwise the provider's catalog (they search for the course name).
 */
export function launchUrlFor(m: TrainingModule): string | null {
  if (!isExternal(m)) return null;
  const url = m.externalUrl?.trim();
  if (url) return url;
  return PROVIDER_HOME[m.provider ?? ""] ?? null;
}

/** True when the provider page can't be opened directly to the course itself. */
export function launchIsCatalogFallback(m: TrainingModule): boolean {
  return isExternal(m) && !m.externalUrl?.trim();
}

/* ----------------------------- CSV parsing ----------------------------- */

/** Minimal RFC4180 reader — handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header aliases seen in vendor exports — matched loosely so a renamed column still lands. */
const HEADER_MAP: { key: keyof ParsedRow; aliases: string[] }[] = [
  { key: "email",       aliases: ["email", "emailaddress", "useremail", "username", "login"] },
  { key: "firstName",   aliases: ["firstname", "first", "givenname"] },
  { key: "lastName",    aliases: ["lastname", "last", "surname", "familyname"] },
  { key: "name",        aliases: ["name", "fullname", "user", "learner", "employee", "displayname"] },
  { key: "course",      aliases: ["course", "coursename", "coursetitle", "title", "training", "module"] },
  { key: "completedAt", aliases: ["completiondate", "datecompleted", "completedon", "completed", "completedate", "finished", "dateearned"] },
  { key: "status",      aliases: ["status", "coursestatus", "progress", "completionstatus"] },
  { key: "score",       aliases: ["score", "grade", "result", "percent"] },
];

interface ParsedRow {
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  course?: string;
  completedAt?: string;
  status?: string;
  score?: string;
}

export interface CompletionRow {
  email: string;
  name: string;
  course: string;
  completedAt: string | null;
  status: string;
  score: number | null;
  /** 1-based row number in the file, so a problem row can be pointed at. */
  line: number;
}

/**
 * Read a vendor completion export into rows we can reconcile. Tolerant by
 * design: vendors rename columns, and a failed import is worse than a loose one.
 */
export function parseCompletionCsv(text: string): { rows: CompletionRow[]; headerFound: boolean } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], headerFound: false };

  // The header is the first row that maps at least a person and a course column.
  let headerIdx = -1;
  let mapping: (keyof ParsedRow | null)[] = [];
  for (let r = 0; r < Math.min(table.length, 10); r++) {
    const candidate = table[r].map((h) => {
      const n = norm(h);
      const hit = HEADER_MAP.find((m) => m.aliases.includes(n));
      return hit ? hit.key : null;
    });
    const hasPerson = candidate.some((k) => k === "email" || k === "name" || k === "lastName");
    const hasCourse = candidate.some((k) => k === "course");
    if (hasPerson && hasCourse) { headerIdx = r; mapping = candidate; break; }
  }
  if (headerIdx === -1) return { rows: [], headerFound: false };

  const rows: CompletionRow[] = [];
  for (let r = headerIdx + 1; r < table.length; r++) {
    const cells = table[r];
    const p: ParsedRow = {};
    mapping.forEach((key, c) => {
      if (!key) return;
      const v = (cells[c] ?? "").trim();
      if (v) p[key] = v;
    });

    const name =
      p.name ??
      [p.firstName, p.lastName].filter(Boolean).join(" ").trim() ??
      "";
    if (!p.course && !name && !p.email) continue;

    rows.push({
      email: (p.email ?? "").trim().toLowerCase(),
      name: name.trim(),
      course: (p.course ?? "").trim(),
      completedAt: parseLooseDate(p.completedAt),
      status: (p.status ?? "").trim(),
      score: p.score ? Number(p.score.replace(/[^0-9.]/g, "")) || null : null,
      line: r + 1,
    });
  }
  return { rows, headerFound: true };
}

/** Accepts 2026-08-14, 8/14/2026, 14 Aug 2026 … Returns an ISO string or null. */
export function parseLooseDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`).toISOString();
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s);
  if (us) {
    const yr = us[3].length === 2 ? `20${us[3]}` : us[3];
    const mo = us[1].padStart(2, "0");
    const da = us[2].padStart(2, "0");
    return new Date(`${yr}-${mo}-${da}T12:00:00Z`).toISOString();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** A completion row counts only if it says the course was finished. */
export function rowIsComplete(row: CompletionRow): boolean {
  if (row.completedAt) return true;
  const s = norm(row.status);
  return s === "complete" || s === "completed" || s === "passed" || s === "100";
}

/* --------------------------- reconciliation ---------------------------- */

export interface ReconcileInput {
  rows: CompletionRow[];
  modules: TrainingModule[];
  assignments: TrainingAssignment[];
  /** Directory used to turn a report email into one of our users. */
  people: { userId: string; fullName: string; email?: string | null }[];
}

export interface VerifyAction {
  assignment: TrainingAssignment;
  module: TrainingModule;
  row: CompletionRow;
  /** completedAt we will stamp (the vendor's date wins). */
  completedAt: string;
  /** Set when the vendor's date and the employee's attestation disagree. */
  discrepancy: string | null;
}

export interface ReconcileResult {
  verify: VerifyAction[];
  unmatched: TrainingImportRow[];
  /** Rows the report itself says are not finished — ignored, but counted. */
  incomplete: number;
}

/** How far apart the attested and reported dates may be before we call it a discrepancy. */
const DATE_TOLERANCE_DAYS = 45;

export function reconcileCompletions({ rows, modules, assignments, people }: ReconcileInput): ReconcileResult {
  const externals = modules.filter(isExternal);

  const moduleByKey = new Map<string, TrainingModule>();
  for (const m of externals) {
    moduleByKey.set(norm(m.title), m);
    if (m.providerCourseCode) moduleByKey.set(norm(m.providerCourseCode), m);
  }

  const personByEmail = new Map<string, { userId: string; fullName: string }>();
  const personByName = new Map<string, { userId: string; fullName: string }>();
  for (const p of people) {
    if (p.email) personByEmail.set(p.email.trim().toLowerCase(), { userId: p.userId, fullName: p.fullName });
    personByName.set(norm(p.fullName), { userId: p.userId, fullName: p.fullName });
  }

  const verify: VerifyAction[] = [];
  const unmatched: TrainingImportRow[] = [];
  let incomplete = 0;

  for (const row of rows) {
    if (!rowIsComplete(row)) { incomplete++; continue; }

    const matchedModule = moduleByKey.get(norm(row.course));
    if (!matchedModule) {
      unmatched.push({ ...toImportRow(row), reason: "No external module matches this course name" });
      continue;
    }

    const person =
      (row.email ? personByEmail.get(row.email) : undefined) ??
      personByName.get(norm(row.name)) ??
      personByName.get(norm(flipLastFirst(row.name)));
    if (!person) {
      unmatched.push({ ...toImportRow(row), reason: "No Hub user matches this name or email" });
      continue;
    }

    const candidates = assignments
      .filter((a) => a.trainingModuleId === matchedModule.id)
      .filter((a) => a.assignedToUserId === person.userId || norm(a.assignedToName) === norm(person.fullName))
      .filter((a) => a.verificationStatus !== "verified");

    if (candidates.length === 0) {
      unmatched.push({ ...toImportRow(row), reason: `No open assignment for ${person.fullName} on this course` });
      continue;
    }

    // Prefer an open assignment; otherwise the most recently completed one.
    const open = candidates.filter((a) => a.status !== "completed");
    const assignment =
      open.sort(byDueDate)[0] ??
      candidates.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];

    const attested = assignment.externalCompletedAt ?? assignment.completedAt ?? null;
    const gap = attested && row.completedAt ? Math.abs(daysBetween(attested, row.completedAt)) : 0;
    const discrepancy =
      attested && row.completedAt && gap > DATE_TOLERANCE_DAYS
        ? `Attested ${attested.slice(0, 10)}, vendor report says ${row.completedAt.slice(0, 10)} (${Math.round(gap)} days apart)`
        : null;

    verify.push({
      assignment,
      module: matchedModule,
      row,
      completedAt: row.completedAt ?? attested ?? new Date().toISOString(),
      discrepancy,
    });
  }

  return { verify, unmatched, incomplete };
}

function toImportRow(row: CompletionRow): TrainingImportRow {
  return {
    name: row.name || undefined,
    email: row.email || undefined,
    course: row.course || undefined,
    completedAt: row.completedAt ?? undefined,
  };
}

function flipLastFirst(name: string): string {
  const parts = name.split(",");
  return parts.length === 2 ? `${parts[1].trim()} ${parts[0].trim()}` : name;
}

function byDueDate(a: TrainingAssignment, b: TrainingAssignment): number {
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
}

function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}
