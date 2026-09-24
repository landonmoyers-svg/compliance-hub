import { z } from "zod";
import { DEFAULT_ORG_NAME } from "@/lib/org";

/**
 * Entity schemas (Zod) + inferred TS types for the Lone Peak Compliance.
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
  // Providers, MAs and nurses — the people who keep the clinical records.
  // Split out of "staff" so clinical permissions don't reach the front desk.
  "medical_staff",
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
  // Grant to view SENSITIVE employee documents (medical, background checks).
  // Owner/HR always can; owner/HR toggle this for other privileged users.
  sensitiveDocsAccess: z.boolean().optional(),
  // Platform operator — may create new COMPANIES (tenants). Above any single
  // org's owner/admin; set manually, never self-serve.
  platformAdmin: z.boolean().optional(),
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
  /* A retired registration: only supervisors may file its controlled-substance
     logs. Not closed — an inspector can require an amendment at any time — just
     not part of anyone's daily round. */
  restrictedFiling: z.boolean().optional(),
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
  /**
   * Where the course actually plays. "in_app" = quiz or attestation inside the
   * Hub; "external" = delivered by a vendor platform (Mineral today) and only
   * evidenced here.
   */
  delivery: z.enum(["in_app", "external"]).default("in_app"),
  /** Vendor delivering an external module, e.g. "Mineral". */
  provider: z.string().nullable().optional(),
  /** Deep link staff are sent to; blank falls back to the provider default. */
  externalUrl: z.string().nullable().optional(),
  /** Course title/code as the vendor's report spells it (used to match imports). */
  providerCourseCode: z.string().nullable().optional(),
  /** Require a certificate upload when attesting to an external completion. */
  evidenceRequired: z.boolean().default(true),
});
export type TrainingModule = z.infer<typeof TrainingModule>;

export const completionSources = ["quiz", "attestation", "external_attested", "import"] as const;
export const CompletionSource = z.enum(completionSources);
export type CompletionSource = z.infer<typeof CompletionSource>;

export const verificationStatuses = ["provisional", "verified", "discrepancy"] as const;
export const VerificationStatus = z.enum(verificationStatuses);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

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
  /** How the completion was recorded. Null on assignments not yet completed. */
  completionSource: CompletionSource.nullable().optional(),
  /**
   * Evidence strength for a vendor-delivered completion:
   * provisional = the employee said so; verified = the vendor's own report says
   * so; discrepancy = the report contradicts the attestation.
   */
  verificationStatus: VerificationStatus.nullable().optional(),
  /** Storage path of the vendor completion certificate. */
  certificateUrl: z.string().nullable().optional(),
  /** Completion date as stated by the employee / vendor certificate. */
  externalCompletedAt: z.string().nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  verifiedByName: z.string().nullable().optional(),
  /** The import batch that verified this row. */
  importBatchId: z.string().nullable().optional(),
  reconciliationNote: z.string().nullable().optional(),
});
export type TrainingAssignment = z.infer<typeof TrainingAssignment>;

/* ---------------------- employment-law obligations ------------------- */

export const lawTopics = [
  "discrimination", "leave", "wage_hour", "hiring", "termination",
  "benefits", "safety", "recordkeeping", "posting", "privacy", "tax", "other",
] as const;
export type LawTopic = (typeof lawTopics)[number];

export const lawReviewStatuses = ["verified", "needs_review", "superseded"] as const;

/**
 * One employment-law obligation, keyed to the facts that switch it on
 * (headcount, state, plan status) and carrying the primary authority it was
 * written from — so a claim can be traced to the statute, not to a summary.
 */
