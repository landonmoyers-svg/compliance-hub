import { z } from "zod";
import { DEFAULT_ORG_NAME } from "@/lib/org";

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
  // Reference coordinates used to guess a location from photo GPS metadata.
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
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
  // Extracted full text, used for search and to ground the SOP Assistant.
  content: z.string().nullable().optional(),
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
  // OSHA 300/301 injury/illness detail (only relevant for injury/illness records).
  injuredEmployeeName: z.string().optional(),
  injuredEmployeeUserId: z.string().nullable().optional(),
  bodyPart: z.string().optional(),
  natureOfInjury: z.string().optional(),
  // OSHA 300 case-outcome classification (columns G–J).
  caseOutcome: z
    .enum(["death", "days_away", "restricted_transfer", "other_recordable", "first_aid_only"])
    .nullable()
    .optional(),
  daysAway: z.number().nullable().optional(),
  daysRestricted: z.number().nullable().optional(),
  treatmentBeyondFirstAid: z.boolean().optional(),
  physicianName: z.string().optional(),
  // Uploaded OSHA 301 / medical / incident document.
  documentUrl: z.string().nullable().optional(),
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

/* --------------------- incidents & corrective actions --------------------- */

export const incidentCategories = [
  "privacy_hipaa", "safety_osha", "billing", "hr_conduct", "medication", "security", "other",
] as const;

// The kind of report — drives the intake fields, anonymity rules, and routing
// (HIPAA → breach assessment, injury → OSHA record). See incidents page.
export const incidentReportTypes = [
  "hipaa_privacy", "injury", "patient_safety", "staff_conduct", "whistleblower", "other",
] as const;

export const Incident = z.object({
  ...base,
  title: z.string(),
  reportType: z.enum(incidentReportTypes).default("other"),
  category: z.enum(incidentCategories).default("other"),
  description: z.string().optional(),
  severity: Priority.default("medium"),
  status: z.enum(["new", "triaged", "investigating", "corrective_action", "closed"]).default("new"),
  anonymous: z.boolean().default(false),
  // The reporter checked the truthfulness attestation (signed reports only).
  attested: z.boolean().default(false),
  reportedByUserId: z.string().nullable().optional(),
  reportedByName: z.string().optional(),
  locationId: z.string().nullable().optional(),
  occurredDate: z.string().nullable().optional(),
  // Optional supporting evidence (photo/document) uploaded with the report.
  evidenceUrl: z.string().nullable().optional(),
  resolutionSummary: z.string().optional(),
});
export type Incident = z.infer<typeof Incident>;

export const CorrectiveAction = z.object({
  ...base,
  incidentId: z.string().nullable().optional(),
  riskCaseId: z.string().nullable().optional(),
  title: z.string(),
  rootCause: z.string().optional(),
  actionPlan: z.string().optional(),
  ownerName: z.string().optional(),
  ownerUserId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["open", "in_progress", "verifying", "complete", "cancelled"]).default("open"),
  verifiedByName: z.string().optional(),
  verifiedDate: z.string().nullable().optional(),
});
export type CorrectiveAction = z.infer<typeof CorrectiveAction>;

/* --------------------- HIPAA breach risk assessment --------------------- */

const RiskRating = z.enum(["low", "medium", "high"]);

export const BreachAssessment = z.object({
  ...base,
  title: z.string(),
  discoveredDate: z.string().nullable().optional(),
  description: z.string().optional(),
  factor1Nature: z.string().optional(),
  factor1Rating: RiskRating.default("medium"),
  factor2Recipient: z.string().optional(),
  factor2Rating: RiskRating.default("medium"),
  factor3Acquired: z.string().optional(),
  factor3Rating: RiskRating.default("medium"),
  factor4Mitigation: z.string().optional(),
  factor4Rating: RiskRating.default("medium"),
  probability: RiskRating.default("medium"),
  determination: z.enum(["not_a_breach", "low_probability", "reportable_breach", "undetermined"]).default("undetermined"),
  status: z.enum(["draft", "final"]).default("draft"),
  assessedByName: z.string().optional(),
  notes: z.string().optional(),
});
export type BreachAssessment = z.infer<typeof BreachAssessment>;

