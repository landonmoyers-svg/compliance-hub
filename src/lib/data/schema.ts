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
  // Clinical-taxonomy class for the provider credential-file grouping, set by
  // the AI from reading the DOCUMENT (not the name). Null until analyzed.
  credentialClass: z.enum(["rn", "aprn", "aprn_cs", "pa", "dea", "board_cert", "other"]).nullable().optional(),
  boardType: z.string().nullable().optional(), // FNP / PMHNP / PA, for board certs
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
  // The actual SDS content (from AI lookup or manual entry) + the real SDS document.
  casNumber: z.string().nullable().optional(),
  hazardSummary: z.string().nullable().optional(),
  hazardStatements: z.string().nullable().optional(), // GHS H-statements / key hazards
  firstAid: z.string().nullable().optional(),
  handling: z.string().nullable().optional(),         // handling & storage
  ppe: z.string().nullable().optional(),              // required PPE
  revisionDate: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),          // uploaded SDS PDF
  // Locations that stock this product. A product can live at several sites, so
  // each location's MSDS binder is the set of records tagged with its id.
  locationIds: z.array(z.string()).optional(),
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
  // An uploaded file stored in the private bucket (e.g. a document filed here
  // from Document Intake). Distinct from officialUrl, which is an external link.
  attachmentUrl: z.string().nullable().optional(),
  // A stored copy of the referenced document's current version (public gov
  // sources), fetched for internal reference + to ground Policy Q&A. Review ≥ quarterly.
  documentSummary: z.string().nullable().optional(),   // 1-2 sentence plain-language summary
  documentContent: z.string().nullable().optional(),   // key provisions / requirements text
  documentVersion: z.string().nullable().optional(),   // effective date / edition label
  documentFetchedAt: z.string().nullable().optional(), // when we last fetched the current version
});
export type RegulatorySource = z.infer<typeof RegulatorySource>;

// Admin-pinned link: this SOP (document) satisfies this regulatory source.
// Persisted alongside the computed suggestions in src/lib/sop-regulation-link.ts.
export const SopRegulationLink = z.object({
  ...base,
  documentId: z.string(),
  regulatorySourceId: z.string(),
});
export type SopRegulationLink = z.infer<typeof SopRegulationLink>;

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

/* ------------------------- business (entity) records -------------------------
 * The practice AS A LEGAL ENTITY has its own documents — business licenses,
 * contracts, entity insurance, BAAs, leases, group payer contracts, audits,
 * formation/tax records. This is their single home, organized like the
 * Credentials/Insurance file views: grouped by category, newest term active,
 * prior/expired terms nested as superseded history. */

export const businessRecordCategories = [
  "license",         // business license / operating permit
  "contract",        // general business contract / agreement
  "insurance",       // entity-level insurance policy
  "baa",             // Business Associate Agreement
  "lease",           // rental / lease agreement
  "payer_contract",  // group payer / network contract
  "audit",           // audit / accreditation / survey record
  "vendor",          // vendor / service agreement
  "formation",       // formation / governance (articles, operating agreement)
  "tax",             // tax / financial identity (W-9, EIN/CP-575, filings)
  "other",
] as const;
export type BusinessRecordCategory = (typeof businessRecordCategories)[number];

export const businessRecordStatuses = ["active", "pending", "expired", "terminated"] as const;

export const BusinessRecord = z.object({
  ...base,
  title: z.string(),
  category: z.enum(businessRecordCategories).default("other"),
  // The other party: vendor, landlord, payer, carrier, agency, auditor…
  counterparty: z.string().nullable().optional(),
  // Contract / license / policy / audit number.
  identifier: z.string().nullable().optional(),
  // Issuing authority for licenses/permits (city, state agency, accreditor…).
  issuingAuthority: z.string().nullable().optional(),
  // Manual status for records without an expiration date (a perpetual BAA, a
  // terminated contract). When an expirationDate is set, the derived date
  // status wins in the UI.
  status: z.enum(businessRecordStatuses).nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  // Contract value / annual rent / coverage amount, in cents.
  amountCents: z.number().nullable().optional(),
  // Optional tie to a specific location (a per-site lease or license).
  locationId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  documentUrl: z.string().nullable().optional(),
});
export type BusinessRecord = z.infer<typeof BusinessRecord>;

