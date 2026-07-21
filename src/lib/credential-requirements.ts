import type { CredentialRecord, InsurancePolicyRecord, Employee } from "./data/schema";
import { credentialStatus } from "./compliance";
import { isExpired, parseDate } from "./dates";

/**
 * Role-based credential requirements — what a CURRENT (non-expired) copy each
 * clinical role must have on file. These are professional/regulatory standards
 * (not per-org config), so they live in code. The evaluator checks a person's
 * actual credentials + malpractice against the rule set and reports gaps.
 *
 * Prescribers (NP / PA): diploma, NPI, DEA, malpractice, CPR/BLS-or-ACLS, board
 * certification, plus licenses — an NP needs RN + APRN + APRN-controlled-substance
 * state licenses; a PA needs one PA state license. A new-grad NP additionally
 * needs a supervision agreement for their first ~2000 hours (≈1 year), estimated
 * from the date of first licensure. Therapists need a diploma and either a state
 * license or a supervision agreement. RNs need a diploma, board certification,
 * and RN state license.
 */

export type ProviderType = "np" | "pa" | "therapist" | "rn" | "none";

export const PROVIDER_TYPE_LABEL: Record<ProviderType, string> = {
  np: "Nurse Practitioner",
  pa: "Physician Assistant",
  therapist: "Therapist / Counselor",
  rn: "Registered Nurse",
  none: "No clinical credential requirements",
};

/** Infer a person's clinical role from their job role / title / professional role. */
export function inferProviderType(jobRole?: string | null, title?: string | null, professionalRole?: string | null): ProviderType {
  const t = `${jobRole ?? ""} ${title ?? ""} ${professionalRole ?? ""}`.toLowerCase();
  if (!t.trim()) return "none";
  // PA before NP: "Doctorate PA" must not be read as a nursing doctorate.
  if (/\bpa\b|\bpa-c\b|physician assistant/.test(t)) return "pa";
  if (/pmhnp|\baprn\b|\bnp\b|nurse practitioner|\bdnp\b|prescriber/.test(t)) return "np";
  if (/therapist|social worker|\bcsw\b|\blcsw\b|\bcmhc\b|\bacmhc\b|counsel|\blmft\b|\blpc\b|\bclinician\b/.test(t)) return "therapist";
  if (/\brn\b|registered nurse/.test(t)) return "rn";
  return "none";
}

/* --------------------------- credential detectors --------------------------- */

const lc = (s?: string | null): string => (s ?? "").toLowerCase();
const clsIn = (c: CredentialRecord, ...ks: string[]) => ks.includes(c.credentialClass ?? "");

const hasControlledSubstance = (c: CredentialRecord) =>
  /controlled substance|\bcsr\b|\bcs\b|schedule\s*2|schedule\s*ii|-8900/.test(lc(c.credentialName));
const isRnLicense = (c: CredentialRecord) => clsIn(c, "rn");
const isAprnLicense = (c: CredentialRecord) => clsIn(c, "aprn", "aprn_cs");
// The controlled-substance authority is often ON the APRN license (same document),
// sometimes a separate one. Count either: an aprn_cs record, or an APRN license
// whose text shows controlled-substance / schedule authority.
const isAprnCsLicense = (c: CredentialRecord) => clsIn(c, "aprn_cs") || (clsIn(c, "aprn") && hasControlledSubstance(c));
const isPaLicense = (c: CredentialRecord) => clsIn(c, "pa");
const isAnyStateLicense = (c: CredentialRecord) =>
  clsIn(c, "rn", "aprn", "aprn_cs", "pa") ||
  (clsIn(c, "other") && /licen[sc]e|licensure/.test(lc(c.credentialName)) && !/business|facility|controlled substance registration/.test(lc(c.credentialName)));