/* --------------------- security risk assessment (SRA) --------------------- */

export const SraAssessment = z.object({
  ...base,
  title: z.string(),
  periodYear: z.number().default(0),
  status: z.enum(["in_progress", "complete"]).default("in_progress"),
  startedDate: z.string().nullable().optional(),
  completedDate: z.string().nullable().optional(),
  completedByName: z.string().optional(),
  scopeNotes: z.string().optional(),
});
export type SraAssessment = z.infer<typeof SraAssessment>;

export const SraFinding = z.object({
  ...base,
  assessmentId: z.string(),
  category: z.enum(["administrative", "physical", "technical", "organizational"]).default("administrative"),
  question: z.string(),
  response: z.string().optional(),
  status: z.enum(["na", "yes", "partial", "no"]).default("na"),
  evidence: z.array(z.string()).default([]),
  citation: z.string().optional(),
  aiSuggested: z.boolean().default(false),
  riskLevel: z.enum(["na", "low", "medium", "high"]).default("na"),
  remediation: z.string().optional(),
  remediationOwner: z.string().optional(),
  remediationDue: z.string().nullable().optional(),
  remediationStatus: z.enum(["none", "open", "in_progress", "complete", "accepted"]).default("none"),
  notes: z.string().optional(),
});
export type SraFinding = z.infer<typeof SraFinding>;

/* --------------------- exclusion / sanction screening --------------------- */

export const ExclusionScreening = z.object({
  ...base,
  subjectType: z.enum(["staff", "vendor", "other"]).default("staff"),
  subjectName: z.string(),
  subjectUserId: z.string().nullable().optional(),
  vendorId: z.string().nullable().optional(),
  sources: z.string().optional(),                 // which lists were checked
  screenedDate: z.string().nullable().optional(),
  result: z.enum(["clear", "hit", "pending"]).default("clear"),
  notes: z.string().optional(),
  screenedByName: z.string().optional(),
  // Storage path to the uploaded OIG/SAM result PDF/screenshot — dated audit proof.
  documentUrl: z.string().nullable().optional(),
});
export type ExclusionScreening = z.infer<typeof ExclusionScreening>;

/* --------------------- chief of staff (agent) --------------------- */

export const CcoPreference = z.object({
  ...base,
  userId: z.string(),
  horizonDays: z.number().default(30),
  showLow: z.boolean().default(false),
  focusAreas: z.string().optional(),
  agentNotes: z.string().optional(),   // freeform preferences the agent learns
});
export type CcoPreference = z.infer<typeof CcoPreference>;

export const ActivityLog = z.object({
  ...base,
  actorType: z.enum(["user", "ai"]).default("user"),
  actorName: z.string().nullable().optional(),
  assistant: z.string().nullable().optional(),
  action: z.string().default("create"),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  summary: z.string(),
  reversible: z.boolean().default(false),
  undone: z.boolean().default(false),
  undoneAt: z.string().nullable().optional(),
  undoneBy: z.string().nullable().optional(),
});
export type ActivityLog = z.infer<typeof ActivityLog>;

