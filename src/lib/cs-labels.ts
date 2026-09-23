/**
 * Box and vial labels for controlled substances.
 *
 * The practice keeps ONE log per campus — M for Murray, L for Lehi (Murray
 * Clinic 1's separate log is retired) — and labels each box with a letter:
 *
 *     M1A  M1B  M1C  M1D …  M1Z     then   M2A  M2B …
 *     └┬┘  the run of letters; it rolls over at Z, so the scheme never runs out
 *
 * A vial is its box plus its number: M1A1 … M1A10. That makes every vial id
 * unique for the life of the practice, which is the point — a custody record
 * naming M1C7 must never be ambiguous years later.
 *
 * Older labels used a dash (L-A1, from before the run number existed). They're
 * still parsed so existing bottles keep working; new boxes use the new form.
 */

export interface BoxLabelParts {
  /** Campus code: "M" (Murray) or "L" (Lehi). */
  code: string;
  /** Which run of A–Z this box belongs to. Legacy dashed labels are run 1. */
  run: number;
  /** A–Z within the run. */
  letter: string;
  legacy: boolean;
}

const NEW = /^([A-Z]+?)(\d+)([A-Z])$/;      // M1A
const LEGACY = /^([A-Z]+)-([A-Z])$/;        // L-A

/** Parse a BOX label (not a vial id). Returns null if it isn't one. */
export function parseBoxLabel(label: string | null | undefined): BoxLabelParts | null {
  const l = (label ?? "").trim().toUpperCase();
  const m = NEW.exec(l);
  if (m) return { code: m[1], run: Number(m[2]), letter: m[3], legacy: false };
  const g = LEGACY.exec(l);
  if (g) return { code: g[1], run: 1, letter: g[2], legacy: true };
  return null;
}

/** The box a vial belongs to: M1A7 → M1A, and the older L-A7 → L-A. */
export function boxOfVial(vialId: string | null | undefined): string {
  const v = (vialId ?? "").trim().toUpperCase();
  return v ? v.replace(/\d+$/, "") : "";
}

export function boxLabel(code: string, run: number, letter: string): string {
  return `${code.toUpperCase()}${run}${letter.toUpperCase()}`;
}

export function vialId(box: string, n: number): string {
  return `${box.toUpperCase()}${n}`;
}

/** The campus log a site belongs to: anything in Murray shares M, Lehi is L. */
export function logCodeForSite(siteName: string | null | undefined): string {
  const n = (siteName ?? "").toLowerCase();
  if (n.includes("lehi")) return "L";
  if (n.includes("murray")) return "M";
  return (siteName ?? "").match(/[a-zA-Z]/)?.[0]?.toUpperCase() ?? "";
}

const A = "A".charCodeAt(0);
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(A + i));

/**
 * The next free box letters for a campus, continuing where the log left off:
 * fills the current run to Z, then starts the next run at A. Never reuses a
 * label that already exists, including the older dashed ones.
 */
export function nextBoxLabels(existingLabels: string[], code: string, count: number): { run: number; letter: string; label: string }[] {
  const used = new Set<string>();
  for (const l of existingLabels) {
    const p = parseBoxLabel(l);
    if (p && p.code === code.toUpperCase()) used.add(`${p.run}${p.letter}`);
  }
  const out: { run: number; letter: string; label: string }[] = [];
  for (let run = 1; out.length < count && run < 1000; run++) {
    for (const letter of LETTERS) {
      if (out.length >= count) break;
      if (used.has(`${run}${letter}`)) continue;
      // Don't leave a hole: only offer a label in a run that is current or next.
      out.push({ run, letter, label: boxLabel(code, run, letter) });
      used.add(`${run}${letter}`);
    }
  }
  return out;
}

/** Every box label in use for a campus, newest run first — for display. */
export function boxLabelsForCode(existingLabels: string[], code: string): string[] {
  return existingLabels
    .map((l) => ({ l: l.toUpperCase(), p: parseBoxLabel(l) }))
    .filter((x) => x.p && x.p.code === code.toUpperCase())
    .sort((a, b) => (b.p!.run - a.p!.run) || a.p!.letter.localeCompare(b.p!.letter))
    .map((x) => x.l);
}