const isDea = (c: CredentialRecord) => clsIn(c, "dea");
const isBoardCert = (c: CredentialRecord) => clsIn(c, "board_cert");
const isDiploma = (c: CredentialRecord) => /diploma|degree|doctor of|master of|bachelor of|\bdnp\b|\bmsn\b|\bbsn\b|\bpmhnp\b degree|graduat/.test(lc(c.credentialName));
const isNpi = (c: CredentialRecord) => /\bnpi\b|national provider/.test(lc(c.credentialName));
const isCprBls = (c: CredentialRecord) => c.credentialType === "cpr_bls_acls" || /\bcpr\b|\bbls\b|\bacls\b|\bpals\b|basic life|advanced cardiovascular/.test(lc(c.credentialName));
const isSupervision = (c: CredentialRecord) => /supervis|collaborat/.test(lc(c.credentialName));
const isMalpractice = (p: InsurancePolicyRecord) => lc(p.policyType).includes("malpractice") || /malpractice|professional liab/.test(lc(p.policyName));

const credCurrent = (c: CredentialRecord) => credentialStatus(c) !== "expired";
const insCurrent = (p: InsurancePolicyRecord) => !isExpired(p.renewalDate); // no renewal date → treated as current

export type ReqStatus = "met" | "expired" | "missing";

export interface RequirementResult {
  key: string;
  label: string;
  status: ReqStatus;
  /** The satisfying record's name + expiration, or a hint when missing. */
  note?: string;
}

interface Ctx { creds: CredentialRecord[]; insurance: InsurancePolicyRecord[] }

/** Evaluate one credential requirement: met (has a current one), expired (has
 *  one but all lapsed), or missing (none). */
function credReq(ctx: Ctx, key: string, label: string, pred: (c: CredentialRecord) => boolean): RequirementResult {
  const matches = ctx.creds.filter(pred);
  if (matches.length === 0) return { key, label, status: "missing" };
  const current = matches.find(credCurrent);
  if (current) return { key, label, status: "met", note: current.expirationDate ? `exp ${current.expirationDate}` : (current.credentialName || undefined) };
  return { key, label, status: "expired", note: matches[0].expirationDate ? `expired ${matches[0].expirationDate}` : undefined };
}

/** A "one of" requirement across several credential predicates. */
function anyCredReq(ctx: Ctx, key: string, label: string, preds: ((c: CredentialRecord) => boolean)[]): RequirementResult {
  const matches = ctx.creds.filter((c) => preds.some((p) => p(c)));
  if (matches.length === 0) return { key, label, status: "missing" };
  return matches.some(credCurrent) ? { key, label, status: "met" } : { key, label, status: "expired" };
}

function malpracticeReq(ctx: Ctx): RequirementResult {
  const matches = ctx.insurance.filter(isMalpractice);
  if (matches.length === 0) return { key: "malpractice", label: "Malpractice insurance", status: "missing" };
  const current = matches.find(insCurrent);
  if (current) return { key: "malpractice", label: "Malpractice insurance", status: "met", note: current.renewalDate ? `renews ${current.renewalDate}` : undefined };
  return { key: "malpractice", label: "Malpractice insurance", status: "expired" };
}

/** ~2000 hours ≈ 1 year of full-time practice; a new grad if first licensure was
 *  within the last year. Returns null when we can't tell (no license dates). */
function isNewGradNp(creds: CredentialRecord[]): boolean | null {
  const dates = creds.filter(isAnyStateLicense).map((c) => parseDate(c.issueDate)).filter((d): d is Date => !!d);
  if (dates.length === 0) return null;
  const earliest = Math.min(...dates.map((d) => d.getTime()));
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  return Date.now() - earliest < yearMs;
}

/** The full requirement checklist for a person, given their clinical role and
 *  their actual credentials + malpractice policies. */
