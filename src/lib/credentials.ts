import { parseDate } from "./dates";

/**
 * Shared clinical-credential classification + "superseded" detection. The
 * Credentials UI (provider-file view) and the alerting/scoring surfaces MUST
 * agree on which credentials are current vs. superseded — otherwise a person
 * with a current license still gets "expired" alerts for the old copy it
 * replaced. This is the single source of truth.
 */

export type CredClass = "rn" | "aprn" | "aprn_cs" | "pa" | "dea" | "board_cert" | "other";
export const CLASS_ORDER: CredClass[] = ["rn", "aprn", "aprn_cs", "pa", "dea", "board_cert", "other"];
export const CLASS_LABEL: Record<CredClass, string> = {
  rn: "RN License",
  aprn: "APRN License",
  aprn_cs: "APRN — Controlled Substance License",
  pa: "PA License",
  dea: "DEA Registration",
  board_cert: "Board Certification",
  other: "Other / supporting documents",
};

/** Minimal shape the classification needs — satisfied by CredentialRecord and by
 *  mapped DB rows (e.g. in the notification scan). */
export interface CredInput {
  id: string;
  employeeUserId?: string | null;
  employeeName?: string | null;
  credentialName?: string | null;
  credentialType?: string | null;
  credentialClass?: CredClass | null;
  boardType?: string | null;
  credentialNumber?: string | null;
  expirationDate?: string | null;
  issueDate?: string | null;
  createdDate?: string | null;
  locationId?: string | null;
}

const norm = (s?: string | null): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Classify a credential from its NAME when the stored class is absent. */
export function classifyCredential(c: CredInput): { klass: CredClass; boardType: string | null } {
  const n = (c.credentialName || "").toLowerCase();
  const isLicense = /licen[sc]e|licensure/.test(n);
  const isAprn = /aprn|a\.p\.r\.n\.|advanced practice registered nurse/.test(n);
  const isPa = /physician assistant|\bpa-c\b/.test(n);
  const isRn = /registered nurse|\brn\b/.test(n);
  const hasCs = /controlled substance|schedule\s*2|schedule\s*ii|\bcsr\b/.test(n);
  const isDea = /\bdea\b/.test(n);
  const isBoard = /board[ -]?cert|pmhnp-bc|\bancc\b|\bnccpa\b|certification verification|board certification/.test(n);

  if (isDea) return { klass: "dea", boardType: null };
  if (isBoard) {
    let bt: string | null = null;
    if (/pmhnp|psychiatric[- ]mental health/.test(n)) bt = "PMHNP";
    else if (/\bfnp\b|family nurse/.test(n)) bt = "FNP";
    else if (/nccpa|physician assistant|\bpa-c\b|\bpa\b/.test(n)) bt = "PA";
    return { klass: "board_cert", boardType: bt };
  }
  if (isLicense && isAprn && hasCs) return { klass: "aprn_cs", boardType: null };
  if (isLicense && isAprn) return { klass: "aprn", boardType: null };
  if (isLicense && isPa) return { klass: "pa", boardType: null };
  if (isLicense && isRn) return { klass: "rn", boardType: null };
  return { klass: "other", boardType: null };
}

/** Prefer the AI's document-derived class; fall back to the name heuristic. */
export function resolveCredClass(c: CredInput): { klass: CredClass; boardType: string | null } {
  if (c.credentialClass) return { klass: c.credentialClass, boardType: c.boardType ?? null };
  return classifyCredential(c);
}

/** Recency for current→oldest ordering: expiration, else issue, else created. */
export function credRecency(c: CredInput): number {
  const d = parseDate(c.expirationDate) ?? parseDate(c.issueDate) ?? parseDate(c.createdDate);
  return d ? d.getTime() : 0;
}

/** Root of a license number (before the suffix), e.g. "203474-4405 / 203474-8900"
 *  → "203474" — tells whether an APRN and APRN-CS entry are the same license. */
export function licenseNumberRoot(c: CredInput): string | null {
  const raw = (c.credentialNumber || "").trim();
  const m = raw.match(/[a-z0-9]+/i);
  return m ? m[0].toLowerCase() : null;
}