export const BackupRecord = z.object({
  ...base,
  performedBy: z.string().nullable().optional(),
  itemCount: z.number().default(0),
  format: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type BackupRecord = z.infer<typeof BackupRecord>;

export const AgendaSnooze = z.object({
  ...base,
  userId: z.string(),
  itemKey: z.string(),
  snoozedUntil: z.string().nullable().optional(),
});
export type AgendaSnooze = z.infer<typeof AgendaSnooze>;

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

/* ------------------------- version history ------------------------- */

// One immutable row per superseded/deleted version of a governed record
// (documents, credentials, vendors, employee_documents). Written server-side
// by a DB trigger; never created or mutated from the client.
export const RecordVersion = z.object({
  ...base,
  entityType: z.string(),
  entityId: z.string(),
  versionNum: z.number(),
  changeKind: z.enum(["update", "delete"]),
  effectiveFrom: z.string().nullable().optional(), // when this version took effect
  supersededAt: z.string().nullable().optional(),  // when it was replaced/deleted
  changedBy: z.string().nullable().optional(),
  filePath: z.string().nullable().optional(),
  snapshot: z.record(z.string(), z.unknown()).default({}),
});
export type RecordVersion = z.infer<typeof RecordVersion>;

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
  // Optional individual holder — for policies tied to a person (e.g. an
  // individual malpractice rider). Org-wide policies leave these blank.
  holderUserId: z.string().nullable().optional(),
  holderName: z.string().nullable().optional(),
  documentUrl: z.string().nullable().optional(),
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
  // Optional — a person can be recorded without an email (e.g. a former or
  // contract worker). Required only when provisioning an app login. "" = none.
  email: z.string().email().or(z.literal("")).default(""),
  title: z.string().optional(),
  department: Department.optional(),
  employmentStatus: z
    .enum(["active", "on_leave", "terminated", "resigned", "laid_off"])
    .default("active"),
  workerType: z.enum(["employee", "contractor"]).optional(),
  hireDate: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  // Links to the auth login/profile when the employee has been invited to the app.
  userId: z.string().nullable().optional(),
  // Chain of command + position (drives role-based training/credential requirements).
  managerId: z.string().nullable().optional(),
  jobRole: z.string().nullable().optional(),
  // Dotted-line / matrix reporting (e.g. "also reports to Josh for business").
  reportsNote: z.string().nullable().optional(),
});

export const Audit = z.object({
  ...base,
  title: z.string(),
  auditType: z.enum(["internal", "mock_hipaa", "mock_osha", "payer", "other"]).default("internal"),
  auditDate: z.string().nullable().optional(),
  auditorName: z.string().optional(),
  status: z.enum(["planned", "in_progress", "complete"]).default("in_progress"),
  scopeNotes: z.string().optional(),
});
export type Audit = z.infer<typeof Audit>;

export const AuditItem = z.object({
  ...base,
  auditId: z.string(),
  category: z.string().default("general"),
  question: z.string(),
  result: z.enum(["pass", "fail", "partial", "na"]).default("na"),
  severity: z.enum(["low", "medium", "high"]).default("low"),
  finding: z.string().optional(),
  remediation: z.string().optional(),
  remediationOwner: z.string().optional(),
  remediationDue: z.string().nullable().optional(),
  remediationStatus: z.enum(["none", "open", "in_progress", "complete", "accepted"]).default("none"),
  citation: z.string().optional(),
  aiSuggested: z.boolean().default(false),
});
export type AuditItem = z.infer<typeof AuditItem>;

export const RoleRequirement = z.object({
  ...base,
  jobRole: z.string(),
  reqType: z.enum(["training", "credential"]).default("training"),
  name: z.string(),
  notes: z.string().optional(),
});
export type RoleRequirement = z.infer<typeof RoleRequirement>;
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
  // AI / image-assisted fields
  quantity: z.number().default(1),
  description: z.string().nullable().optional(),
  estimatedValueCents: z.number().nullable().optional(),
  sublocation: z.string().nullable().optional(),   // e.g. "Supply Closet A, Shelf 2"
  imageUrl: z.string().nullable().optional(),        // storage object path
  capturedAt: z.string().nullable().optional(),      // EXIF DateTimeOriginal
  capturedLat: z.number().nullable().optional(),     // EXIF GPS
  capturedLng: z.number().nullable().optional(),
  aiIdentified: z.boolean().default(false),
  aiConfidence: z.string().nullable().optional(),
});
export type InventoryItem = z.infer<typeof InventoryItem>;

