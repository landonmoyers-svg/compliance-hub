import { z } from "zod";

/**
 * Entity schemas (Zod) + inferred TS types for the Compliance Hub.
 *
 * This is the typed core consumed by the foundation + flagship dashboards.
 * It is intentionally structured so the remaining entities from the 65-entity
 * source digest can be added the same way. Enums are taken verbatim from the
 * source schemas. All reads/writes flow through the DataClient seam, so these
 * types are the single contract shared by mock and (future) real backends.
 */

/* ----------------------------- shared ----------------------------- */

const base = {
  id: z.string(),
  createdDate: z.string(), // ISO timestamp
};

export const accountRoles = [
  "owner",
  "admin",
  "hr",
  "clinical_leadership",
  "manager",
  "staff",
  "contractor",
  "read_only",
  "inactive",
] as const;
export const AccountRole = z.enum(accountRoles);
export type AccountRole = z.infer<typeof AccountRole>;

export const departments = [
  "ownership",
  "administration",
  "clinical",
  "hr",
  "billing",
  "front_desk",
  "operations",
  "contractor",
  "other",
] as const;
export const Department = z.enum(departments);

export const priorities = ["low", "medium", "high", "critical"] as const;
export const Priority = z.enum(priorities);
export type Priority = z.infer<typeof Priority>;

/* --------------------------- user/profile -------------------------- */

export const ComplianceUserProfile = z.object({
  ...base,
  userId: z.string(),
  fullName: z.string(),
  email: z.string().email(),
  accountRole: AccountRole,
  staffRole: z.string().optional(),
  professionalRole: z.string().optional(),
  department: Department.optional(),
  primaryLocationId: z.string().optional(),
  active: z.boolean().default(true),
});
export type ComplianceUserProfile = z.infer<typeof ComplianceUserProfile>;

/* ----------------------------- locations --------------------------- */