export interface LeafKind { key: string; label: string; rank: number; locationId: string | null }

/** The renewable "slot" a credential belongs to — the thing whose newest copy is
 *  active and whose older copies are superseded. DEA: one per location. Board
 *  cert: one per board type. APRN/APRN-CS: grouped by license number (combined
 *  document + renewals nest; separate licenses split). Supporting docs: one leaf
 *  per distinct kind (CV, diploma, ACLS, BLS… never supersede one another). */
export function leafFor(c: CredInput, klass: CredClass, boardType: string | null): LeafKind {
  switch (klass) {
    case "rn": return { key: "rn", label: CLASS_LABEL.rn, rank: 0, locationId: null };
    case "aprn":
    case "aprn_cs": {
      const root = licenseNumberRoot(c);
      return { key: root ? `aprn|${root}` : "aprn|combined", label: klass === "aprn_cs" ? CLASS_LABEL.aprn_cs : CLASS_LABEL.aprn, rank: 1, locationId: null };
    }
    case "pa": return { key: "pa", label: CLASS_LABEL.pa, rank: 3, locationId: null };
    case "dea": return { key: `dea|${c.locationId ?? ""}`, label: CLASS_LABEL.dea, rank: 4, locationId: c.locationId ?? null };
    case "board_cert": return { key: `board|${boardType ?? ""}`, label: CLASS_LABEL.board_cert, rank: 5, locationId: null };
    default: {
      const n = (c.credentialName || "").toLowerCase();
      const t = c.credentialType;
      if (/\bacls\b|advanced cardiovascular/.test(n)) return { key: "other|acls", label: "ACLS", rank: 10, locationId: null };
      if (/\bbls\b|basic life support/.test(n)) return { key: "other|bls", label: "BLS", rank: 11, locationId: null };
      if (/\bpals\b|pediatric advanced/.test(n)) return { key: "other|pals", label: "PALS", rank: 12, locationId: null };
      if (/\bcpr\b/.test(n)) return { key: "other|cpr", label: "CPR", rank: 13, locationId: null };
      if (/curriculum|resume|\bcv\b/.test(n)) return { key: "other|cv", label: "Curriculum Vitae", rank: 20, locationId: null };
      if (/diploma|degree|doctor of|master of|bachelor of/.test(n)) return { key: `other|diploma|${norm(n)}`, label: "Diploma / Degree", rank: 21, locationId: null };
      if (/\bnpi\b/.test(n)) return { key: "other|npi", label: "NPI Registration", rank: 22, locationId: null };
      if (t === "immunization" || /immuniz|vaccin|hepatitis|\btb\b|\bppd\b|\bmmr\b|influenza|tdap|titer/.test(n)) return { key: `other|imm|${norm(n)}`, label: "Immunization", rank: 23, locationId: null };
      if (t === "background_check" || /background|\bbci\b|\bfbi\b|\boig\b|\bsam\b|fingerprint|clearance/.test(n)) return { key: `other|bg|${norm(n)}`, label: "Background Check", rank: 24, locationId: null };
      return { key: `other|${norm(n)}`, label: "Supporting document", rank: 30, locationId: null };
    }
  }
}

/** IDs of credentials that are SUPERSEDED — i.e., an older copy in a (holder,
 *  leaf) group where a more-recent copy exists. These are history, not action
 *  items: they must not generate "expired" alerts or count against compliance. */
export function supersededCredentialIds(creds: CredInput[]): Set<string> {
  const groups = new Map<string, CredInput[]>();
  for (const c of creds) {
    const holder = c.employeeUserId || c.employeeName?.trim() || "Unassigned";
    const { klass, boardType } = resolveCredClass(c);
    const key = `${holder}::${leafFor(c, klass, boardType).key}`;
    const arr = groups.get(key);
    if (arr) arr.push(c); else groups.set(key, [c]);
  }
  const superseded = new Set<string>();
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => credRecency(b) - credRecency(a));
    for (let i = 1; i < sorted.length; i++) superseded.add(sorted[i].id);
  }
  return superseded;
}