export function evaluateRequirements(type: ProviderType, creds: CredentialRecord[], insurance: InsurancePolicyRecord[]): RequirementResult[] {
  const ctx: Ctx = { creds, insurance };
  const out: RequirementResult[] = [];

  if (type === "np") {
    out.push(credReq(ctx, "rn", "RN state license", isRnLicense));
    const aprn = credReq(ctx, "aprn", "APRN state license", isAprnLicense);
    const aprnCs = credReq(ctx, "aprn_cs", "APRN controlled-substance license", isAprnCsLicense);
    // Invariant: an APRN-CS license IS an APRN license — you can hold an APRN
    // without CS, but never CS without the underlying APRN. So a satisfied CS
    // requirement can never leave the base APRN requirement unmet.
    if (aprnCs.status === "met" && aprn.status !== "met") {
      aprn.status = "met";
      aprn.note = "included with controlled-substance license";
    }
    out.push(aprn, aprnCs);
    out.push(credReq(ctx, "diploma", "Diploma / degree", isDiploma));
    out.push(credReq(ctx, "npi", "NPI", isNpi));
    out.push(credReq(ctx, "dea", "DEA registration", isDea));
    out.push(malpracticeReq(ctx));
    out.push(credReq(ctx, "cpr", "CPR / BLS or ACLS", isCprBls));
    out.push(credReq(ctx, "board", "Board certification", isBoardCert));
    if (isNewGradNp(creds) === true) {
      out.push(credReq(ctx, "supervision", "Supervision agreement (first ~2000 hrs)", isSupervision));
    }
  } else if (type === "pa") {
    out.push(credReq(ctx, "pa_license", "PA state license", isPaLicense));
    out.push(credReq(ctx, "diploma", "Diploma / degree", isDiploma));
    out.push(credReq(ctx, "npi", "NPI", isNpi));
    out.push(credReq(ctx, "dea", "DEA registration", isDea));
    out.push(malpracticeReq(ctx));
    out.push(credReq(ctx, "cpr", "CPR / BLS or ACLS", isCprBls));
    out.push(credReq(ctx, "board", "Board certification", isBoardCert));
  } else if (type === "therapist") {
    out.push(credReq(ctx, "diploma", "Diploma / degree", isDiploma));
    out.push(anyCredReq(ctx, "license_or_supervision", "State license or supervision agreement", [isAnyStateLicense, isSupervision]));
  } else if (type === "rn") {
    out.push(credReq(ctx, "diploma", "Diploma / degree", isDiploma));
    out.push(credReq(ctx, "board", "Board certification", isBoardCert));
    out.push(credReq(ctx, "rn", "RN state license", isRnLicense));
  }
  return out;
}

export interface RequirementSummary {
  type: ProviderType;
  results: RequirementResult[];
  met: number;
  total: number;
  gaps: RequirementResult[]; // missing or expired
}

export function summarizeRequirements(type: ProviderType, creds: CredentialRecord[], insurance: InsurancePolicyRecord[]): RequirementSummary {
  const results = evaluateRequirements(type, creds, insurance);
  const gaps = results.filter((r) => r.status !== "met");
  return { type, results, met: results.length - gaps.length, total: results.length, gaps };
}

const normName = (s?: string | null): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Count required credentials that are entirely MISSING (never on file) across
 * current clinical staff — for the compliance score. Only "missing" gaps count:
 * expired-but-present items are already penalized as expired credentials, so
 * counting them here too would double-charge the score. Former staff are skipped.
 * Lives here (not in compliance.ts) to keep the score module free of a cycle.
 */
export function countRequirementGaps(
  employees: Pick<Employee, "userId" | "firstName" | "lastName" | "employmentStatus" | "jobRole" | "title">[],
  credentials: CredentialRecord[],
  insurance: InsurancePolicyRecord[],
): number {
  let gaps = 0;
  for (const e of employees) {
    if (e.employmentStatus !== "active" && e.employmentStatus !== "on_leave") continue;
    const type = inferProviderType(e.jobRole, e.title);
    if (type === "none") continue;
    const uid = e.userId;
    const nm = normName(`${e.firstName} ${e.lastName}`);
    const match = (recUid?: string | null, recName?: string | null) =>
      (!!uid && !!recUid && recUid === uid) || (!!nm && normName(recName) === nm);
    const empCreds = credentials.filter((c) => match(c.employeeUserId, c.employeeName));
    const empIns = insurance.filter((p) => match(p.holderUserId, p.holderName));
    gaps += summarizeRequirements(type, empCreds, empIns).gaps.filter((g) => g.status === "missing").length;
  }
  return gaps;
}