export const LawObligation = z.object({
  ...base,
  title: z.string(),
  /** "federal" or a state code, e.g. "UT". */
  jurisdiction: z.string().default("federal"),
  topic: z.enum(lawTopics).default("other"),
  authorityBody: z.string().nullable().optional(),
  citationLabel: z.string().nullable().optional(),
  officialUrl: z.string().nullable().optional(),

  /** True when the duty applies regardless of headcount. */
  appliesAll: z.boolean().default(false),
  minEmployees: z.number().nullable().optional(),
  maxEmployees: z.number().nullable().optional(),
  /** How the law itself counts employees. */
  countBasis: z.string().nullable().optional(),
  /** Extra facts that gate the duty: group_health_plan, federal_contractor, … */
  conditions: z.array(z.string()).default([]),

  summary: z.string().nullable().optional(),
  employerDuties: z.array(z.string()).default([]),
  deadlineNote: z.string().nullable().optional(),
  penaltyNote: z.string().nullable().optional(),

  /** Verbatim text from the cited source this row was written from. */
  sourceQuote: z.string().nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  verifiedByName: z.string().nullable().optional(),
  reviewStatus: z.enum(lawReviewStatuses).default("needs_review"),
  nextReviewDate: z.string().nullable().optional(),

  /** What in the Hub already discharges this duty. */
  linkedDocumentId: z.string().nullable().optional(),
  linkedTrainingModuleId: z.string().nullable().optional(),
  linkedFormTemplateId: z.string().nullable().optional(),
  regulatorySourceId: z.string().nullable().optional(),

  notes: z.string().nullable().optional(),
  active: z.boolean().default(true),
});
export type LawObligation = z.infer<typeof LawObligation>;

export const lawAlertStatuses = ["new", "reviewed", "actioned", "dismissed"] as const;

/**
 * A published regulatory change matched against the obligation register — one
 * row per government document, deduped on the publisher's document number.
 */
export const LawAlert = z.object({
  ...base,
  source: z.string().default("federal_register"),
  documentNumber: z.string().nullable().optional(),
  docType: z.string().nullable().optional(),
  title: z.string(),
  abstract: z.string().nullable().optional(),
  agencies: z.array(z.string()).default([]),
  publicationDate: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  commentsCloseDate: z.string().nullable().optional(),
  htmlUrl: z.string().nullable().optional(),
  pdfUrl: z.string().nullable().optional(),
  matchedTerms: z.array(z.string()).default([]),
  matchedObligationId: z.string().nullable().optional(),
  status: z.enum(lawAlertStatuses).default("new"),
  reviewedByName: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  reviewNote: z.string().nullable().optional(),
});
export type LawAlert = z.infer<typeof LawAlert>;

/* --------------------- vendor completion imports -------------------- */

export const TrainingImportRow = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  course: z.string().optional(),
  completedAt: z.string().optional(),
  reason: z.string().optional(),
});
export type TrainingImportRow = z.infer<typeof TrainingImportRow>;

/**
 * One vendor completion-report import. Kept so a verified completion can always
 * answer "which report, imported by whom, on what day, said so?".
 */
