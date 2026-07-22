import type { Employee, LifecycleKind, LifecycleTask } from "./data/schema";
import { inferProviderType, evaluateRequirements } from "./credential-requirements";

/**
 * Employee lifecycle checklists. Onboarding and offboarding are the same shape —
 * a list of items with a status — generated from a standard template plus, for
 * onboarding, the role-specific credentials the requirements engine already
 * knows a clinician must have. One place defines "what a complete on/off-boarding
 * looks like" so the workflow can't silently miss a step.
 */

export interface LifecycleItemDef {
  itemKey: string;
  label: string;
  category: LifecycleTask["category"];
}

const ONBOARDING_BASE: LifecycleItemDef[] = [
  { itemKey: "app_access", label: "Provision app login & system access", category: "access" },
  { itemKey: "email_setup", label: "Set up email account", category: "access" },
  { itemKey: "i9", label: "Collect Form I-9 (employment eligibility)", category: "hr_documents" },
  { itemKey: "w4", label: "Collect Form W-4 (tax withholding)", category: "hr_documents" },
  { itemKey: "direct_deposit", label: "Set up direct deposit", category: "hr_documents" },
  { itemKey: "emergency_contact", label: "Collect emergency contact information", category: "hr_documents" },
  { itemKey: "benefits_enroll", label: "Benefits enrollment", category: "hr_documents" },
  { itemKey: "handbook_ack", label: "Employee handbook acknowledgment", category: "compliance" },
  { itemKey: "hipaa_training", label: "Assign HIPAA / compliance training", category: "training" },
  { itemKey: "equipment_issue", label: "Issue equipment (laptop, badge, keys)", category: "equipment" },
];

const OFFBOARDING: LifecycleItemDef[] = [
  { itemKey: "revoke_app_access", label: "Deactivate app login & system access", category: "access" },
  { itemKey: "revoke_email", label: "Disable email & remove forwarding rules", category: "access" },
  { itemKey: "revoke_building", label: "Revoke building / facility access", category: "access" },
  { itemKey: "collect_equipment", label: "Collect keys, badge, laptop & devices", category: "equipment" },
  { itemKey: "cobra_notice", label: "Send COBRA / benefits continuation notice", category: "hr_documents" },
  { itemKey: "final_pay", label: "Process final paycheck & PTO payout", category: "hr_documents" },
  { itemKey: "exit_interview", label: "Conduct exit interview", category: "hr_documents" },
  { itemKey: "final_attestations", label: "Collect final compliance attestations", category: "compliance" },
  { itemKey: "payer_removal", label: "Remove from payer panels / notify payers", category: "compliance" },
  { itemKey: "records_retention", label: "Retain personnel records per retention policy", category: "compliance" },
];

/** The onboarding checklist for a specific employee: standard items plus the
 *  credentials their clinical role requires (from the requirements engine). */
export function buildOnboardingItems(e: Pick<Employee, "jobRole" | "title">): LifecycleItemDef[] {
  const type = inferProviderType(e.jobRole, e.title);
  const credItems: LifecycleItemDef[] =
    type === "none"
      ? []
      : evaluateRequirements(type, [], []).map((r) => ({
          itemKey: `collect_${r.key}`,
          label: `Collect ${r.label}`,
          category: "credentials" as const,
        }));
  return [...ONBOARDING_BASE, ...credItems];
}

export function buildOffboardingItems(): LifecycleItemDef[] {
  return OFFBOARDING;
}

export function itemsForKind(kind: LifecycleKind, e: Pick<Employee, "jobRole" | "title">): LifecycleItemDef[] {
  return kind === "onboarding" ? buildOnboardingItems(e) : buildOffboardingItems();
}

/**
 * Create a checklist for an employee if one of that kind doesn't already exist.
 * Idempotent (guards on existing tasks) so it's safe to call from the employee
 * save flow on hire/terminate. Returns the number of items created.
 */
export async function ensureChecklist(
  kind: LifecycleKind,
  employee: Pick<Employee, "id" | "firstName" | "lastName" | "jobRole" | "title">,
  existing: LifecycleTask[],
  create: (data: Omit<LifecycleTask, "id" | "createdDate">) => Promise<unknown>,
): Promise<number> {
  if (existing.some((t) => t.employeeId === employee.id && t.kind === kind)) return 0;
  const employeeName = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();
  const items = itemsForKind(kind, employee);
  for (const it of items) {
    await create({
      employeeId: employee.id,
      employeeName,
      kind,
      itemKey: it.itemKey,
      label: it.label,
      category: it.category,
      status: "pending",
    });
  }
  return items.length;
}

export const LIFECYCLE_CATEGORY_LABEL: Record<LifecycleTask["category"], string> = {
  access: "Access & systems",
  credentials: "Credentials & licenses",
  hr_documents: "HR documents",
  equipment: "Equipment",
  training: "Training",
  compliance: "Compliance",
  other: "Other",
};