/* ------------------------- HR: time clock -------------------------- */

export const TimeClockEntry = z.object({
  ...base,
  userId: z.string(),
  userName: z.string(),
  clockInAt: z.string(), // ISO timestamp
  clockOutAt: z.string().nullable().optional(),
  totalMinutes: z.number().nullable().optional(),
  status: z.enum(["active", "completed", "edited"]).default("active"),
  editNote: z.string().nullable().optional(),
  editedByName: z.string().nullable().optional(),
});
export type TimeClockEntry = z.infer<typeof TimeClockEntry>;

/* ------------------------- HR: time off ---------------------------- */

export const timeOffTypes = [
  "pto",
  "sick",
  "fmla",
  "maternity",
  "paternity",
  "bereavement",
  "jury_duty",
  "unpaid",
  "holiday",
  "other",
] as const;
export const TimeOffType = z.enum(timeOffTypes);
export type TimeOffType = z.infer<typeof TimeOffType>;

export const TimeOffRequest = z.object({
  ...base,
  userId: z.string(),
  userName: z.string(),
  requestType: TimeOffType.default("pto"),
  startDate: z.string(),
  endDate: z.string(),
  hours: z.number().default(0),
  reason: z.string().optional(),
  status: z.enum(["pending", "approved", "denied", "cancelled"]).default("pending"),
  reviewerName: z.string().nullable().optional(),
  reviewNote: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
});
export type TimeOffRequest = z.infer<typeof TimeOffRequest>;

export const PTOBalance = z.object({
  ...base,
  userId: z.string(),
  userName: z.string(),
  year: z.number(),
  ptoAccruedHours: z.number().default(0),
  ptoUsedHours: z.number().default(0),
  sickAccruedHours: z.number().default(0),
  sickUsedHours: z.number().default(0),
  holidayAllottedHours: z.number().default(0),
  holidayUsedHours: z.number().default(0),
  carryOverHours: z.number().default(0),
});
export type PTOBalance = z.infer<typeof PTOBalance>;

/* ------------------------- HR: payroll ----------------------------- */

export const PayrollRecord = z.object({
  ...base,
  employeeId: z.string(),
  employeeName: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  regularHours: z.number().default(0),
  otHours: z.number().default(0),
  ptoHours: z.number().default(0),
  grossPayCents: z.number().default(0),
  federalTaxCents: z.number().default(0),
  stateTaxCents: z.number().default(0),
  socialSecurityCents: z.number().default(0),
  medicareCents: z.number().default(0),
  healthInsuranceCents: z.number().default(0),
  retirement401kCents: z.number().default(0),
  otherDeductionsCents: z.number().default(0),
  netPayCents: z.number().default(0),
  paymentMethod: z.enum(["direct_deposit", "check", "cash"]).default("direct_deposit"),
  status: z.enum(["draft", "approved", "paid", "voided"]).default("draft"),
});
export type PayrollRecord = z.infer<typeof PayrollRecord>;

/* --------------------- HR: performance reviews --------------------- */

export const reviewTypes = [
  "quarterly",
  "annual",
  "mid_year",
  "probationary",
  "ninety_day",
  "pip",
  "exit",
] as const;
export const ReviewType = z.enum(reviewTypes);
export type ReviewType = z.infer<typeof ReviewType>;

export const PerformanceRock = z.object({
  title: z.string(),
  status: z.enum(["on_track", "complete", "off_track"]).default("on_track"),
});
export type PerformanceRock = z.infer<typeof PerformanceRock>;