export const WorkLocation = z.object({
  ...base,
  name: z.string(),
  type: z.enum(["clinic", "office", "remote", "other"]).default("clinic"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  active: z.boolean().default(true),
});
export type WorkLocation = z.infer<typeof WorkLocation>;

/* ----------------------------- tasks ------------------------------- */

export const taskStatuses = [
  "open",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export const TaskStatus = z.enum(taskStatuses);

export const ComplianceTask = z.object({
  ...base,
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  status: TaskStatus.default("open"),
  priority: Priority.default("medium"),
  dueDate: z.string().nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  assignedToName: z.string().optional(),
  locationId: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});
export type ComplianceTask = z.infer<typeof ComplianceTask>;

/* --------------------------- credentials --------------------------- */

export const credentialTypes = [
  "license",
  "certification",
  "dea",
  "cpr_bls_acls",
  "immunization",
  "background_check",
  "other",
] as const;
export const CredentialType = z.enum(credentialTypes);

export const CredentialRecord = z.object({
  ...base,
  employeeUserId: z.string().nullable().optional(),
  employeeName: z.string(),
  credentialName: z.string(),
  credentialType: CredentialType.default("license"),
  issuingBody: z.string().optional(),
  credentialNumber: z.string().optional(),
  issueDate: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  documentUrl: z.string().nullable().optional(),
});
export type CredentialRecord = z.infer<typeof CredentialRecord>;

/* ---------------------------- documents ---------------------------- */

export const documentStatuses = [
  "draft",
  "active",
  "under_review",
  "archived",
] as const;
export const DocumentStatus = z.enum(documentStatuses);

export const ComplianceDocument = z.object({
  ...base,
  title: z.string(),
  documentType: z.string().default("policy"),
  complianceArea: z.string().optional(),
  summary: z.string().optional(),
  status: DocumentStatus.default("active"),
  accessLevel: z.enum(["all_staff", "clinical", "hr", "admin"]).default("all_staff"),
  version: z.string().default("1.0"),
  reviewDate: z.string().nullable().optional(),
  requiresAcknowledgment: z.boolean().default(false),
  fileUrl: z.string().nullable().optional(),
});
export type ComplianceDocument = z.infer<typeof ComplianceDocument>;

/* ----------------------------- training ---------------------------- */

export const TrainingModule = z.object({
  ...base,
  title: z.string(),
  description: z.string().optional(),
  trainingType: z.string().default("compliance"),
  frequencyMonths: z.number().nullable().optional(),
  passingScore: z.number().default(80),
  active: z.boolean().default(true),
});
export type TrainingModule = z.infer<typeof TrainingModule>;

export const assignmentStatuses = [
  "assigned",
  "in_progress",
  "completed",
] as const;
export const AssignmentStatus = z.enum(assignmentStatuses);

export const TrainingAssignment = z.object({
  ...base,
  trainingModuleId: z.string(),
  moduleTitle: z.string(),
  assignedToUserId: z.string(),
  assignedToName: z.string(),
  status: AssignmentStatus.default("assigned"),
  dueDate: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
});
export type TrainingAssignment = z.infer<typeof TrainingAssignment>;

/* ------------------------------ OSHA ------------------------------- */

export const OSHARecord = z.object({
  ...base,
  recordTitle: z.string(),
  recordType: z
    .enum([
      "injury",
      "illness",
      "hazcom",
      "training",
      "inspection",
      "corrective_action",
    ])
    .default("inspection"),
  eventDate: z.string().nullable().optional(),
  description: z.string().optional(),
  status: z.enum(["open", "in_progress", "closed"]).default("open"),
  recordabilityStatus: z
    .enum(["not_reviewed", "recordable", "non_recordable"])
    .default("not_reviewed"),
});
export type OSHARecord = z.infer<typeof OSHARecord>;

/* ------------------------------- SDS ------------------------------- */

export const SDSRecord = z.object({
  ...base,
  productName: z.string(),
  manufacturer: z.string().optional(),
  upc: z.string().optional(),
  signalWord: z.enum(["DANGER", "WARNING", "CAUTION", "NONE"]).default("NONE"),
  status: z.enum(["active", "missing", "needs_review", "archived"]).default("active"),
});
export type SDSRecord = z.infer<typeof SDSRecord>;

/* ------------------------------ risk ------------------------------- */

export const RiskManagementCase = z.object({
  ...base,
  caseTitle: z.string(),
  caseType: z.string().default("clinical"),
  description: z.string().optional(),
  severity: Priority.default("medium"),
  status: z.enum(["open", "investigating", "resolved", "closed"]).default("open"),
  accessLevel: z.enum(["standard", "restricted"]).default("standard"),
  reportedByName: z.string().optional(),
  incidentDate: z.string().nullable().optional(),
});
export type RiskManagementCase = z.infer<typeof RiskManagementCase>;

/* ------------------------ policy acknowledgments ------------------- */

export const PolicyAcknowledgment = z.object({
  ...base,
  userId: z.string(),
  userName: z.string(),
  documentId: z.string(),
  documentTitle: z.string(),
  status: z.enum(["acknowledged", "expired"]).default("acknowledged"),
  acknowledgedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
export type PolicyAcknowledgment = z.infer<typeof PolicyAcknowledgment>;

/* --------------------------- regulatory ---------------------------- */

export const RegulatorySource = z.object({
  ...base,
  title: z.string(),
  citationLabel: z.string().optional(),
  issuingBody: z.string().optional(),
  sourceType: z
    .enum(["regulation", "guidance", "internal", "statute"])
    .default("regulation"),
  jurisdiction: z.string().optional(),
  reviewStatus: z
    .enum(["current", "needs_review", "under_review", "archived"])
    .default("current"),
  lastCheckedAt: z.string().nullable().optional(),
  officialUrl: z.string().nullable().optional(),
});
export type RegulatorySource = z.infer<typeof RegulatorySource>;

/* ---------------------------- insurance ---------------------------- */

export const InsurancePolicyRecord = z.object({
  ...base,
  policyName: z.string(),
  policyType: z.string().default("malpractice"),
  carrierName: z.string().optional(),
  policyNumber: z.string().optional(),
  coverageAmountCents: z.number().nullable().optional(),
  annualPremiumCents: z.number().nullable().optional(),
  renewalDate: z.string().nullable().optional(),
});
export type InsurancePolicyRecord = z.infer<typeof InsurancePolicyRecord>;

/* --------------------------- emergency ----------------------------- */

export const EmergencyDrill = z.object({
  ...base,
  drillTitle: z.string(),
  drillType: z.string().default("fire"),
  scheduledDate: z.string().nullable().optional(),
  status: z.enum(["scheduled", "completed", "cancelled"]).default("scheduled"),
  participantCount: z.number().default(0),
});
export type EmergencyDrill = z.infer<typeof EmergencyDrill>;

/* ---------------------------- employees ---------------------------- */

export const Employee = z.object({
  ...base,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  title: z.string().optional(),
  department: Department.optional(),
  employmentStatus: z
    .enum(["active", "on_leave", "terminated", "resigned", "laid_off"])
    .default("active"),
  hireDate: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
});
export type Employee = z.infer<typeof Employee>;

/* ----------------------------- inventory --------------------------- */

export const InventoryItem = z.object({
  ...base,
  itemName: z.string(),
  itemType: z.string().default("equipment"),
  status: z.enum(["active", "broken", "removed"]).default("active"),
  condition: z.enum(["new", "good", "fair", "poor"]).default("good"),
  locationId: z.string().nullable().optional(),
  removedFromInventory: z.boolean().default(false),
});
export type InventoryItem = z.infer<typeof InventoryItem>;
