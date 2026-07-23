import { daysUntil } from "@/lib/dates";
import { buildHolderIndex, holderIsActive, supersededInsuranceIds } from "@/lib/compliance";
import { supersededCredentialIds } from "@/lib/credentials";
import type {
  CredentialRecord, TrainingAssignment, ComplianceDocument, CorrectiveAction,
  SraFinding, Incident, BreachAssessment, InsurancePolicyRecord, VendorRecord, ComplianceTask, Employee,
} from "@/lib/data/schema";

export type Bucket = "overdue" | "today" | "week" | "horizon";

export interface WorkItem {
  key: string;
  category: string;
  title: string;
  why: string;
  dueDate: string | null;
  daysUntil: number | null;
  risk: 0 | 1 | 2 | 3;   // 3 = critical
  bucket: Bucket;
  href: string;
  score: number;
}

export interface AgendaInput {
  horizonDays: number;
  showLow: boolean;
  snoozed: Set<string>;
  credentials: CredentialRecord[];
  training: TrainingAssignment[];
  documents: ComplianceDocument[];
  correctiveActions: CorrectiveAction[];
  sraFindings: SraFinding[];
  incidents: Incident[];
  breaches: BreachAssessment[];
  insurance: InsurancePolicyRecord[];
  vendors: VendorRecord[];
  tasks: ComplianceTask[];
  screeningDueCount: number;
  lastBackupAt?: string | null;
  /** Directory used for context: former employees' expired credentials and
   *  unfinished training are history, not agenda items. */
  employees?: Pick<Employee, "userId" | "firstName" | "lastName" | "employmentStatus">[];
}

// Fixed high-value regulatory deadlines to surface proactively.
const REGULATORY: { key: string; title: string; why: string; date: string; risk: 2 }[] = [
  { key: "reg:dea-telemed-2026", title: "DEA telemedicine prescribing flexibility expires", why: "The controlled-substance tele-prescribing flexibility sunsets 12/31/2026 — confirm the permanent rule and update policy.", date: "2026-12-31", risk: 2 },
];

function bucketFor(days: number | null): Bucket {
  if (days === null) return "horizon";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return "horizon";
}

function scoreFor(risk: number, days: number | null): number {
  // Higher = more urgent. Overdue and higher-risk float to the top.
  const overdueBoost = days !== null && days < 0 ? 200 + Math.min(60, -days) : 0;
  const proximity = days === null ? 0 : Math.max(0, 60 - Math.max(0, days));
  return risk * 100 + overdueBoost + proximity;
}