/* -------- Employee lifecycle checklists (onboarding / offboarding) -------- */
export const lifecycleKinds = ["onboarding", "offboarding"] as const;
export type LifecycleKind = (typeof lifecycleKinds)[number];
export const lifecycleTaskCategories = ["access", "credentials", "hr_documents", "equipment", "training", "compliance", "other"] as const;
export const lifecycleTaskStatuses = ["pending", "done", "na"] as const;

export const LifecycleTask = z.object({
  ...base,
  employeeId: z.string(),
  employeeName: z.string(),
  kind: z.enum(lifecycleKinds),
  itemKey: z.string(),
  label: z.string(),
  category: z.enum(lifecycleTaskCategories).default("other"),
  status: z.enum(lifecycleTaskStatuses).default("pending"),
  dueDate: z.string().nullable().optional(),
  completedDate: z.string().nullable().optional(),
  completedBy: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type LifecycleTask = z.infer<typeof LifecycleTask>;

/* -------- Continuing education (CE) hours -------- */
export const ceCategories = ["general", "pharmacology", "ethics", "controlled_substance", "infection_control", "other"] as const;
export type CeCategory = (typeof ceCategories)[number];

export const CeRecord = z.object({
  ...base,
  employeeUserId: z.string().nullable().optional(),
  employeeName: z.string(),
  title: z.string(),
  provider: z.string().nullable().optional(),        // accrediting body / sponsor
  hours: z.number().default(0),
  category: z.enum(ceCategories).default("general"),
  // Which license/credential this counts toward (free text: "APRN", "RN", "DEA", "all").
  appliesTo: z.string().nullable().optional(),
  completedDate: z.string().nullable().optional(),
  documentUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type CeRecord = z.infer<typeof CeRecord>;

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

/* -------- Emergency preparedness plans -------- */
// The emergency scenarios a behavioral-health practice should have a written
// plan for (CMS Emergency Preparedness Rule + OSHA + behavioral-health specifics).
export const emergencyPlanTypes = [
  "fire",
  "severe_weather",
  "natural_disaster",
  "active_threat",
  "workplace_violence",
  "medical_emergency",
  "behavioral_crisis",
  "elopement",
  "utility_failure",
  "evacuation_shelter",
  "communication",
  "infectious_disease",
  "bomb_threat",
  "cyber_incident",
  "other",
] as const;
export type EmergencyPlanType = (typeof emergencyPlanTypes)[number];
export const emergencyPlanStatuses = ["draft", "active", "needs_review"] as const;

export const EmergencyPlan = z.object({
  ...base,
  title: z.string(),
  planType: z.enum(emergencyPlanTypes).default("other"),
  // The plan body — markdown (procedures + a step-by-step algorithm), AI-draftable and editable.
  content: z.string().nullable().optional(),
  status: z.enum(emergencyPlanStatuses).default("draft"),
  reviewDate: z.string().nullable().optional(),
  lastReviewedDate: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type EmergencyPlan = z.infer<typeof EmergencyPlan>;

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
  // AUDIT-1: objective rubric (what Pass/Partial/Fail looks like), how to verify
  // it, the governing regulation, and uploaded evidence — so ratings are honest,
  // reproducible, and defensible rather than a bare yes/no.
  rubric: z.string().optional(),
  howToVerify: z.string().optional(),
  regCitation: z.string().optional(),
  evidenceUrl: z.string().nullable().optional(),
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
  // Physical asset tag / label — name and/or number printed on the item, so a
  // physical label can be matched to the record and a specific unit tracked.
  assetTag: z.string().nullable().optional(),
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

/* -------------------- staff supply inventory ----------------------- */
// Lower-value, movable office items (keyboards, mice, HDMI cords, adapters…)
// that staff move between storage, rooms, and desks. Distinct from the clinical
// asset `inventory`. Each item has a home storage spot and a movement ledger.

export const supplyStatuses = ["in_storage", "in_use", "checked_out", "missing", "retired"] as const;

export const SupplyItem = z.object({
  ...base,
  name: z.string(),
  itemType: z.string().default("cable"), // keyboard, mouse, monitor, cable, adapter, dock, headset, webcam, phone, furniture, other
  itemNumber: z.string().nullable().optional(), // asset/serial tag if applicable
  quantity: z.number().default(1),
  // Home storage: where the item normally lives.
  homeLocationId: z.string().nullable().optional(),
  homeRoom: z.string().nullable().optional(),     // room / storage spot, e.g. "IT Closet, Shelf 2"
  // Current whereabouts (may differ from home when taken out of storage).
  status: z.enum(supplyStatuses).default("in_storage"),
  currentLocationId: z.string().nullable().optional(),
  currentRoom: z.string().nullable().optional(),
  currentHolder: z.string().nullable().optional(), // staff / desk it's with
  // Image classification (mirrors clinical inventory).
  imageUrl: z.string().nullable().optional(),
  capturedAt: z.string().nullable().optional(),
  capturedLat: z.number().nullable().optional(),
  capturedLng: z.number().nullable().optional(),
  aiIdentified: z.boolean().default(false),
  aiConfidence: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type SupplyItem = z.infer<typeof SupplyItem>;

export const supplyActions = ["added", "checked_out", "moved", "returned", "status_change"] as const;

export const SupplyMovement = z.object({
  ...base,
  itemId: z.string(),
  action: z.enum(supplyActions).default("moved"),
  fromLocationId: z.string().nullable().optional(),
  fromRoom: z.string().nullable().optional(),
  toLocationId: z.string().nullable().optional(),
  toRoom: z.string().nullable().optional(),
  toHolder: z.string().nullable().optional(),
  byName: z.string().nullable().optional(),        // who recorded the move
  note: z.string().nullable().optional(),
});
export type SupplyMovement = z.infer<typeof SupplyMovement>;

/* -------------------- medical consumables -------------------------- */
// Consumable clinical supplies (gloves, syringes, gauze, alcohol pads…) tracked
// by quantity on hand against a par/reorder level, with lot + expiration and a
// usage/restock ledger. Distinct from movable equipment (`supplyItems`).

export const consumableCategories = [
  "ppe", "wound_care", "injection", "diagnostic", "phlebotomy",
  "cleaning", "paper_goods", "medication_adjacent", "other",
] as const;

export const MedicalSupply = z.object({
  ...base,
  name: z.string(),
  category: z.enum(consumableCategories).default("other"),
  unit: z.string().default("each"),          // box, each, pair, case…
  sku: z.string().nullable().optional(),      // catalog / reorder number
  locationId: z.string().nullable().optional(),
  room: z.string().nullable().optional(),     // storage room / cabinet
  quantityOnHand: z.number().default(0),
  parLevel: z.number().default(0),            // reorder threshold
  reorderQuantity: z.number().nullable().optional(),
  lotNumber: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  // Image classification (mirrors inventory).
  imageUrl: z.string().nullable().optional(),
  capturedAt: z.string().nullable().optional(),
  capturedLat: z.number().nullable().optional(),
  capturedLng: z.number().nullable().optional(),
  aiIdentified: z.boolean().default(false),
  aiConfidence: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type MedicalSupply = z.infer<typeof MedicalSupply>;

export const consumableActions = ["received", "used", "adjusted", "discarded"] as const;

export const MedicalSupplyLog = z.object({
  ...base,
  supplyId: z.string(),
  action: z.enum(consumableActions).default("used"),
  quantityDelta: z.number().default(0),        // +received / -used
  balanceAfter: z.number().nullable().optional(),
  lotNumber: z.string().nullable().optional(),
  byName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type MedicalSupplyLog = z.infer<typeof MedicalSupplyLog>;

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

/* ---------------------- payer enrollment --------------------------- *
 * Two-level model, distinct from a provider's CREDENTIALS: a payer is an
 * insurance carrier the practice contracts with, and a provider is paneled
 * (enrolled/par) under that contract.
 *   PayerContract   = practice ↔ payer (group/TIN level): the executed
 *                     agreement + fee schedule + renewal date.
 *   PayerEnrollment = provider ↔ payer (paneling): each provider's enrollment
 *                     status, par date, re-credential date, and payer-assigned
 *                     IDs, optionally linked to the group contract.
 */

export const payerContractStatuses = [
  "prospective",
  "in_negotiation",
  "active",
  "terminated",
  "expired",
] as const;

export const PayerContract = z.object({
  ...base,
  payerName: z.string(),
  planNetwork: z.string().optional(), // e.g. "Commercial PPO", "Medicaid", "BH carve-out"
  contractLevel: z.enum(["group", "individual"]).default("group"),
  taxId: z.string().optional(), // TIN the contract is written under
  groupNpi: z.string().optional(),
  contractStatus: z.enum(payerContractStatuses).default("active"),
  effectiveDate: z.string().nullable().optional(),
  renewalDate: z.string().nullable().optional(), // feeds calendar + notifications
  terminationDate: z.string().nullable().optional(),
  payerContactName: z.string().optional(),
  payerContactEmail: z.string().optional(),
  payerContactPhone: z.string().optional(),
  contractDocumentUrl: z.string().nullable().optional(), // executed agreement
  feeScheduleUrl: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  notes: z.string().optional(),
});
export type PayerContract = z.infer<typeof PayerContract>;

export const enrollmentStatuses = [
  "not_started",
  "application_submitted",
  "in_process",
  "paneled",
  "denied",
  "recred_due",
  "terminated",
] as const;

export const PayerEnrollment = z.object({
  ...base,
  providerUserId: z.string().nullable().optional(),
  providerName: z.string(),
  payerContractId: z.string().nullable().optional(), // link to the group contract
  payerName: z.string(), // denormalized so paneling reads standalone
  enrollmentStatus: z.enum(enrollmentStatuses).default("not_started"),
  submittedDate: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(), // par / effective date
  recredentialDate: z.string().nullable().optional(), // feeds calendar + notifications
  terminationDate: z.string().nullable().optional(),
  providerPayerId: z.string().optional(), // payer-assigned provider ID / PTAN / Medicaid #
  caqhId: z.string().optional(),
  individualNpi: z.string().optional(),
  applicationDocumentUrl: z.string().nullable().optional(), // enrollment app / CAQH attestation
  notes: z.string().optional(),
});
export type PayerEnrollment = z.infer<typeof PayerEnrollment>;

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
  // Where/how the access happened — captured server-side for client-initiated
  // access + auth events (change entries from DB triggers have no request context).
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  deviceType: z.string().nullable().optional(),
  geoCity: z.string().nullable().optional(),
  geoRegion: z.string().nullable().optional(),
  geoCountry: z.string().nullable().optional(),
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
  "medical",          // ADA/GINA-protected health info — restricted access
  "background_check", // BCI/FBI/screening — restricted access
  "other",
] as const;

/** Personnel documents whose access is legally restricted (ADA/GINA medical
 *  info, background-check dissemination limits, SSN/identity/financial). These
 *  are visible to Owner/Admin/HR only — not clinical leadership. A document
 *  manually flagged `sensitive` is treated the same way. */
export const RESTRICTED_EMPLOYEE_DOC_TYPES: readonly string[] = [
  "medical", "background_check", "i9", "w4", "benefit_enrollment",
];
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
  auditRetentionYears: z.number().default(7),
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
    .enum(["credential", "training", "document", "insurance", "vendor", "payer", "system"])
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

/* ------- controlled substances: per-bottle chain of custody (CS-1..8) ------- */

// Lifecycle of a single controlled-substance container from receipt to end state.
// Lone Peak ADMINISTERS on-site only (no dispensing to patients).
export const csItemStates = [
  "received",          // delivered to a clinic, in receiving
  "in_primary_safe",   // moved to the clinic's primary safe
  "assigned_to_staff", // transferred to a staff member's safe (custody logged)
  "in_use",            // being administered from
  "depleted",          // fully administered
  "wasted",            // remainder wasted (witnessed)
  "destroyed",         // destroyed per DEA (Form 41)
  "quarantined",       // held due to a discrepancy / recall
] as const;
export const CSItemState = z.enum(csItemStates);
export type CSItemState = z.infer<typeof CSItemState>;

export const ControlledSubstanceItem = z.object({
  ...base,
  substanceName: z.string(),
  scheduleClass: z.enum(["II", "IIN", "III", "IV", "V"]).default("II"),
  ndc: z.string().optional(),                 // NDC / product code
  lotNumber: z.string().optional(),
  expirationDate: z.string().nullable().optional(),
  containerLabel: z.string().optional(),      // bottle/vial label id or barcode
  strength: z.string().optional(),            // e.g. "50 mg/mL"
  quantityUnit: z.string().default("mL"),     // mL, mg, tablets, vials
  initialQuantity: z.number().default(0),     // units received
  currentQuantity: z.number().default(0),     // running balance
  state: CSItemState.default("received"),
  locationId: z.string().nullable().optional(),
  custodianUserId: z.string().nullable().optional(), // staff currently holding it
  custodianName: z.string().optional(),
  receivedDate: z.string().nullable().optional(),
  orderReference: z.string().optional(),      // PO / DEA 222 / CSOS reference
  supplierName: z.string().optional(),
  hasDiscrepancy: z.boolean().default(false),
  notes: z.string().optional(),
});
export type ControlledSubstanceItem = z.infer<typeof ControlledSubstanceItem>;

// A custody transition or administration/waste against a specific container.
// Each event is backed by an uploaded scanned DEA/paper record where applicable.
export const csEventTypes = [
  "receive", "transfer_to_safe", "assign_to_staff", "return_to_safe",
  "administer", "waste", "destroy", "count", "adjust",
] as const;
export const CSEventType = z.enum(csEventTypes);
export type CSEventType = z.infer<typeof CSEventType>;

export const ControlledSubstanceEvent = z.object({
  ...base,
  itemId: z.string(),                         // FK to ControlledSubstanceItem
  eventType: CSEventType.default("administer"),
  eventDate: z.string().nullable().optional(),
  quantity: z.number().default(0),            // amount for administer/waste/adjust; 0 for transfer/count
  balanceAfter: z.number().nullable().optional(),
  fromCustodianName: z.string().optional(),
  toCustodianName: z.string().optional(),
  toCustodianUserId: z.string().nullable().optional(),
  performedByName: z.string().optional(),
  performedByUserId: z.string().nullable().optional(),
  witnessName: z.string().optional(),
  patientRef: z.string().optional(),          // de-identified reference only
  documentUrl: z.string().nullable().optional(), // scanned DEA/paper record
  discrepancy: z.boolean().default(false),
  discrepancyNote: z.string().optional(),
  correctiveActionId: z.string().nullable().optional(), // link to a CAPA
  notes: z.string().optional(),
});
export type ControlledSubstanceEvent = z.infer<typeof ControlledSubstanceEvent>;

// CS-3: practice-level DEA regulatory records/filings, retained ≥2 years.
export const deaRecordTypes = [
  "order_222", "csos_order", "biennial_inventory", "form_41_destruction",
  "form_106_loss", "power_of_attorney", "registration", "other",
] as const;
export const DeaRecordType = z.enum(deaRecordTypes);
export type DeaRecordType = z.infer<typeof DeaRecordType>;

export const DeaRecord = z.object({
  ...base,
  recordType: DeaRecordType.default("other"),
  recordDate: z.string().nullable().optional(),
  referenceNumber: z.string().optional(),   // 222 serial / CSOS id / DEA reg # / Form 41 or 106 ref
  // Biennial inventory covers a period; other forms leave these null.
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  filedByName: z.string().optional(),
  documentUrl: z.string().nullable().optional(), // scanned official form
  notes: z.string().optional(),
});
export type DeaRecord = z.infer<typeof DeaRecord>;