export const PerformanceReview = z.object({
  ...base,
  employeeId: z.string(),
  employeeName: z.string(),
  reviewType: ReviewType.default("quarterly"),
  reviewDate: z.string().nullable().optional(),
  getsIt: z.boolean().default(false),
  wantsIt: z.boolean().default(false),
  hasCapacity: z.boolean().default(false),
  rightPersonRightSeat: z
    .enum(["yes", "wrong_seat", "wrong_person", "no"])
    .default("yes"),
  overallRating: z
    .enum(["exceeds_expectations", "meets_expectations", "needs_improvement", "unsatisfactory"])
    .default("meets_expectations"),
  rocks: z.array(PerformanceRock).default([]),
  notes: z.string().optional(),
  reviewerName: z.string().optional(),
  status: z.enum(["scheduled", "in_progress", "completed"]).default("scheduled"),
});
export type PerformanceReview = z.infer<typeof PerformanceReview>;

/* ----------------------- HR: disciplinary -------------------------- */

export const DisciplinaryAction = z.object({
  ...base,
  employeeId: z.string(),
  employeeName: z.string(),
  actionType: z
    .enum([
      "verbal_warning",
      "written_warning",
      "final_warning",
      "pip",
      "suspension",
      "termination",
      "other",
    ])
    .default("verbal_warning"),
  reason: z.string(),
  description: z.string().optional(),
  witnessNames: z.array(z.string()).default([]),
  issuedDate: z.string().nullable().optional(),
  followUpDate: z.string().nullable().optional(),
  issuedByName: z.string().optional(),
  status: z.enum(["active", "resolved", "escalated", "archived"]).default("active"),
  resolutionNote: z.string().nullable().optional(),
});
export type DisciplinaryAction = z.infer<typeof DisciplinaryAction>;

/* ------------------------- HR: benefits ---------------------------- */

export const Benefit = z.object({
  ...base,
  benefitType: z
    .enum([
      "health",
      "dental",
      "vision",
      "life_insurance",
      "disability",
      "retirement_401k",
      "pto",
      "fsa",
      "hsa",
      "other",
    ])
    .default("health"),
  provider: z.string().optional(),
  planName: z.string(),
  policyNumber: z.string().optional(),
  employerContributionCents: z.number().default(0),
  employeeContributionCents: z.number().default(0),
  eligibilityRules: z.string().optional(),
  enrollmentDeadline: z.string().nullable().optional(),
  renewalDate: z.string().nullable().optional(),
  contactPhone: z.string().optional(),
  enrollmentUrl: z.string().nullable().optional(),
  enrolledCount: z.number().default(0),
  eligibleCount: z.number().default(0),
  active: z.boolean().default(true),
});
export type Benefit = z.infer<typeof Benefit>;

/* --------------------------- vendors ------------------------------- */

export const VendorRecord = z.object({
  ...base,
  vendorName: z.string(),
  vendorType: z
    .enum([
      "business_associate",
      "contractor",
      "supplier",
      "service_provider",
      "consultant",
      "other",
    ])
    .default("service_provider"),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  hasAccessToPHI: z.boolean().default(false),
  baaRequired: z.boolean().default(false),
  baaStatus: z
    .enum(["not_required", "pending", "signed", "expired", "under_review"])
    .default("not_required"),
  baaSignedDate: z.string().nullable().optional(),
  // Uploaded signed BAA document (private bucket path).
  baaDocumentUrl: z.string().nullable().optional(),
  insuranceExpirationDate: z.string().nullable().optional(),
  // Uploaded certificate of insurance (COI) document (private bucket path).
  insuranceDocumentUrl: z.string().nullable().optional(),
  nextReviewDate: z.string().nullable().optional(),
  status: z
    .enum(["active", "pending", "suspended", "terminated", "under_review"])
    .default("active"),
  notes: z.string().optional(),
});
export type VendorRecord = z.infer<typeof VendorRecord>;

/* ------------------------- competency ------------------------------ */

export const CompetencyRecord = z.object({
  ...base,
  employeeId: z.string().nullable().optional(),
  employeeName: z.string(),
  competencyName: z.string(),
  competencyType: z
    .enum(["clinical", "safety", "technical", "administrative", "other"])
    .default("clinical"),
  evaluatorName: z.string().optional(),
  assessmentDate: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  status: z
    .enum(["pending", "evaluated", "passed", "failed", "expired"])
    .default("pending"),
  notes: z.string().optional(),
});
export type CompetencyRecord = z.infer<typeof CompetencyRecord>;