/** Fuse every due-dated compliance signal into one ranked, bucketed plan. */
export function buildAgenda(input: AgendaInput): WorkItem[] {
  const { horizonDays, showLow, snoozed } = input;
  const items: WorkItem[] = [];
  const add = (
    key: string, category: string, title: string, why: string,
    dueDate: string | null, risk: 0 | 1 | 2 | 3, href: string,
  ) => {
    if (snoozed.has(key)) return;
    const d = dueDate ? daysUntil(dueDate) : null;
    const bucket = bucketFor(d);
    // Keep overdue always; otherwise within the horizon window.
    if (d !== null && d > 0 && d > horizonDays && category !== "regulatory" && category !== "breach") return;
    items.push({ key, category, title, why, dueDate, daysUntil: d, risk, bucket, href, score: scoreFor(risk, d) });
  };

  // Context filter: skip items whose person no longer works here.
  const holderIdx = buildHolderIndex(input.employees ?? []);
  const activeHolder = (rec: { employeeUserId?: string | null; employeeName?: string | null }) =>
    !input.employees || holderIsActive(rec, holderIdx);

  // Credentials — skip any that a newer credential of the same kind replaces,
  // so an expired license with a current renewal on file isn't surfaced.
  const supersededCreds = supersededCredentialIds(input.credentials);
  for (const c of input.credentials) {
    if (!activeHolder(c)) continue;
    if (supersededCreds.has(c.id)) continue;
    if (!c.expirationDate) continue;
    const d = daysUntil(c.expirationDate);
    if (d === null || d > horizonDays) continue;
    const risk: 0 | 1 | 2 | 3 = d < 0 ? 3 : 2;
    add(`cred:${c.id}`, "credential", `${c.credentialName} — ${c.employeeName}`, d < 0 ? "Credential has expired." : "Credential is expiring soon.", c.expirationDate, risk, "/credentials");
  }
  // Training
  for (const t of input.training) {
    if (!activeHolder({ employeeUserId: t.assignedToUserId, employeeName: t.assignedToName })) continue;
    if (t.status === "completed" || !t.dueDate) continue;
    const d = daysUntil(t.dueDate);
    if (d === null || d > horizonDays) continue;
    add(`tr:${t.id}`, "training", `${t.moduleTitle} — ${t.assignedToName}`, d < 0 ? "Training is overdue." : "Training is due.", t.dueDate, d < 0 ? 2 : 1, "/training");
  }
  // Document reviews
  for (const doc of input.documents) {
    if (doc.status !== "active" || !doc.reviewDate) continue;
    const d = daysUntil(doc.reviewDate);
    if (d === null || d > horizonDays) continue;
    add(`doc:${doc.id}`, "document", `Review: ${doc.title}`, d < 0 ? "Policy is past its review date." : "Policy review is coming due.", doc.reviewDate, d < 0 ? 2 : 1, "/sop-library");
  }
  // Corrective actions
  for (const c of input.correctiveActions) {
    if (c.status === "complete" || c.status === "cancelled") continue;
    add(`capa:${c.id}`, "capa", `Corrective action: ${c.title}`, "Corrective action is open — drive it to closure.", c.dueDate ?? null, (c.dueDate && (daysUntil(c.dueDate) ?? 0) < 0) ? 3 : 2, "/incidents");
  }
  // SRA remediations
  for (const f of input.sraFindings) {
    if (f.riskLevel !== "high" && f.riskLevel !== "medium") continue;
    if (f.remediationStatus === "complete" || f.remediationStatus === "accepted") continue;
    add(`sra:${f.id}`, "sra", `Remediate: ${f.question.replace(/\s*\(§.*\)$/, "")}`, `${f.riskLevel === "high" ? "High" : "Medium"}-risk security finding needs remediation.`, f.remediationDue ?? null, f.riskLevel === "high" ? 3 : 2, "/security-risk-assessment");
  }
  // Open incidents (high/critical, or lacking a plan)
  for (const i of input.incidents) {
    if (i.status === "closed") continue;
    const risk: 0 | 1 | 2 | 3 = i.severity === "critical" ? 3 : i.severity === "high" ? 2 : 1;
    if (risk === 1 && !showLow) continue;
    add(`inc:${i.id}`, "incident", `Open incident: ${i.title}`, `${i.severity} incident is ${i.status.replace("_", " ")}.`, null, risk, "/incidents");
  }
  // Reportable breaches with a 60-day clock
  for (const b of input.breaches) {
    if (b.determination !== "reportable_breach" || !b.discoveredDate) continue;
    const deadline = new Date(new Date(b.discoveredDate).getTime() + 60 * 864e5).toISOString();
    add(`breach:${b.id}`, "breach", `Notify: ${b.title}`, "Reportable breach — 60-day notification deadline.", deadline, 3, "/breach-assessment");
  }
  // Insurance renewals — skip policies a newer term of the same coverage line
  // replaces, so an expired policy with a current renewal isn't surfaced.
  const supersededPolicies = supersededInsuranceIds(input.insurance);
  for (const p of input.insurance) {
    if (supersededPolicies.has(p.id)) continue;
    if (!p.renewalDate) continue;
    const d = daysUntil(p.renewalDate);
    if (d === null || d > horizonDays) continue;
    add(`ins:${p.id}`, "insurance", `Renew: ${p.policyName}`, d < 0 ? "Policy renewal is past due." : "Insurance renewal is coming up.", p.renewalDate, 2, "/insurance-vault");
  }
  // Vendor BAAs / reviews
  for (const v of input.vendors) {
    if (v.baaRequired && v.baaStatus === "expired") add(`baa:${v.id}`, "vendor", `BAA expired: ${v.vendorName}`, "Business Associate Agreement has expired.", null, 3, "/vendor-management");
    else if (v.nextReviewDate) {
      const d = daysUntil(v.nextReviewDate);
      if (d !== null && d <= horizonDays) add(`ven:${v.id}`, "vendor", `Vendor review: ${v.vendorName}`, "Vendor review is due.", v.nextReviewDate, 1, "/vendor-management");
    }
  }
  // Exclusion screening (aggregate)
  if (input.screeningDueCount > 0) {
    add("screen:due", "screening", `${input.screeningDueCount} subject${input.screeningDueCount === 1 ? "" : "s"} due for exclusion screening`, "OIG-LEIE / SAM screening is recommended monthly.", null, 2, "/exclusion-screening");
  }
  // Weekly data backup (HIPAA contingency plan best practice).
  {
    const since = input.lastBackupAt ? -(daysUntil(input.lastBackupAt) ?? 0) : null;
    if (since === null || since >= 7) {
      add("backup:due", "backup", "Back up compliance data (offsite)", since === null ? "No backup on record — take an offsite backup." : `Last backup was ${since} days ago; back up at least weekly.`, null, 2, "/backup");
    }
  }
  // Regulatory deadlines
  for (const r of REGULATORY) add(r.key, "regulatory", r.title, r.why, r.date, r.risk, "/regulatory-sources");
  // Tasks
  for (const t of input.tasks) {
    if (t.status !== "open" && t.status !== "in_progress") continue;
    const risk: 0 | 1 | 2 | 3 = t.priority === "critical" ? 3 : t.priority === "high" ? 2 : t.priority === "medium" ? 1 : 0;
    if (risk === 0 && !showLow) continue;
    add(`task:${t.id}`, "task", t.title, "Open task.", t.dueDate ?? null, risk, "/");
  }

  const filtered = showLow ? items : items.filter((i) => i.risk >= 1 || i.bucket === "overdue");
  return filtered.sort((a, b) => b.score - a.score);
}

export function groupByBucket(items: WorkItem[]): Record<Bucket, WorkItem[]> {
  const g: Record<Bucket, WorkItem[]> = { overdue: [], today: [], week: [], horizon: [] };
  for (const i of items) g[i.bucket].push(i);
  return g;
}