export const TrainingImport = z.object({
  ...base,
  provider: z.string().default("Mineral"),
  fileName: z.string().nullable().optional(),
  importedByName: z.string().nullable().optional(),
  /** Free-text period the report covers, e.g. "Aug 2026". */
  periodLabel: z.string().nullable().optional(),
  rowCount: z.number().default(0),
  matchedCount: z.number().default(0),
  verifiedCount: z.number().default(0),
  discrepancyCount: z.number().default(0),
  /** Report rows that matched no assignment — the follow-up list. */
  unmatched: z.array(TrainingImportRow).default([]),
  notes: z.string().nullable().optional(),
});
export type TrainingImport = z.infer<typeof TrainingImport>;

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
  // Immutable snapshot of exactly what was attested to. `documentFingerprint`
  // detects when the policy changes (→ a fresh attestation is required);
  // `signedContent`/`signedFileUrl`/`documentVersion` preserve the signed version.
  documentVersion: z.string().nullable().optional(),
  documentFingerprint: z.string().nullable().optional(),
  signedContent: z.string().nullable().optional(),
  signedFileUrl: z.string().nullable().optional(),
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
  // Utah business personal property tax (Pub 20). See src/lib/utah-ppt.ts.
  // acquisitionCost includes install/shipping/sales tax; pptCategory is a Utah
  // valuation class ("class_8") or an exempt reason ("exempt_supply").
  acquisitionCostCents: z.number().nullable().optional(),
  acquisitionYear: z.number().nullable().optional(),
  pptCategory: z.string().nullable().optional(),
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
  // Ordering. All optional (no .default) — a default here would make every
  // existing construction site of MedicalSupply fail to typecheck.
  /** The vendor's product page for this exact item. http(s) only. */
  orderUrl: z.string().nullable().optional(),
  /** Days from placing an order to having it on the shelf. Defaults to 7 in code. */
  leadTimeDays: z.number().nullable().optional(),
  /** Days of use an order should cover once it arrives. Defaults to 30 in code. */
  targetCoverDays: z.number().nullable().optional(),
  /** Units per orderable pack — recommendations round up to whole packs. */
  packSize: z.number().nullable().optional(),
  lastOrderedAt: z.string().nullable().optional(),
  pendingOrderQty: z.number().nullable().optional(),
});
export type MedicalSupply = z.infer<typeof MedicalSupply>;

/**
 * One delivered batch of a supply. Stock lives here: the supply's on-hand, lot
 * number and expiry are kept in sync from its lots by a database trigger, so a
 * closet holding three lots with three expiry dates is represented truthfully.
 */