/* ------------------------- audit log ------------------------------- */

export const auditActions = [
  "view",
  "create",
  "update",
  "delete",
  "export",
  "login",
  "logout",
  "failed_login",
  "acknowledge",
  "sign",
] as const;
export const AuditAction = z.enum(auditActions);

export const AuditLog = z.object({
  ...base,
  actorName: z.string(),
  actorEmail: z.string().optional(),
  action: AuditAction.default("view"),
  entityType: z.string().optional(),
  entityId: z.string().nullable().optional(),
  entityLabel: z.string().optional(),
  details: z.string().optional(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).default("low"),
  flagged: z.boolean().default(false),
  flagReason: z.string().nullable().optional(),
});
export type AuditLog = z.infer<typeof AuditLog>;

/* --------------------- training quiz/attempts ---------------------- */

export const TrainingQuestion = z.object({
  ...base,
  trainingModuleId: z.string(),
  prompt: z.string(),
  questionType: z.enum(["multiple_choice", "true_false"]).default("multiple_choice"),
  options: z.array(z.string()).default([]),
  correctIndex: z.number().default(0),
  orderIndex: z.number().default(0),
});
export type TrainingQuestion = z.infer<typeof TrainingQuestion>;

export const TrainingAttempt = z.object({
  ...base,
  assignmentId: z.string().nullable().optional(),
  trainingModuleId: z.string(),
  moduleTitle: z.string().optional(),
  userId: z.string(),
  userName: z.string(),
  score: z.number().default(0),
  passed: z.boolean().default(false),
  answers: z.array(z.number()).default([]),
  completedAt: z.string().nullable().optional(),
});
export type TrainingAttempt = z.infer<typeof TrainingAttempt>;

/* ----------------------- fillable forms ---------------------------- */

export const formCategories = [
  "hr_onboarding",
  "hr_discipline",
  "hipaa",
  "osha_safety",
  "training",
  "credentialing",
  "insurance_risk",
  "emergency",
  "policy_review",
  "other",
] as const;
export const FormCategory = z.enum(formCategories);
export type FormCategory = z.infer<typeof FormCategory>;

export const FormField = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "date", "number", "checkbox", "select"]).default("text"),
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
});
export type FormField = z.infer<typeof FormField>;

export const FillableFormTemplate = z.object({
  ...base,
  title: z.string(),
  category: FormCategory.default("other"),
  description: z.string().optional(),
  fields: z.array(FormField).default([]),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  requiresSignature: z.boolean().default(false),
  sensitive: z.boolean().default(false),
  isDraft: z.boolean().default(false), // AI/auto-generated draft pending HR review
  fileUrl: z.string().nullable().optional(),
  // The statement the signer is actually attesting to (shown above the signature).
  bodyText: z.string().nullable().optional(),
  // Optional link to the governing policy/SOP in the document library (documents.id).
  linkedDocumentId: z.string().nullable().optional(),
});
export type FillableFormTemplate = z.infer<typeof FillableFormTemplate>;

export const FormAssignment = z.object({
  ...base,
  templateId: z.string(),
  templateTitle: z.string(),
  assignedToUserId: z.string().nullable().optional(),
  assignedToName: z.string(),
  status: z.enum(["assigned", "in_progress", "completed"]).default("assigned"),
  dueDate: z.string().nullable().optional(),
  completedFormId: z.string().nullable().optional(),
});
export type FormAssignment = z.infer<typeof FormAssignment>;

export const CompletedForm = z.object({
  ...base,
  templateId: z.string(),
  templateTitle: z.string(),
  employeeId: z.string().nullable().optional(),
  employeeName: z.string(),
  fieldValues: z.record(z.string(), z.string()).default({}),
  signedByName: z.string().optional(),
  completedAt: z.string().nullable().optional(),
});
export type CompletedForm = z.infer<typeof CompletedForm>;