export const MedicalSupplyLot = z.object({
  ...base,
  supplyId: z.string(),
  lotNumber: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  quantityReceived: z.number().default(0),
  quantityRemaining: z.number().default(0),
  receivedAt: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type MedicalSupplyLot = z.infer<typeof MedicalSupplyLot>;

// "expired" is split out from "discarded" so waste-to-expiry can be reported on its own.
export const consumableActions = ["received", "used", "adjusted", "discarded", "expired"] as const;

export const MedicalSupplyLog = z.object({
  ...base,
  supplyId: z.string(),
  action: z.enum(consumableActions).default("used"),
  quantityDelta: z.number().default(0),        // +received / -used
  balanceAfter: z.number().nullable().optional(),
  /** When it actually happened — not when it was typed in. Usage pace measures
   *  against this, so a Friday catch-up still lands in the right week. */
  occurredAt: z.string().nullable().optional(),
  /** The lot this movement touched. */
  lotId: z.string().nullable().optional(),
  lotNumber: z.string().nullable().optional(),
  byName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

/* --------------------- medication samples --------------------------- */

/**
 * Drug-rep samples held at a site. Deliberately separate from MedicalSupply:
 * samples aren't purchased, they can't be reordered from a vendor, they expire
 * hard, and the way you restock is to call the rep — so the rep is part of the
 * record, not an afterthought.
 */
export const sampleForms = [
  "box", "carton", "blister_pack", "bottle", "pen", "vial",
  "inhaler", "tube", "sample_card", "other",
] as const;
export const SampleForm = z.enum(sampleForms);
export type SampleForm = z.infer<typeof SampleForm>;

/** The rep to call for more. One rep usually covers several products. */
export const DrugRep = z.object({
  ...base,
  name: z.string(),
  company: z.string().nullable().optional(),      // manufacturer they represent
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  territory: z.string().nullable().optional(),
  lastContactDate: z.string().nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().nullable().optional(),
});
export type DrugRep = z.infer<typeof DrugRep>;

export const MedSample = z.object({
  ...base,
  name: z.string(),
  strength: z.string().nullable().optional(),     // "50 mg", "100 mcg/actuation"
  form: SampleForm.default("box"),
  manufacturer: z.string().nullable().optional(),
  ndc: z.string().nullable().optional(),
  /** Which site holds this stock. Murray and Lehi are tracked separately. */
  locationId: z.string().nullable().optional(),
  room: z.string().nullable().optional(),         // closet / cabinet
  quantityOnHand: z.number().default(0),
  unit: z.string().default("box"),
  /** Optional floor. Runway is computed from pace; par is a simple backstop. */
  parLevel: z.number().default(0),
  lotNumber: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  repId: z.string().nullable().optional(),
  // Photo classification, mirroring inventory and medical supplies.
  imageUrl: z.string().nullable().optional(),
  capturedAt: z.string().nullable().optional(),
  capturedLat: z.number().nullable().optional(),
  capturedLng: z.number().nullable().optional(),
  aiIdentified: z.boolean().default(false),
  aiConfidence: z.string().nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().nullable().optional(),
});
export type MedSample = z.infer<typeof MedSample>;

export const sampleActions = ["dispensed", "received", "adjusted", "discarded", "expired"] as const;
export const SampleAction = z.enum(sampleActions);
export type SampleAction = z.infer<typeof SampleAction>;

export const MedSampleLog = z.object({
  ...base,
  sampleId: z.string(),
  action: SampleAction.default("dispensed"),
  quantityDelta: z.number().default(0),           // +received / -dispensed
  balanceAfter: z.number().nullable().optional(),
  /** When it actually happened — not when it was typed in. Burn rate uses this
   *  so a back-dated entry still lands in the right week. */
  occurredAt: z.string().nullable().optional(),
  lotNumber: z.string().nullable().optional(),
  byName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type MedSampleLog = z.infer<typeof MedSampleLog>;
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
  // Short instructional help shown under the field: what to enter and how to
  // phrase it accurately and defensibly. Stored inside the fields jsonb.
  guidance: z.string().optional(),
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
  // "How to complete this properly" guidance shown at the top of the filler:
  // documentation best-practices + legal-protective framing for this form type.
  completionGuidance: z.string().nullable().optional(),
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
  // Multi-industry config (additive; healthcare = today's behavior, byte-for-byte).
  industry: z.string().default("healthcare"),
  // Where the business operates — drives which regulations apply (federal/state/county/city).
  jurisdiction: z.object({
    country: z.string().optional(),
    state: z.string().optional(),
    county: z.string().optional(),
    city: z.string().optional(),
  }).default({}),
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
  /** The delivery and the sealed box this vial came out of, when known. */
  manifestId: z.string().nullable().optional(),
  boxId: z.string().nullable().optional(),
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

/* --- paper controlled-substance logs (kept as DEA records) --- */
// A vial log or administration log IS a DEA record, so it lives in DeaRecord
// rather than a parallel entity. These are the parts a LOG needs.

export const csEntryActions = ["received", "administered", "wasted", "destroyed", "transferred", "returned", "count"] as const;
export const CsEntryAction = z.enum(csEntryActions);
export type CsEntryAction = z.infer<typeof CsEntryAction>;

/* How much a line is to be relied on. An audit that flattens these is worth
 * less than one that doesn't: a row read off a page and a row inferred from
 * surrounding balances are different kinds of claim, and only one of them can
 * be checked against an original. */
export const csEntryBases = ["transcribed", "checked", "derived", "reported"] as const;
export const CsEntryBasis = z.enum(csEntryBases);
export type CsEntryBasis = z.infer<typeof CsEntryBasis>;

/** One line off a paper log. Deliberately has no patient field — see DeaRecord. */
export const CsArchiveEntry = z.object({
  date: z.string().nullable().optional(),
  vialLabel: z.string().nullable().optional(),
  action: CsEntryAction,
  amount: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  staff: z.string().nullable().optional(),
  witness: z.string().nullable().optional(),
  /** Which page/line this came off, so a discrepancy can be traced to the chart. */
  pageRef: z.string().nullable().optional(),
  note: z.string().nullable().optional(),

  /** How this line is known. Defaults to transcribed — read off the page. */
  basis: CsEntryBasis.optional(),
  /** Which log book or issued set it belongs to: a treatment-room book, a
   *  clinician's own bottles, a nurse's issued set. Custody structure that a
   *  bare vial label loses. */
  book: z.string().nullable().optional(),

  /* What actually arrived, for a receipt. "15" is not a quantity — 15 what?
     An order line reading 15 boxes of 10 and a stock log reading 15 vials are
     the same number and a tenfold difference, and writing them the same way is
     how 135 vials go unrecorded. */
  packs: z.number().nullable().optional(),
  unitsPerPack: z.number().nullable().optional(),
  /** Strength as written, e.g. "100 mg/mL x 5 mL". Two products can both be
   *  500 mg a vial and not be interchangeable. */
  concentration: z.string().nullable().optional(),
  /** Milligrams in one container. */
  containerMg: z.number().nullable().optional(),
});
export type CsArchiveEntry = z.infer<typeof CsArchiveEntry>;

/* A DEA registration: a number, held by someone, at one address.
 *
 * A DEA number is tied to an address, so the same prescriber holds a different
 * one at each site — and a practice can have several registrants at once. That
 * is why records point here rather than at a clinic: "whose number, at which
 * address, and when did that stop" is not reconstructable later.
 *
 * Reconciliation runs WITHIN a registration. A vial received under one number
 * and administered under another crossed a boundary that matters, and adding
 * the two together would show a balance where there is a gap. */
export const DeaRegistration = z.object({
  ...base,
  deaNumber: z.string(),
  registrantName: z.string(),
  registrantType: z.enum(["individual", "location"]).default("individual"),
  locationId: z.string(),
  /** The date from which THIS practice keeps records under this number.
   *  A registration renews every three years, so the certificate shows only
   *  the current term — and the number follows the registrant, so it may have
   *  been issued years earlier at somebody else's address. Coverage is
   *  measured from here: not the term, which would hide years of archive, and
   *  not first issue, which would claim records that were another practice's. */
  recordsFrom: z.string().nullable().optional(),
  /** The current term, exactly as printed on the certificate. */
  effectiveFrom: z.string().nullable().optional(),
  /** When it needs renewing. Distinct from retiredOn — a registration can
   *  expire while still very much in use, which is the problem. */
  expiresOn: z.string().nullable().optional(),
  /** Set when it stops being used. It still accepts amendments — the
   *  registrant stays responsible for the records kept under it. */
  retiredOn: z.string().nullable().optional(),
  /** The certificate. A business record naming no patient, so the Hub holds it. */
  documentUrl: z.string().nullable().optional(),
  schedules: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type DeaRegistration = z.infer<typeof DeaRegistration>;

/* Reconstructing records that were never kept.
 *
 * Each row is a claim about one span of time: this kind of record, for this
 * registration, from this source, is missing / requested / recovered. The Hub
 * works out the GAPS from them — the stretches nothing covers — because naming
 * a gap precisely is most of what turns a worry into a task. */
export const recordRecoveryKinds = ["purchase", "administration", "inventory", "destruction", "other"] as const;
export const recordRecoveryStatuses = ["missing", "requested", "recovered", "not_applicable"] as const;

export const RecordRecoveryItem = z.object({
  ...base,
  registrationId: z.string(),
  recordKind: z.enum(recordRecoveryKinds).default("purchase"),
  sourceName: z.string().nullable().optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.enum(recordRecoveryStatuses).default("missing"),
  requestedOn: z.string().nullable().optional(),
  receivedOn: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type RecordRecoveryItem = z.infer<typeof RecordRecoveryItem>;

// CS-3: practice-level DEA regulatory records/filings, retained ≥2 years.
export const deaRecordTypes = [
  "order_222", "csos_order", "biennial_inventory", "form_41_destruction",
  "form_106_loss", "power_of_attorney", "registration",
  // The paper logs: kept as DEA records because that is what they are.
  "vial_log", "administration_log", "count_sheet",
  "other",
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
  documentUrl: z.string().nullable().optional(), // scanned official form — NEVER for a page with chart numbers
  notes: z.string().optional(),

  /* A page carrying patient chart numbers stays in SharePoint (covered by the
     practice's Microsoft BAA) and is only LINKED here; the database refuses a
     document_url on such a record. What the Hub keeps is the de-identified
     entries below, which are what reconciling a vial actually needs. */
  containsPatientIdentifiers: z.boolean().optional(),
  externalUrl: z.string().nullable().optional(),
  externalSystem: z.string().nullable().optional(),
  substanceName: z.string().nullable().optional(),
  entries: z.array(CsArchiveEntry).optional(),
  openingBalance: z.number().nullable().optional(),
  receivedTotal: z.number().nullable().optional(),
  administeredTotal: z.number().nullable().optional(),
  wastedTotal: z.number().nullable().optional(),
  closingBalance: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  reconciled: z.boolean().optional(),
  reconciledByName: z.string().nullable().optional(),
  reconciledAt: z.string().nullable().optional(),
  discrepancy: z.boolean().optional(),
  discrepancyNote: z.string().nullable().optional(),

  /* A filed log is never edited — the archive is append-only, which is what
     makes it defensible. A correction is a new filing that points back at what
     it corrects. The superseded record is kept and stays readable; only the
     newest in a chain counts towards reconciliation. */
  /** The DEA registration this record was kept under. */
  registrationId: z.string().nullable().optional(),
  /** The clinician who directed these treatments. Not the registrant, and not
   *  whoever administered each dose — a log row names the person who gave it,
   *  working under someone else's direction and on someone else's number. */
  directedByName: z.string().nullable().optional(),
  amendsRecordId: z.string().nullable().optional(),
  amendmentReason: z.string().nullable().optional(),

  /* Where it sits in the archive, and what it was when it got there. An
     amendment shares its parent's key so both land in one folder; the hashes
     are computed before the bytes leave the browser, so the record of what was
     filed lives in a different system from the file itself. */
  archiveKey: z.string().nullable().optional(),
  fileHashes: z.record(z.string(), z.string()).optional(),
});
export type DeaRecord = z.infer<typeof DeaRecord>;

/* ------------------------- emergency alert ------------------------- */
// LP Alert (the Base44 emergency-code app), rebuilt inside the Hub. Incident
// AUDIO never lives here — it streams to admin devices and is saved only there;
// incidents carry clip metadata alone (see supabase/migrations/0026).

export const alarmSounds = ["default", "fire_alarm", "beep_fast", "beep_slow", "siren_high", "siren_low", "triple_beep", "silent"] as const;
export const AlarmSound = z.enum(alarmSounds);
export type AlarmSound = z.infer<typeof AlarmSound>;

export const EmergencyCode = z.object({
  ...base,
  name: z.string(),                                 // "Code Blue"
  description: z.string().nullable().optional(),
  priority: z.string(),                             // "CRITICAL PRIORITY"
  colorHex: z.string(),
  alarmSound: AlarmSound,
  requiredRoles: z.array(z.string()),
  audioRecordingEnabled: z.boolean(),
  sortOrder: z.number(),
  active: z.boolean(),
});
export type EmergencyCode = z.infer<typeof EmergencyCode>;

/** How one site relates to the others in an emergency (mutual aid, shared walls, where the AED lives). */
export const EmergencySiteSettings = z.object({
  ...base,
  locationId: z.string(),
  responseZone: z.string().nullable().optional(),
  mutualAidLocationIds: z.array(z.string()),
  connectedLocationIds: z.array(z.string()),
  refugeForLocationIds: z.array(z.string()),
  aedSourceLocationId: z.string().nullable().optional(),
  crashCartSourceLocationId: z.string().nullable().optional(),
});
export type EmergencySiteSettings = z.infer<typeof EmergencySiteSettings>;

export const AudioClipMeta = z.object({
  clipIndex: z.number(),
  recordedAt: z.string(),
  durationSec: z.number().optional(),
  /** Device label of the admin app that saved it; absent while still on the phone. */
  heldBy: z.string().optional(),
});
export type AudioClipMeta = z.infer<typeof AudioClipMeta>;

export const evacuationStatuses = ["pending", "evacuate", "shelter"] as const;
export const EmergencyIncident = z.object({
  ...base,
  codeId: z.string().nullable().optional(),
  codeName: z.string(),
  locationId: z.string().nullable().optional(),
  locationName: z.string().nullable().optional(),
  internalLocation: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  triggeredBy: z.string().nullable().optional(),    // auth user id
  triggeredByName: z.string().nullable().optional(),
  triggeredAt: z.string(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  isRemote: z.boolean(),
  remoteAddress: z.string().nullable().optional(),
  remoteCity: z.string().nullable().optional(),
  remoteState: z.string().nullable().optional(),
  isTest: z.boolean(),
  evacuationStatus: z.enum(evacuationStatuses),
  threatLocationDetails: z.string().nullable().optional(),
  resolved: z.boolean(),
  resolvedAt: z.string().nullable().optional(),
  resolvedByName: z.string().nullable().optional(),
  audioClips: z.array(AudioClipMeta),
  legacyId: z.string().nullable().optional(),
});
export type EmergencyIncident = z.infer<typeof EmergencyIncident>;

export const responseStatuses = ["responding", "on_site", "standby", "completed"] as const;
export const ResponseStatus = z.enum(responseStatuses);
export type ResponseStatus = z.infer<typeof ResponseStatus>;

export const EmergencyResponse = z.object({
  ...base,
  incidentId: z.string(),
  userId: z.string().nullable().optional(),         // auth user id
  responderName: z.string().nullable().optional(),
  respondedAt: z.string(),
  responseRole: z.string().nullable().optional(),
  assistanceType: z.string().nullable().optional(),
  itemsBringing: z.array(z.string()),
  estimatedArrival: z.string().nullable().optional(),
  status: ResponseStatus,
  statusUpdates: z.array(z.object({ status: z.string(), message: z.string().optional(), timestamp: z.string() })),
  message: z.string().nullable().optional(),
  isRemote: z.boolean(),
  distanceMeters: z.number().nullable().optional(),
  legacyId: z.string().nullable().optional(),
});
export type EmergencyResponse = z.infer<typeof EmergencyResponse>;

export const AssistanceRequest = z.object({
  ...base,
  requestedBy: z.string().nullable().optional(),
  requestedByName: z.string(),
  locationId: z.string().nullable().optional(),
  locationName: z.string().nullable().optional(),
  assistanceType: z.string(),
  urgency: z.enum(["now", "within_5_mins"]),
  notes: z.string().nullable().optional(),
  responders: z.array(z.object({ userId: z.string(), name: z.string(), eta: z.string().optional(), respondedAt: z.string() })),
  resolved: z.boolean(),
  resolvedAt: z.string().nullable().optional(),
  resolvedByName: z.string().nullable().optional(),
  legacyId: z.string().nullable().optional(),
});
export type AssistanceRequest = z.infer<typeof AssistanceRequest>;

export const ResponseDefaults = z.object({
  assistanceType: z.string().optional(),
  itemsBringing: z.array(z.string()).optional(),
  estimatedArrival: z.string().optional(),
});
export type ResponseDefaults = z.infer<typeof ResponseDefaults>;

export const weekDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type WeekDay = (typeof weekDays)[number];

/** A person's emergency setup: where they are on a given day, their usual role, per-code defaults. */
export const EmergencyResponderProfile = z.object({
  ...base,
  /** Anchored on the employee so admins can set people up before they have a login. */
  employeeId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),         // auth user id, when known
  fullName: z.string().nullable().optional(),
  emergencyRole: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  /** A location id, or "remote". */
  defaultLocationId: z.string().nullable().optional(),
  clockedInLocationId: z.string().nullable().optional(),
  clockedInDate: z.string().nullable().optional(), // YYYY-MM-DD the override is valid for
  /** Day → location id | "remote" | "off". */
  weeklySchedule: z.record(z.string(), z.string()),
  seniority: z.number().nullable().optional(),
  codeDefaults: z.record(z.string(), ResponseDefaults),
  canListenAudio: z.boolean(),
  showInContacts: z.boolean(),
  appQuizPassedAt: z.string().nullable().optional(),
  sopQuizPassedAt: z.string().nullable().optional(),
});
export type EmergencyResponderProfile = z.infer<typeof EmergencyResponderProfile>;

export const EmergencyLocationRole = z.object({
  ...base,
  employeeId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  locationId: z.string(),
  codeName: z.string(),
  responseRole: z.string(),
  expectedAssistance: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type EmergencyLocationRole = z.infer<typeof EmergencyLocationRole>;

export const EmergencyAudioLog = z.object({
  ...base,
  incidentId: z.string().nullable().optional(),
  incidentLabel: z.string().nullable().optional(),
  action: z.enum(["listened_live", "saved_clip", "played_clip", "exported_clip", "deleted_clip", "accessed", "downloaded_clip", "downloaded_all", "deleted_audio"]),
  performedBy: z.string().nullable().optional(),
  performedByName: z.string(),
  performedByEmail: z.string().nullable().optional(),
  clipIndex: z.number().nullable().optional(),
  clipCount: z.number().nullable().optional(),
  deviceLabel: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
});
export type EmergencyAudioLog = z.infer<typeof EmergencyAudioLog>;

/* ------------------- controlled substances: shipments ------------------- */
// A delivery arrives as ONE manifest (packing slip / invoice / DEA 222)
// covering several sealed BOXES, each with a DSCSA label (GTIN, serial, lot,
// expiry) and N vials inside. Those two levels sit above the vial-level
// custody records in ControlledSubstanceItem.

export const CsManifest = z.object({
  ...base,
  supplierName: z.string().nullable().optional(),
  supplierDea: z.string().nullable().optional(),
  customerDea: z.string().nullable().optional(),
  shipToName: z.string().nullable().optional(),
  shipToAddress: z.string().nullable().optional(),
  poNumber: z.string().nullable().optional(),
  orderNumber: z.string().nullable().optional(),
  packingSlipNumber: z.string().nullable().optional(),
  orderDate: z.string().nullable().optional(),
  receivedDate: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  receivedByName: z.string().nullable().optional(),
  receivedByUserId: z.string().nullable().optional(),
  /** Photos/PDFs this was read from (storage paths). */
  documentUrls: z.array(z.string()),
  /** What the AI returned, kept verbatim next to what was actually saved. */
  extracted: z.unknown().nullable().optional(),
  aiConfidence: z.string().nullable().optional(),
  expectedBoxCount: z.number().nullable().optional(),
  expectedUnitCount: z.number().nullable().optional(),
  discrepancy: z.boolean(),
  discrepancyNote: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type CsManifest = z.infer<typeof CsManifest>;

export const CsBox = z.object({
  ...base,
  manifestId: z.string().nullable().optional(),
  /** The practice's own box label, e.g. "M-A". */
  label: z.string(),
  /** As written on the box ("1" in "1 = A"). */
  boxNumber: z.number().nullable().optional(),
  substanceName: z.string().nullable().optional(),
  ndc: z.string().nullable().optional(),
  gtin: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  lotNumber: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  /** The label gave a month ("2028/05"); the date is that month's last day. */
  expirationIsMonth: z.boolean(),
  unitCount: z.number(),
  unitVolume: z.number().nullable().optional(),
  unitVolumeUom: z.string().nullable().optional(),
  strengthPerUnit: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  opened: z.boolean(),
  notes: z.string().nullable().optional(),
});
export type CsBox = z.infer<typeof CsBox>;