/* --------------------- employee documents -------------------------- */

export const employeeDocTypes = [
  "offer_letter",
  "employment_contract",
  "i9",
  "w4",
  "performance_review",
  "disciplinary",
  "termination",
  "benefit_enrollment",
  "training_certificate",
  "other",
] as const;
export const EmployeeDocType = z.enum(employeeDocTypes);
export type EmployeeDocType = z.infer<typeof EmployeeDocType>;

export const EmployeeDocument = z.object({
  ...base,
  employeeId: z.string().nullable().optional(),
  employeeName: z.string(),
  documentType: EmployeeDocType.default("other"),
  title: z.string(),
  fileUrl: z.string().nullable().optional(),
  sensitive: z.boolean().default(false),
  uploadedByName: z.string().optional(),
  notes: z.string().optional(),
});
export type EmployeeDocument = z.infer<typeof EmployeeDocument>;

/* ----------------- controlled substances log ----------------------- */

export const ChatMessage = z.object({
  ...base,
  userId: z.string(),
  assistant: z.enum(["policy_assistant", "concierge"]).default("policy_assistant"),
  role: z.enum(["user", "assistant"]).default("user"),
  content: z.string(),
  // Groups messages into distinct conversations. Null for legacy rows created
  // before conversations existed (treated as one "Earlier conversation").
  conversationId: z.string().nullable().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const OrganizationSettings = z.object({
  ...base,
  orgName: z.string().default(DEFAULT_ORG_NAME),
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  npiNumber: z.string().optional(),
  taxId: z.string().optional(),
  documentRetentionYears: z.number().default(7),
  sessionTimeoutMinutes: z.number().default(30),
  requireTwoFactor: z.boolean().default(false),
  passwordMinLength: z.number().default(12),
  credentialReminderDays: z.number().default(30),
  trainingReminderDays: z.number().default(14),
  insuranceReminderDays: z.number().default(60),
  emailNotifications: z.boolean().default(true),
  // Page visibility (multi-tenant): per-role page access overrides + org-disabled modules.
  pageRoles: z.record(z.string(), z.array(z.string())).default({}),
  disabledPages: z.array(z.string()).default([]),
  // Default account role applied to newly-invited users (e.g. by the Concierge).
  defaultAccountRole: z.string().default("staff"),
});

// Per-user sidebar personalization (cosmetic — never grants access).
export const NavPreference = z.object({
  ...base,
  userId: z.string(),
  hiddenPages: z.array(z.string()).default([]),
  pageOrder: z.array(z.string()).default([]),
  groupOrder: z.array(z.string()).default([]),
  collapsedGroups: z.array(z.string()).default([]),
});
export type NavPreference = z.infer<typeof NavPreference>;
export type OrganizationSettings = z.infer<typeof OrganizationSettings>;

export const Notification = z.object({
  ...base,
  title: z.string(),
  body: z.string().optional(),
  category: z
    .enum(["credential", "training", "document", "insurance", "vendor", "system"])
    .default("system"),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  entityType: z.string().optional(),
  entityId: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
  read: z.boolean().default(false),
});
export type Notification = z.infer<typeof Notification>;

export const ControlledSubstanceLog = z.object({
  ...base,
  substanceName: z.string(),
  scheduleClass: z.enum(["II", "III", "IV", "V"]).default("II"),
  transactionType: z
    .enum(["receive", "dispense", "return", "dispose", "adjustment"])
    .default("dispense"),
  quantity: z.number().default(0),
  balanceAfter: z.number().default(0),
  patientRef: z.string().optional(),
  prescriberName: z.string().optional(),
  witnessName: z.string().optional(),
  transactionDate: z.string().nullable().optional(),
  notes: z.string().optional(),
});
export type ControlledSubstanceLog = z.infer<typeof ControlledSubstanceLog>;
