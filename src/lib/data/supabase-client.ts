/**
 * Real DataClient implementation backed by Supabase.
 * Implements the exact same Collection<T> interface as the mock so no page
 * or hook needs to change — only src/lib/data/index.ts switches which client
 * is constructed.
 *
 * Column name mapping: DB uses snake_case; TS types use camelCase.
 * Each table section handles that mapping in fromRow() / toRow().
 */

import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Collection, DataClient } from "./client";
import type {
  AuditLog,
  Benefit,
  ChatMessage,
  CompetencyRecord,
  CompletedForm,
  ComplianceDocument,
  ComplianceTask,
  ComplianceUserProfile,
  ControlledSubstanceLog,
  CredentialRecord,
  DisciplinaryAction,
  EmergencyDrill,
  Employee,
  EmployeeDocument,
  FillableFormTemplate,
  FormAssignment,
  FormField,
  InsurancePolicyRecord,
  InventoryItem,
  Notification,
  OrganizationSettings,
  OSHARecord,
  PayrollRecord,
  PerformanceReview,
  PerformanceRock,
  PolicyAcknowledgment,
  PTOBalance,
  RecordVersion,
  RegulatorySource,
  RiskManagementCase,
  Incident,
  CorrectiveAction,
  BreachAssessment,
  SraAssessment,
  SraFinding,
  ExclusionScreening,
  CcoPreference,
  AgendaSnooze,
  NavPreference,
  ActivityLog,
  BackupRecord,
  RoleRequirement,
  Audit,
  AuditItem,
  SDSRecord,
  TimeClockEntry,
  TimeOffRequest,
  TrainingAssignment,
  TrainingAttempt,
  TrainingModule,
  TrainingQuestion,
  VendorRecord,
  WorkLocation,
} from "./schema";

// ─── helpers ─────────────────────────────────────────────────────────────────

function toISO(v: string | null | undefined): string | null | undefined {
  if (!v) return v as null | undefined;
  return v; // already ISO from Supabase
}

function makeCollection<T extends { id: string }>(
  supabase: SupabaseClient,
  table: string,
  fromRow: (row: Record<string, unknown>) => T,
  toRow: (data: Partial<T>) => Record<string, unknown>,
): Collection<T> {
  return {
    async list() {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order("created_date", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(fromRow);
    },

    async get(id: string) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", id)
        .single();
      if (error) return null;
      return fromRow(data);
    },

    async create(input) {
      const row = toRow(input as Partial<T>);
      const { data, error } = await supabase
        .from(table)
        .insert(row)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return fromRow(data);
    },

    async update(id, patch) {
      const row = toRow(patch as Partial<T>);
      const { data, error } = await supabase
        .from(table)
        .update(row)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return fromRow(data);
    },

    async remove(id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

// ─── column mappers ───────────────────────────────────────────────────────────

function profileFrom(r: Record<string, unknown>): ComplianceUserProfile {
  return {
    id: r.id as string,
    createdDate: r.created_date as string,
    userId: r.user_id as string,
    fullName: r.full_name as string,
    email: r.email as string,
    accountRole: r.account_role as ComplianceUserProfile["accountRole"],
    staffRole: r.staff_role as string | undefined,
    professionalRole: r.professional_role as string | undefined,
    department: r.department as ComplianceUserProfile["department"],
    primaryLocationId: r.primary_location_id as string | undefined,
    active: r.active as boolean,
  };
}
function profileTo(d: Partial<ComplianceUserProfile>) {
  return {
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.fullName !== undefined && { full_name: d.fullName }),
    ...(d.email !== undefined && { email: d.email }),
    ...(d.accountRole !== undefined && { account_role: d.accountRole }),
    ...(d.staffRole !== undefined && { staff_role: d.staffRole }),
    ...(d.professionalRole !== undefined && { professional_role: d.professionalRole }),
    ...(d.department !== undefined && { department: d.department }),
    ...(d.primaryLocationId !== undefined && { primary_location_id: d.primaryLocationId }),
    ...(d.active !== undefined && { active: d.active }),
  };
}

function locationFrom(r: Record<string, unknown>): WorkLocation {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    name: r.name as string, type: r.type as WorkLocation["type"],
    address: r.address as string | undefined, city: r.city as string | undefined,
    state: r.state as string | undefined, zip: r.zip as string | undefined,
    active: r.active as boolean,
    lat: (r.lat as number | null) ?? undefined,
    lng: (r.lng as number | null) ?? undefined,
  };
}
function locationTo(d: Partial<WorkLocation>) {
  return {
    ...(d.name !== undefined && { name: d.name }),
    ...(d.type !== undefined && { type: d.type }),
    ...(d.address !== undefined && { address: d.address }),
    ...(d.city !== undefined && { city: d.city }),
    ...(d.state !== undefined && { state: d.state }),
    ...(d.zip !== undefined && { zip: d.zip }),
    ...(d.active !== undefined && { active: d.active }),
    ...(d.lat !== undefined && { lat: d.lat }),
    ...(d.lng !== undefined && { lng: d.lng }),
  };
}

function taskFrom(r: Record<string, unknown>): ComplianceTask {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    title: r.title as string, description: r.description as string | undefined,
    category: r.category as string | undefined,
    status: r.status as ComplianceTask["status"],
    priority: r.priority as ComplianceTask["priority"],
    dueDate: toISO(r.due_date as string), assignedToUserId: r.assigned_to_user_id as string | undefined,
    assignedToName: r.assigned_to_name as string | undefined,
    locationId: r.location_id as string | undefined,
    completedAt: toISO(r.completed_at as string),
  };
}
function taskTo(d: Partial<ComplianceTask>) {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.category !== undefined && { category: d.category }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.priority !== undefined && { priority: d.priority }),
    ...(d.dueDate !== undefined && { due_date: d.dueDate }),
    ...(d.assignedToUserId !== undefined && { assigned_to_user_id: d.assignedToUserId }),
    ...(d.assignedToName !== undefined && { assigned_to_name: d.assignedToName }),
    ...(d.locationId !== undefined && { location_id: d.locationId }),
    ...(d.completedAt !== undefined && { completed_at: d.completedAt }),
  };
}

function credentialFrom(r: Record<string, unknown>): CredentialRecord {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    employeeUserId: r.employee_user_id as string | undefined,
    employeeName: r.employee_name as string,
    credentialName: r.credential_name as string,
    credentialType: r.credential_type as CredentialRecord["credentialType"],
    issuingBody: r.issuing_body as string | undefined,
    credentialNumber: r.credential_number as string | undefined,
    issueDate: r.issue_date as string | undefined,
    expirationDate: r.expiration_date as string | undefined,
    locationId: r.location_id as string | undefined,
    documentUrl: r.document_url as string | undefined,
  };
}
function credentialTo(d: Partial<CredentialRecord>) {
  return {
    ...(d.employeeUserId !== undefined && { employee_user_id: d.employeeUserId }),
    ...(d.employeeName !== undefined && { employee_name: d.employeeName }),
    ...(d.credentialName !== undefined && { credential_name: d.credentialName }),
    ...(d.credentialType !== undefined && { credential_type: d.credentialType }),
    ...(d.issuingBody !== undefined && { issuing_body: d.issuingBody }),
    ...(d.credentialNumber !== undefined && { credential_number: d.credentialNumber }),
    ...(d.issueDate !== undefined && { issue_date: d.issueDate }),
    ...(d.expirationDate !== undefined && { expiration_date: d.expirationDate }),
    ...(d.locationId !== undefined && { location_id: d.locationId }),
    ...(d.documentUrl !== undefined && { document_url: d.documentUrl }),
  };
}

function documentFrom(r: Record<string, unknown>): ComplianceDocument {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    title: r.title as string, documentType: r.document_type as string,
    complianceArea: r.compliance_area as string | undefined,
    summary: r.summary as string | undefined,
    status: r.status as ComplianceDocument["status"],
    accessLevel: r.access_level as ComplianceDocument["accessLevel"],
    version: r.version as string,
    reviewDate: r.review_date as string | undefined,
    requiresAcknowledgment: r.requires_acknowledgment as boolean,
    fileUrl: r.file_url as string | undefined,
    content: r.content as string | undefined,
  };
}
function documentTo(d: Partial<ComplianceDocument>) {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.documentType !== undefined && { document_type: d.documentType }),
    ...(d.complianceArea !== undefined && { compliance_area: d.complianceArea }),
    ...(d.summary !== undefined && { summary: d.summary }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.accessLevel !== undefined && { access_level: d.accessLevel }),
    ...(d.version !== undefined && { version: d.version }),
    ...(d.reviewDate !== undefined && { review_date: d.reviewDate }),
    ...(d.requiresAcknowledgment !== undefined && { requires_acknowledgment: d.requiresAcknowledgment }),
    ...(d.fileUrl !== undefined && { file_url: d.fileUrl }),
    ...(d.content !== undefined && { content: d.content }),
  };
}

function trainingModuleFrom(r: Record<string, unknown>): TrainingModule {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    title: r.title as string, description: r.description as string | undefined,
    trainingType: r.training_type as string,
    frequencyMonths: r.frequency_months as number | undefined,
    passingScore: r.passing_score as number,
    active: r.active as boolean,
  };
}
function trainingModuleTo(d: Partial<TrainingModule>) {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.trainingType !== undefined && { training_type: d.trainingType }),
    ...(d.frequencyMonths !== undefined && { frequency_months: d.frequencyMonths }),
    ...(d.passingScore !== undefined && { passing_score: d.passingScore }),
    ...(d.active !== undefined && { active: d.active }),
  };
}

function trainingAssignmentFrom(r: Record<string, unknown>): TrainingAssignment {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    trainingModuleId: r.training_module_id as string,
    moduleTitle: r.module_title as string,
    assignedToUserId: r.assigned_to_user_id as string,
    assignedToName: r.assigned_to_name as string,
    status: r.status as TrainingAssignment["status"],
    dueDate: r.due_date as string | undefined,
    completedAt: toISO(r.completed_at as string),
    score: r.score as number | undefined,
  };
}
function trainingAssignmentTo(d: Partial<TrainingAssignment>) {
  return {
    ...(d.trainingModuleId !== undefined && { training_module_id: d.trainingModuleId }),
    ...(d.moduleTitle !== undefined && { module_title: d.moduleTitle }),
    ...(d.assignedToUserId !== undefined && { assigned_to_user_id: d.assignedToUserId }),
    ...(d.assignedToName !== undefined && { assigned_to_name: d.assignedToName }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.dueDate !== undefined && { due_date: d.dueDate }),
    ...(d.completedAt !== undefined && { completed_at: d.completedAt }),
    ...(d.score !== undefined && { score: d.score }),
  };
}

function oshaFrom(r: Record<string, unknown>): OSHARecord {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    recordTitle: r.record_title as string,
    recordType: r.record_type as OSHARecord["recordType"],
    eventDate: r.event_date as string | undefined,
    description: r.description as string | undefined,
    status: r.status as OSHARecord["status"],
    recordabilityStatus: r.recordability_status as OSHARecord["recordabilityStatus"],
    injuredEmployeeName: r.injured_employee_name as string | undefined,
    injuredEmployeeUserId: (r.injured_employee_user_id as string | null) ?? undefined,
    bodyPart: r.body_part as string | undefined,
    natureOfInjury: r.nature_of_injury as string | undefined,
    caseOutcome: (r.case_outcome as OSHARecord["caseOutcome"]) ?? undefined,
    daysAway: (r.days_away as number | null) ?? undefined,
    daysRestricted: (r.days_restricted as number | null) ?? undefined,
    treatmentBeyondFirstAid: (r.treatment_beyond_first_aid as boolean) ?? false,
    physicianName: r.physician_name as string | undefined,
    documentUrl: (r.document_url as string | null) ?? undefined,
  };
}
function oshaTo(d: Partial<OSHARecord>) {
  return {
    ...(d.recordTitle !== undefined && { record_title: d.recordTitle }),
    ...(d.recordType !== undefined && { record_type: d.recordType }),
    ...(d.eventDate !== undefined && { event_date: d.eventDate }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.recordabilityStatus !== undefined && { recordability_status: d.recordabilityStatus }),
    ...(d.injuredEmployeeName !== undefined && { injured_employee_name: d.injuredEmployeeName }),
    ...(d.injuredEmployeeUserId !== undefined && { injured_employee_user_id: d.injuredEmployeeUserId }),
    ...(d.bodyPart !== undefined && { body_part: d.bodyPart }),
    ...(d.natureOfInjury !== undefined && { nature_of_injury: d.natureOfInjury }),
    ...(d.caseOutcome !== undefined && { case_outcome: d.caseOutcome }),
    ...(d.daysAway !== undefined && { days_away: d.daysAway }),
    ...(d.daysRestricted !== undefined && { days_restricted: d.daysRestricted }),
    ...(d.treatmentBeyondFirstAid !== undefined && { treatment_beyond_first_aid: d.treatmentBeyondFirstAid }),
    ...(d.physicianName !== undefined && { physician_name: d.physicianName }),
    ...(d.documentUrl !== undefined && { document_url: d.documentUrl }),
  };
}

function sdsFrom(r: Record<string, unknown>): SDSRecord {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    productName: r.product_name as string,
    manufacturer: r.manufacturer as string | undefined,
    upc: r.upc as string | undefined,
    signalWord: r.signal_word as SDSRecord["signalWord"],
    status: r.status as SDSRecord["status"],
  };
}
function sdsTo(d: Partial<SDSRecord>) {
  return {
    ...(d.productName !== undefined && { product_name: d.productName }),
    ...(d.manufacturer !== undefined && { manufacturer: d.manufacturer }),
    ...(d.upc !== undefined && { upc: d.upc }),
    ...(d.signalWord !== undefined && { signal_word: d.signalWord }),
    ...(d.status !== undefined && { status: d.status }),
  };
}

function riskFrom(r: Record<string, unknown>): RiskManagementCase {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    caseTitle: r.case_title as string,
    caseType: r.case_type as string,
    description: r.description as string | undefined,
    severity: r.severity as RiskManagementCase["severity"],
    status: r.status as RiskManagementCase["status"],
    accessLevel: r.access_level as RiskManagementCase["accessLevel"],
    reportedByName: r.reported_by_name as string | undefined,
    incidentDate: r.incident_date as string | undefined,
  };
}
function riskTo(d: Partial<RiskManagementCase>) {
  return {
    ...(d.caseTitle !== undefined && { case_title: d.caseTitle }),
    ...(d.caseType !== undefined && { case_type: d.caseType }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.severity !== undefined && { severity: d.severity }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.accessLevel !== undefined && { access_level: d.accessLevel }),
    ...(d.reportedByName !== undefined && { reported_by_name: d.reportedByName }),
    ...(d.incidentDate !== undefined && { incident_date: d.incidentDate }),
  };
}

function incidentFrom(r: Record<string, unknown>): Incident {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    title: r.title as string,
    reportType: (r.report_type as Incident["reportType"]) ?? "other",
    category: r.category as Incident["category"],
    description: r.description as string | undefined,
    severity: r.severity as Incident["severity"],
    status: r.status as Incident["status"],
    anonymous: r.anonymous as boolean,
    attested: (r.attested as boolean) ?? false,
    reportedByUserId: (r.reported_by_user_id as string | null) ?? undefined,
    reportedByName: r.reported_by_name as string | undefined,
    locationId: (r.location_id as string | null) ?? undefined,
    occurredDate: toISO(r.occurred_date as string),
    evidenceUrl: (r.evidence_url as string | null) ?? undefined,
    resolutionSummary: r.resolution_summary as string | undefined,
  };
}
function incidentTo(d: Partial<Incident>) {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.reportType !== undefined && { report_type: d.reportType }),
    ...(d.category !== undefined && { category: d.category }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.severity !== undefined && { severity: d.severity }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.anonymous !== undefined && { anonymous: d.anonymous }),
    ...(d.attested !== undefined && { attested: d.attested }),
    ...(d.reportedByUserId !== undefined && { reported_by_user_id: d.reportedByUserId }),
    ...(d.reportedByName !== undefined && { reported_by_name: d.reportedByName }),
    ...(d.locationId !== undefined && { location_id: d.locationId }),
    ...(d.occurredDate !== undefined && { occurred_date: d.occurredDate }),
    ...(d.evidenceUrl !== undefined && { evidence_url: d.evidenceUrl }),
    ...(d.resolutionSummary !== undefined && { resolution_summary: d.resolutionSummary }),
  };
}

function correctiveActionFrom(r: Record<string, unknown>): CorrectiveAction {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    incidentId: (r.incident_id as string | null) ?? undefined,
    riskCaseId: (r.risk_case_id as string | null) ?? undefined,
    title: r.title as string,
    rootCause: r.root_cause as string | undefined,
    actionPlan: r.action_plan as string | undefined,
    ownerName: r.owner_name as string | undefined,
    ownerUserId: (r.owner_user_id as string | null) ?? undefined,
    dueDate: toISO(r.due_date as string),
    status: r.status as CorrectiveAction["status"],
    verifiedByName: r.verified_by_name as string | undefined,
    verifiedDate: toISO(r.verified_date as string),
  };
}
function correctiveActionTo(d: Partial<CorrectiveAction>) {
  return {
    ...(d.incidentId !== undefined && { incident_id: d.incidentId }),
    ...(d.riskCaseId !== undefined && { risk_case_id: d.riskCaseId }),
    ...(d.title !== undefined && { title: d.title }),
    ...(d.rootCause !== undefined && { root_cause: d.rootCause }),
    ...(d.actionPlan !== undefined && { action_plan: d.actionPlan }),
    ...(d.ownerName !== undefined && { owner_name: d.ownerName }),
    ...(d.ownerUserId !== undefined && { owner_user_id: d.ownerUserId }),
    ...(d.dueDate !== undefined && { due_date: d.dueDate }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.verifiedByName !== undefined && { verified_by_name: d.verifiedByName }),
    ...(d.verifiedDate !== undefined && { verified_date: d.verifiedDate }),
  };
}

function breachFrom(r: Record<string, unknown>): BreachAssessment {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    title: r.title as string,
    discoveredDate: toISO(r.discovered_date as string),
    description: r.description as string | undefined,
    factor1Nature: r.factor1_nature as string | undefined,
    factor1Rating: r.factor1_rating as BreachAssessment["factor1Rating"],
    factor2Recipient: r.factor2_recipient as string | undefined,
    factor2Rating: r.factor2_rating as BreachAssessment["factor2Rating"],
    factor3Acquired: r.factor3_acquired as string | undefined,
    factor3Rating: r.factor3_rating as BreachAssessment["factor3Rating"],
    factor4Mitigation: r.factor4_mitigation as string | undefined,
    factor4Rating: r.factor4_rating as BreachAssessment["factor4Rating"],
    probability: r.probability as BreachAssessment["probability"],
    determination: r.determination as BreachAssessment["determination"],
    status: r.status as BreachAssessment["status"],
    assessedByName: r.assessed_by_name as string | undefined,
    notes: r.notes as string | undefined,
  };
}
function breachTo(d: Partial<BreachAssessment>) {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.discoveredDate !== undefined && { discovered_date: d.discoveredDate }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.factor1Nature !== undefined && { factor1_nature: d.factor1Nature }),
    ...(d.factor1Rating !== undefined && { factor1_rating: d.factor1Rating }),
    ...(d.factor2Recipient !== undefined && { factor2_recipient: d.factor2Recipient }),
    ...(d.factor2Rating !== undefined && { factor2_rating: d.factor2Rating }),
    ...(d.factor3Acquired !== undefined && { factor3_acquired: d.factor3Acquired }),
    ...(d.factor3Rating !== undefined && { factor3_rating: d.factor3Rating }),
    ...(d.factor4Mitigation !== undefined && { factor4_mitigation: d.factor4Mitigation }),
    ...(d.factor4Rating !== undefined && { factor4_rating: d.factor4Rating }),
    ...(d.probability !== undefined && { probability: d.probability }),
    ...(d.determination !== undefined && { determination: d.determination }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.assessedByName !== undefined && { assessed_by_name: d.assessedByName }),
    ...(d.notes !== undefined && { notes: d.notes }),
  };
}

function sraAssessmentFrom(r: Record<string, unknown>): SraAssessment {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    title: r.title as string,
    periodYear: (r.period_year as number | null) ?? 0,
    status: r.status as SraAssessment["status"],
    startedDate: toISO(r.started_date as string),
    completedDate: toISO(r.completed_date as string),
    completedByName: r.completed_by_name as string | undefined,
    scopeNotes: r.scope_notes as string | undefined,
  };
}
function sraAssessmentTo(d: Partial<SraAssessment>) {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.periodYear !== undefined && { period_year: d.periodYear }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.startedDate !== undefined && { started_date: d.startedDate }),
    ...(d.completedDate !== undefined && { completed_date: d.completedDate }),
    ...(d.completedByName !== undefined && { completed_by_name: d.completedByName }),
    ...(d.scopeNotes !== undefined && { scope_notes: d.scopeNotes }),
  };
}

function sraFindingFrom(r: Record<string, unknown>): SraFinding {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    assessmentId: r.assessment_id as string,
    category: r.category as SraFinding["category"],
    question: r.question as string,
    response: r.response as string | undefined,
    status: (r.status as SraFinding["status"] | null) ?? "na",
    evidence: (r.evidence as string[] | null) ?? [],
    citation: r.citation as string | undefined,
    aiSuggested: (r.ai_suggested as boolean | null) ?? false,
    riskLevel: r.risk_level as SraFinding["riskLevel"],
    remediation: r.remediation as string | undefined,
    remediationOwner: r.remediation_owner as string | undefined,
    remediationDue: toISO(r.remediation_due as string),
    remediationStatus: r.remediation_status as SraFinding["remediationStatus"],
    notes: r.notes as string | undefined,
  };
}
function sraFindingTo(d: Partial<SraFinding>) {
  return {
    ...(d.assessmentId !== undefined && { assessment_id: d.assessmentId }),
    ...(d.category !== undefined && { category: d.category }),
    ...(d.question !== undefined && { question: d.question }),
    ...(d.response !== undefined && { response: d.response }),
    ...(d.riskLevel !== undefined && { risk_level: d.riskLevel }),
    ...(d.remediation !== undefined && { remediation: d.remediation }),
    ...(d.remediationOwner !== undefined && { remediation_owner: d.remediationOwner }),
    ...(d.remediationDue !== undefined && { remediation_due: d.remediationDue }),
    ...(d.remediationStatus !== undefined && { remediation_status: d.remediationStatus }),
    ...(d.notes !== undefined && { notes: d.notes }),
  };
}

function exclusionFrom(r: Record<string, unknown>): ExclusionScreening {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    subjectType: r.subject_type as ExclusionScreening["subjectType"],
    subjectName: r.subject_name as string,
    subjectUserId: (r.subject_user_id as string | null) ?? undefined,
    vendorId: (r.vendor_id as string | null) ?? undefined,
    sources: r.sources as string | undefined,
    screenedDate: toISO(r.screened_date as string),
    result: r.result as ExclusionScreening["result"],
    notes: r.notes as string | undefined,
    screenedByName: r.screened_by_name as string | undefined,
    documentUrl: (r.document_url as string | null) ?? undefined,
  };
}
function exclusionTo(d: Partial<ExclusionScreening>) {
  return {
    ...(d.subjectType !== undefined && { subject_type: d.subjectType }),
    ...(d.subjectName !== undefined && { subject_name: d.subjectName }),
    ...(d.subjectUserId !== undefined && { subject_user_id: d.subjectUserId }),
    ...(d.vendorId !== undefined && { vendor_id: d.vendorId }),
    ...(d.sources !== undefined && { sources: d.sources }),
    ...(d.screenedDate !== undefined && { screened_date: d.screenedDate }),
    ...(d.result !== undefined && { result: d.result }),
    ...(d.notes !== undefined && { notes: d.notes }),
    ...(d.screenedByName !== undefined && { screened_by_name: d.screenedByName }),
    ...(d.documentUrl !== undefined && { document_url: d.documentUrl }),
  };
}

function activityLogFrom(r: Record<string, unknown>): ActivityLog {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    actorType: r.actor_type as ActivityLog["actorType"],
    actorName: (r.actor_name as string | null) ?? undefined,
    assistant: (r.assistant as string | null) ?? undefined,
    action: r.action as string,
    entityType: (r.entity_type as string | null) ?? undefined,
    entityId: (r.entity_id as string | null) ?? undefined,
    summary: r.summary as string,
    reversible: (r.reversible as boolean | null) ?? false,
    undone: (r.undone as boolean | null) ?? false,
    undoneAt: toISO(r.undone_at as string),
    undoneBy: (r.undone_by as string | null) ?? undefined,
  };
}
function activityLogTo(d: Partial<ActivityLog>) {
  return {
    ...(d.actorType !== undefined && { actor_type: d.actorType }),
    ...(d.actorName !== undefined && { actor_name: d.actorName }),
    ...(d.assistant !== undefined && { assistant: d.assistant }),
    ...(d.action !== undefined && { action: d.action }),
    ...(d.entityType !== undefined && { entity_type: d.entityType }),
    ...(d.entityId !== undefined && { entity_id: d.entityId }),
    ...(d.summary !== undefined && { summary: d.summary }),
    ...(d.reversible !== undefined && { reversible: d.reversible }),
    ...(d.undone !== undefined && { undone: d.undone }),
    ...(d.undoneAt !== undefined && { undone_at: d.undoneAt }),
    ...(d.undoneBy !== undefined && { undone_by: d.undoneBy }),
  };
}

function backupFrom(r: Record<string, unknown>): BackupRecord {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    performedBy: (r.performed_by as string | null) ?? undefined,
    itemCount: (r.item_count as number | null) ?? 0,
    format: (r.format as string | null) ?? undefined,
    notes: (r.notes as string | null) ?? undefined,
  };
}
function backupTo(d: Partial<BackupRecord>) {
  return {
    ...(d.performedBy !== undefined && { performed_by: d.performedBy }),
    ...(d.itemCount !== undefined && { item_count: d.itemCount }),
    ...(d.format !== undefined && { format: d.format }),
    ...(d.notes !== undefined && { notes: d.notes }),
  };
}

function ccoPreferenceFrom(r: Record<string, unknown>): CcoPreference {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    userId: r.user_id as string,
    horizonDays: (r.horizon_days as number | null) ?? 30,
    showLow: (r.show_low as boolean | null) ?? false,
    focusAreas: r.focus_areas as string | undefined,
    agentNotes: r.agent_notes as string | undefined,
  };
}
function ccoPreferenceTo(d: Partial<CcoPreference>) {
  return {
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.horizonDays !== undefined && { horizon_days: d.horizonDays }),
    ...(d.showLow !== undefined && { show_low: d.showLow }),
    ...(d.focusAreas !== undefined && { focus_areas: d.focusAreas }),
    ...(d.agentNotes !== undefined && { agent_notes: d.agentNotes }),
  };
}

function agendaSnoozeFrom(r: Record<string, unknown>): AgendaSnooze {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    userId: r.user_id as string,
    itemKey: r.item_key as string,
    snoozedUntil: toISO(r.snoozed_until as string),
  };
}
function agendaSnoozeTo(d: Partial<AgendaSnooze>) {
  return {
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.itemKey !== undefined && { item_key: d.itemKey }),
    ...(d.snoozedUntil !== undefined && { snoozed_until: d.snoozedUntil }),
  };
}

function ackFrom(r: Record<string, unknown>): PolicyAcknowledgment {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    userId: r.user_id as string, userName: r.user_name as string,
    documentId: r.document_id as string, documentTitle: r.document_title as string,
    status: r.status as PolicyAcknowledgment["status"],
    acknowledgedAt: toISO(r.acknowledged_at as string),
    expiresAt: toISO(r.expires_at as string),
  };
}
function ackTo(d: Partial<PolicyAcknowledgment>) {
  return {
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.userName !== undefined && { user_name: d.userName }),
    ...(d.documentId !== undefined && { document_id: d.documentId }),
    ...(d.documentTitle !== undefined && { document_title: d.documentTitle }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.acknowledgedAt !== undefined && { acknowledged_at: d.acknowledgedAt }),
    ...(d.expiresAt !== undefined && { expires_at: d.expiresAt }),
  };
}

function regFrom(r: Record<string, unknown>): RegulatorySource {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    title: r.title as string, citationLabel: r.citation_label as string | undefined,
    issuingBody: r.issuing_body as string | undefined,
    sourceType: r.source_type as RegulatorySource["sourceType"],
    jurisdiction: r.jurisdiction as string | undefined,
    reviewStatus: r.review_status as RegulatorySource["reviewStatus"],
    lastCheckedAt: toISO(r.last_checked_at as string),
    officialUrl: r.official_url as string | undefined,
  };
}
function regTo(d: Partial<RegulatorySource>) {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.citationLabel !== undefined && { citation_label: d.citationLabel }),
    ...(d.issuingBody !== undefined && { issuing_body: d.issuingBody }),
    ...(d.sourceType !== undefined && { source_type: d.sourceType }),
    ...(d.jurisdiction !== undefined && { jurisdiction: d.jurisdiction }),
    ...(d.reviewStatus !== undefined && { review_status: d.reviewStatus }),
    ...(d.lastCheckedAt !== undefined && { last_checked_at: d.lastCheckedAt }),
    ...(d.officialUrl !== undefined && { official_url: d.officialUrl }),
  };
}

function recordVersionFrom(r: Record<string, unknown>): RecordVersion {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    entityType: r.entity_type as string,
    entityId: r.entity_id as string,
    versionNum: r.version_num as number,
    changeKind: r.change_kind as RecordVersion["changeKind"],
    effectiveFrom: toISO(r.effective_from as string),
    supersededAt: toISO(r.superseded_at as string),
    changedBy: (r.changed_by as string | null) ?? undefined,
    filePath: (r.file_path as string | null) ?? undefined,
    snapshot: (r.snapshot as Record<string, unknown>) ?? {},
  };
}
// History is written server-side by a trigger; the client never writes it.
function recordVersionTo(): Record<string, unknown> {
  return {};
}

function insuranceFrom(r: Record<string, unknown>): InsurancePolicyRecord {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    policyName: r.policy_name as string, policyType: r.policy_type as string,
    carrierName: r.carrier_name as string | undefined,
    policyNumber: r.policy_number as string | undefined,
    coverageAmountCents: r.coverage_amount_cents as number | undefined,
    annualPremiumCents: r.annual_premium_cents as number | undefined,
    renewalDate: r.renewal_date as string | undefined,
    holderUserId: r.holder_user_id as string | undefined,
    holderName: r.holder_name as string | undefined,
    documentUrl: r.document_url as string | undefined,
  };
}
function insuranceTo(d: Partial<InsurancePolicyRecord>) {
  return {
    ...(d.policyName !== undefined && { policy_name: d.policyName }),
    ...(d.policyType !== undefined && { policy_type: d.policyType }),
    ...(d.carrierName !== undefined && { carrier_name: d.carrierName }),
    ...(d.policyNumber !== undefined && { policy_number: d.policyNumber }),
    ...(d.coverageAmountCents !== undefined && { coverage_amount_cents: d.coverageAmountCents }),
    ...(d.annualPremiumCents !== undefined && { annual_premium_cents: d.annualPremiumCents }),
    ...(d.renewalDate !== undefined && { renewal_date: d.renewalDate }),
    ...(d.holderUserId !== undefined && { holder_user_id: d.holderUserId }),
    ...(d.holderName !== undefined && { holder_name: d.holderName }),
    ...(d.documentUrl !== undefined && { document_url: d.documentUrl }),
  };
}

function drillFrom(r: Record<string, unknown>): EmergencyDrill {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    drillTitle: r.drill_title as string, drillType: r.drill_type as string,
    scheduledDate: r.scheduled_date as string | undefined,
    status: r.status as EmergencyDrill["status"],
    participantCount: r.participant_count as number,
  };
}
function drillTo(d: Partial<EmergencyDrill>) {
  return {
    ...(d.drillTitle !== undefined && { drill_title: d.drillTitle }),
    ...(d.drillType !== undefined && { drill_type: d.drillType }),
    ...(d.scheduledDate !== undefined && { scheduled_date: d.scheduledDate }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.participantCount !== undefined && { participant_count: d.participantCount }),
  };
}

function employeeFrom(r: Record<string, unknown>): Employee {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    firstName: r.first_name as string, lastName: r.last_name as string,
    email: r.email as string, title: r.title as string | undefined,
    department: r.department as Employee["department"],
    employmentStatus: r.employment_status as Employee["employmentStatus"],
    workerType: (r.worker_type as Employee["workerType"] | null) ?? "employee",
    hireDate: r.hire_date as string | undefined,
    locationId: r.location_id as string | undefined,
    userId: r.user_id as string | undefined,
    managerId: (r.manager_id as string | null) ?? undefined,
    jobRole: (r.job_role as string | null) ?? undefined,
    reportsNote: (r.reports_note as string | null) ?? undefined,
  };
}
function employeeTo(d: Partial<Employee>) {
  return {
    ...(d.firstName !== undefined && { first_name: d.firstName }),
    ...(d.lastName !== undefined && { last_name: d.lastName }),
    ...(d.email !== undefined && { email: d.email }),
    ...(d.title !== undefined && { title: d.title }),
    ...(d.department !== undefined && { department: d.department }),
    ...(d.employmentStatus !== undefined && { employment_status: d.employmentStatus }),
    ...(d.workerType !== undefined && { worker_type: d.workerType }),
    ...(d.hireDate !== undefined && { hire_date: d.hireDate }),
    ...(d.locationId !== undefined && { location_id: d.locationId }),
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.managerId !== undefined && { manager_id: d.managerId }),
    ...(d.jobRole !== undefined && { job_role: d.jobRole }),
    ...(d.reportsNote !== undefined && { reports_note: d.reportsNote }),
  };
}

function auditRecFrom(r: Record<string, unknown>): Audit {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    title: r.title as string,
    auditType: r.audit_type as Audit["auditType"],
    auditDate: toISO(r.audit_date as string),
    auditorName: r.auditor_name as string | undefined,
    status: r.status as Audit["status"],
    scopeNotes: r.scope_notes as string | undefined,
  };
}
function auditRecTo(d: Partial<Audit>) {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.auditType !== undefined && { audit_type: d.auditType }),
    ...(d.auditDate !== undefined && { audit_date: d.auditDate }),
    ...(d.auditorName !== undefined && { auditor_name: d.auditorName }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.scopeNotes !== undefined && { scope_notes: d.scopeNotes }),
  };
}

function auditItemFrom(r: Record<string, unknown>): AuditItem {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    auditId: r.audit_id as string,
    category: r.category as string,
    question: r.question as string,
    result: r.result as AuditItem["result"],
    severity: r.severity as AuditItem["severity"],
    finding: r.finding as string | undefined,
    remediation: r.remediation as string | undefined,
    remediationOwner: r.remediation_owner as string | undefined,
    remediationDue: toISO(r.remediation_due as string),
    remediationStatus: r.remediation_status as AuditItem["remediationStatus"],
    citation: r.citation as string | undefined,
    aiSuggested: (r.ai_suggested as boolean | null) ?? false,
  };
}
function auditItemTo(d: Partial<AuditItem>) {
  return {
    ...(d.auditId !== undefined && { audit_id: d.auditId }),
    ...(d.category !== undefined && { category: d.category }),
    ...(d.question !== undefined && { question: d.question }),
    ...(d.result !== undefined && { result: d.result }),
    ...(d.severity !== undefined && { severity: d.severity }),
    ...(d.finding !== undefined && { finding: d.finding }),
    ...(d.remediation !== undefined && { remediation: d.remediation }),
    ...(d.remediationOwner !== undefined && { remediation_owner: d.remediationOwner }),
    ...(d.remediationDue !== undefined && { remediation_due: d.remediationDue }),
    ...(d.remediationStatus !== undefined && { remediation_status: d.remediationStatus }),
    ...(d.citation !== undefined && { citation: d.citation }),
    ...(d.aiSuggested !== undefined && { ai_suggested: d.aiSuggested }),
  };
}

function roleRequirementFrom(r: Record<string, unknown>): RoleRequirement {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    jobRole: r.job_role as string,
    reqType: r.req_type as RoleRequirement["reqType"],
    name: r.name as string,
    notes: r.notes as string | undefined,
  };
}
function roleRequirementTo(d: Partial<RoleRequirement>) {
  return {
    ...(d.jobRole !== undefined && { job_role: d.jobRole }),
    ...(d.reqType !== undefined && { req_type: d.reqType }),
    ...(d.name !== undefined && { name: d.name }),
    ...(d.notes !== undefined && { notes: d.notes }),
  };
}

function inventoryFrom(r: Record<string, unknown>): InventoryItem {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    itemName: r.item_name as string, itemType: r.item_type as string,
    status: r.status as InventoryItem["status"],
    condition: r.condition as InventoryItem["condition"],
    locationId: r.location_id as string | undefined,
    removedFromInventory: r.removed_from_inventory as boolean,
    quantity: (r.quantity as number | null) ?? 1,
    description: (r.description as string | null) ?? undefined,
    estimatedValueCents: (r.estimated_value_cents as number | null) ?? undefined,
    sublocation: (r.sublocation as string | null) ?? undefined,
    imageUrl: (r.image_url as string | null) ?? undefined,
    capturedAt: toISO(r.captured_at as string),
    capturedLat: (r.captured_lat as number | null) ?? undefined,
    capturedLng: (r.captured_lng as number | null) ?? undefined,
    aiIdentified: (r.ai_identified as boolean | null) ?? false,
    aiConfidence: (r.ai_confidence as string | null) ?? undefined,
  };
}
function inventoryTo(d: Partial<InventoryItem>) {
  return {
    ...(d.itemName !== undefined && { item_name: d.itemName }),
    ...(d.itemType !== undefined && { item_type: d.itemType }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.condition !== undefined && { condition: d.condition }),
    ...(d.locationId !== undefined && { location_id: d.locationId }),
    ...(d.removedFromInventory !== undefined && { removed_from_inventory: d.removedFromInventory }),
    ...(d.quantity !== undefined && { quantity: d.quantity }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.estimatedValueCents !== undefined && { estimated_value_cents: d.estimatedValueCents }),
    ...(d.sublocation !== undefined && { sublocation: d.sublocation }),
    ...(d.imageUrl !== undefined && { image_url: d.imageUrl }),
    ...(d.capturedAt !== undefined && { captured_at: d.capturedAt }),
    ...(d.capturedLat !== undefined && { captured_lat: d.capturedLat }),
    ...(d.capturedLng !== undefined && { captured_lng: d.capturedLng }),
    ...(d.aiIdentified !== undefined && { ai_identified: d.aiIdentified }),
    ...(d.aiConfidence !== undefined && { ai_confidence: d.aiConfidence }),
  };
}

function timeClockFrom(r: Record<string, unknown>): TimeClockEntry {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    userId: r.user_id as string, userName: r.user_name as string,
    clockInAt: r.clock_in_at as string,
    clockOutAt: toISO(r.clock_out_at as string),
    totalMinutes: r.total_minutes as number | undefined,
    status: r.status as TimeClockEntry["status"],
    editNote: r.edit_note as string | undefined,
    editedByName: r.edited_by_name as string | undefined,
  };
}
function timeClockTo(d: Partial<TimeClockEntry>) {
  return {
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.userName !== undefined && { user_name: d.userName }),
    ...(d.clockInAt !== undefined && { clock_in_at: d.clockInAt }),
    ...(d.clockOutAt !== undefined && { clock_out_at: d.clockOutAt }),
    ...(d.totalMinutes !== undefined && { total_minutes: d.totalMinutes }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.editNote !== undefined && { edit_note: d.editNote }),
    ...(d.editedByName !== undefined && { edited_by_name: d.editedByName }),
  };
}

function timeOffFrom(r: Record<string, unknown>): TimeOffRequest {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    userId: r.user_id as string, userName: r.user_name as string,
    requestType: r.request_type as TimeOffRequest["requestType"],
    startDate: r.start_date as string, endDate: r.end_date as string,
    hours: r.hours as number, reason: r.reason as string | undefined,
    status: r.status as TimeOffRequest["status"],
    reviewerName: r.reviewer_name as string | undefined,
    reviewNote: r.review_note as string | undefined,
    reviewedAt: toISO(r.reviewed_at as string),
  };
}
function timeOffTo(d: Partial<TimeOffRequest>) {
  return {
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.userName !== undefined && { user_name: d.userName }),
    ...(d.requestType !== undefined && { request_type: d.requestType }),
    ...(d.startDate !== undefined && { start_date: d.startDate }),
    ...(d.endDate !== undefined && { end_date: d.endDate }),
    ...(d.hours !== undefined && { hours: d.hours }),
    ...(d.reason !== undefined && { reason: d.reason }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.reviewerName !== undefined && { reviewer_name: d.reviewerName }),
    ...(d.reviewNote !== undefined && { review_note: d.reviewNote }),
    ...(d.reviewedAt !== undefined && { reviewed_at: d.reviewedAt }),
  };
}

function ptoBalanceFrom(r: Record<string, unknown>): PTOBalance {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    userId: r.user_id as string, userName: r.user_name as string,
    year: r.year as number,
    ptoAccruedHours: r.pto_accrued_hours as number,
    ptoUsedHours: r.pto_used_hours as number,
    sickAccruedHours: r.sick_accrued_hours as number,
    sickUsedHours: r.sick_used_hours as number,
    holidayAllottedHours: r.holiday_allotted_hours as number,
    holidayUsedHours: r.holiday_used_hours as number,
    carryOverHours: r.carry_over_hours as number,
  };
}
function ptoBalanceTo(d: Partial<PTOBalance>) {
  return {
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.userName !== undefined && { user_name: d.userName }),
    ...(d.year !== undefined && { year: d.year }),
    ...(d.ptoAccruedHours !== undefined && { pto_accrued_hours: d.ptoAccruedHours }),
    ...(d.ptoUsedHours !== undefined && { pto_used_hours: d.ptoUsedHours }),
    ...(d.sickAccruedHours !== undefined && { sick_accrued_hours: d.sickAccruedHours }),
    ...(d.sickUsedHours !== undefined && { sick_used_hours: d.sickUsedHours }),
    ...(d.holidayAllottedHours !== undefined && { holiday_allotted_hours: d.holidayAllottedHours }),
    ...(d.holidayUsedHours !== undefined && { holiday_used_hours: d.holidayUsedHours }),
    ...(d.carryOverHours !== undefined && { carry_over_hours: d.carryOverHours }),
  };
}

function payrollFrom(r: Record<string, unknown>): PayrollRecord {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    employeeId: r.employee_id as string, employeeName: r.employee_name as string,
    periodStart: r.period_start as string, periodEnd: r.period_end as string,
    regularHours: r.regular_hours as number, otHours: r.ot_hours as number,
    ptoHours: r.pto_hours as number,
    grossPayCents: r.gross_pay_cents as number,
    federalTaxCents: r.federal_tax_cents as number,
    stateTaxCents: r.state_tax_cents as number,
    socialSecurityCents: r.social_security_cents as number,
    medicareCents: r.medicare_cents as number,
    healthInsuranceCents: r.health_insurance_cents as number,
    retirement401kCents: r.retirement_401k_cents as number,
    otherDeductionsCents: r.other_deductions_cents as number,
    netPayCents: r.net_pay_cents as number,
    paymentMethod: r.payment_method as PayrollRecord["paymentMethod"],
    status: r.status as PayrollRecord["status"],
  };
}
function payrollTo(d: Partial<PayrollRecord>) {
  return {
    ...(d.employeeId !== undefined && { employee_id: d.employeeId }),
    ...(d.employeeName !== undefined && { employee_name: d.employeeName }),
    ...(d.periodStart !== undefined && { period_start: d.periodStart }),
    ...(d.periodEnd !== undefined && { period_end: d.periodEnd }),
    ...(d.regularHours !== undefined && { regular_hours: d.regularHours }),
    ...(d.otHours !== undefined && { ot_hours: d.otHours }),
    ...(d.ptoHours !== undefined && { pto_hours: d.ptoHours }),
    ...(d.grossPayCents !== undefined && { gross_pay_cents: d.grossPayCents }),
    ...(d.federalTaxCents !== undefined && { federal_tax_cents: d.federalTaxCents }),
    ...(d.stateTaxCents !== undefined && { state_tax_cents: d.stateTaxCents }),
    ...(d.socialSecurityCents !== undefined && { social_security_cents: d.socialSecurityCents }),
    ...(d.medicareCents !== undefined && { medicare_cents: d.medicareCents }),
    ...(d.healthInsuranceCents !== undefined && { health_insurance_cents: d.healthInsuranceCents }),
    ...(d.retirement401kCents !== undefined && { retirement_401k_cents: d.retirement401kCents }),
    ...(d.otherDeductionsCents !== undefined && { other_deductions_cents: d.otherDeductionsCents }),
    ...(d.netPayCents !== undefined && { net_pay_cents: d.netPayCents }),
    ...(d.paymentMethod !== undefined && { payment_method: d.paymentMethod }),
    ...(d.status !== undefined && { status: d.status }),
  };
}

function reviewFrom(r: Record<string, unknown>): PerformanceReview {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    employeeId: r.employee_id as string, employeeName: r.employee_name as string,
    reviewType: r.review_type as PerformanceReview["reviewType"],
    reviewDate: toISO(r.review_date as string),
    getsIt: r.gets_it as boolean, wantsIt: r.wants_it as boolean,
    hasCapacity: r.has_capacity as boolean,
    rightPersonRightSeat: r.right_person_right_seat as PerformanceReview["rightPersonRightSeat"],
    overallRating: r.overall_rating as PerformanceReview["overallRating"],
    rocks: (r.rocks as PerformanceRock[] | null) ?? [],
    notes: r.notes as string | undefined,
    reviewerName: r.reviewer_name as string | undefined,
    status: r.status as PerformanceReview["status"],
  };
}
function reviewTo(d: Partial<PerformanceReview>) {
  return {
    ...(d.employeeId !== undefined && { employee_id: d.employeeId }),
    ...(d.employeeName !== undefined && { employee_name: d.employeeName }),
    ...(d.reviewType !== undefined && { review_type: d.reviewType }),
    ...(d.reviewDate !== undefined && { review_date: d.reviewDate }),
    ...(d.getsIt !== undefined && { gets_it: d.getsIt }),
    ...(d.wantsIt !== undefined && { wants_it: d.wantsIt }),
    ...(d.hasCapacity !== undefined && { has_capacity: d.hasCapacity }),
    ...(d.rightPersonRightSeat !== undefined && { right_person_right_seat: d.rightPersonRightSeat }),
    ...(d.overallRating !== undefined && { overall_rating: d.overallRating }),
    ...(d.rocks !== undefined && { rocks: d.rocks }),
    ...(d.notes !== undefined && { notes: d.notes }),
    ...(d.reviewerName !== undefined && { reviewer_name: d.reviewerName }),
    ...(d.status !== undefined && { status: d.status }),
  };
}

function disciplinaryFrom(r: Record<string, unknown>): DisciplinaryAction {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    employeeId: r.employee_id as string, employeeName: r.employee_name as string,
    actionType: r.action_type as DisciplinaryAction["actionType"],
    reason: r.reason as string, description: r.description as string | undefined,
    witnessNames: (r.witness_names as string[] | null) ?? [],
    issuedDate: toISO(r.issued_date as string),
    followUpDate: toISO(r.follow_up_date as string),
    issuedByName: r.issued_by_name as string | undefined,
    status: r.status as DisciplinaryAction["status"],
    resolutionNote: r.resolution_note as string | undefined,
  };
}
function disciplinaryTo(d: Partial<DisciplinaryAction>) {
  return {
    ...(d.employeeId !== undefined && { employee_id: d.employeeId }),
    ...(d.employeeName !== undefined && { employee_name: d.employeeName }),
    ...(d.actionType !== undefined && { action_type: d.actionType }),
    ...(d.reason !== undefined && { reason: d.reason }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.witnessNames !== undefined && { witness_names: d.witnessNames }),
    ...(d.issuedDate !== undefined && { issued_date: d.issuedDate }),
    ...(d.followUpDate !== undefined && { follow_up_date: d.followUpDate }),
    ...(d.issuedByName !== undefined && { issued_by_name: d.issuedByName }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.resolutionNote !== undefined && { resolution_note: d.resolutionNote }),
  };
}

function benefitFrom(r: Record<string, unknown>): Benefit {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    benefitType: r.benefit_type as Benefit["benefitType"],
    provider: r.provider as string | undefined,
    planName: r.plan_name as string,
    policyNumber: r.policy_number as string | undefined,
    employerContributionCents: r.employer_contribution_cents as number,
    employeeContributionCents: r.employee_contribution_cents as number,
    eligibilityRules: r.eligibility_rules as string | undefined,
    enrollmentDeadline: toISO(r.enrollment_deadline as string),
    renewalDate: toISO(r.renewal_date as string),
    contactPhone: r.contact_phone as string | undefined,
    enrollmentUrl: r.enrollment_url as string | undefined,
    enrolledCount: r.enrolled_count as number,
    eligibleCount: r.eligible_count as number,
    active: r.active as boolean,
  };
}
function benefitTo(d: Partial<Benefit>) {
  return {
    ...(d.benefitType !== undefined && { benefit_type: d.benefitType }),
    ...(d.provider !== undefined && { provider: d.provider }),
    ...(d.planName !== undefined && { plan_name: d.planName }),
    ...(d.policyNumber !== undefined && { policy_number: d.policyNumber }),
    ...(d.employerContributionCents !== undefined && { employer_contribution_cents: d.employerContributionCents }),
    ...(d.employeeContributionCents !== undefined && { employee_contribution_cents: d.employeeContributionCents }),
    ...(d.eligibilityRules !== undefined && { eligibility_rules: d.eligibilityRules }),
    ...(d.enrollmentDeadline !== undefined && { enrollment_deadline: d.enrollmentDeadline }),
    ...(d.renewalDate !== undefined && { renewal_date: d.renewalDate }),
    ...(d.contactPhone !== undefined && { contact_phone: d.contactPhone }),
    ...(d.enrollmentUrl !== undefined && { enrollment_url: d.enrollmentUrl }),
    ...(d.enrolledCount !== undefined && { enrolled_count: d.enrolledCount }),
    ...(d.eligibleCount !== undefined && { eligible_count: d.eligibleCount }),
    ...(d.active !== undefined && { active: d.active }),
  };
}

function vendorFrom(r: Record<string, unknown>): VendorRecord {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    vendorName: r.vendor_name as string,
    vendorType: r.vendor_type as VendorRecord["vendorType"],
    contactName: r.contact_name as string | undefined,
    contactEmail: r.contact_email as string | undefined,
    contactPhone: r.contact_phone as string | undefined,
    hasAccessToPHI: r.has_access_to_phi as boolean,
    baaRequired: r.baa_required as boolean,
    baaStatus: r.baa_status as VendorRecord["baaStatus"],
    baaSignedDate: toISO(r.baa_signed_date as string),
    insuranceExpirationDate: toISO(r.insurance_expiration_date as string),
    nextReviewDate: toISO(r.next_review_date as string),
    status: r.status as VendorRecord["status"],
    notes: r.notes as string | undefined,
  };
}
function vendorTo(d: Partial<VendorRecord>) {
  return {
    ...(d.vendorName !== undefined && { vendor_name: d.vendorName }),
    ...(d.vendorType !== undefined && { vendor_type: d.vendorType }),
    ...(d.contactName !== undefined && { contact_name: d.contactName }),
    ...(d.contactEmail !== undefined && { contact_email: d.contactEmail }),
    ...(d.contactPhone !== undefined && { contact_phone: d.contactPhone }),
    ...(d.hasAccessToPHI !== undefined && { has_access_to_phi: d.hasAccessToPHI }),
    ...(d.baaRequired !== undefined && { baa_required: d.baaRequired }),
    ...(d.baaStatus !== undefined && { baa_status: d.baaStatus }),
    ...(d.baaSignedDate !== undefined && { baa_signed_date: d.baaSignedDate }),
    ...(d.insuranceExpirationDate !== undefined && { insurance_expiration_date: d.insuranceExpirationDate }),
    ...(d.nextReviewDate !== undefined && { next_review_date: d.nextReviewDate }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.notes !== undefined && { notes: d.notes }),
  };
}

function competencyFrom(r: Record<string, unknown>): CompetencyRecord {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    employeeId: r.employee_id as string | undefined,
    employeeName: r.employee_name as string,
    competencyName: r.competency_name as string,
    competencyType: r.competency_type as CompetencyRecord["competencyType"],
    evaluatorName: r.evaluator_name as string | undefined,
    assessmentDate: toISO(r.assessment_date as string),
    validUntil: toISO(r.valid_until as string),
    score: r.score as number | undefined,
    status: r.status as CompetencyRecord["status"],
    notes: r.notes as string | undefined,
  };
}
function competencyTo(d: Partial<CompetencyRecord>) {
  return {
    ...(d.employeeId !== undefined && { employee_id: d.employeeId }),
    ...(d.employeeName !== undefined && { employee_name: d.employeeName }),
    ...(d.competencyName !== undefined && { competency_name: d.competencyName }),
    ...(d.competencyType !== undefined && { competency_type: d.competencyType }),
    ...(d.evaluatorName !== undefined && { evaluator_name: d.evaluatorName }),
    ...(d.assessmentDate !== undefined && { assessment_date: d.assessmentDate }),
    ...(d.validUntil !== undefined && { valid_until: d.validUntil }),
    ...(d.score !== undefined && { score: d.score }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.notes !== undefined && { notes: d.notes }),
  };
}

function auditFrom(r: Record<string, unknown>): AuditLog {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    actorName: r.actor_name as string,
    actorEmail: r.actor_email as string | undefined,
    action: r.action as AuditLog["action"],
    entityType: r.entity_type as string | undefined,
    entityId: r.entity_id as string | undefined,
    entityLabel: r.entity_label as string | undefined,
    details: r.details as string | undefined,
    riskLevel: r.risk_level as AuditLog["riskLevel"],
    flagged: r.flagged as boolean,
    flagReason: r.flag_reason as string | undefined,
  };
}
function auditTo(d: Partial<AuditLog>) {
  return {
    ...(d.actorName !== undefined && { actor_name: d.actorName }),
    ...(d.actorEmail !== undefined && { actor_email: d.actorEmail }),
    ...(d.action !== undefined && { action: d.action }),
    ...(d.entityType !== undefined && { entity_type: d.entityType }),
    ...(d.entityId !== undefined && { entity_id: d.entityId }),
    ...(d.entityLabel !== undefined && { entity_label: d.entityLabel }),
    ...(d.details !== undefined && { details: d.details }),
    ...(d.riskLevel !== undefined && { risk_level: d.riskLevel }),
    ...(d.flagged !== undefined && { flagged: d.flagged }),
    ...(d.flagReason !== undefined && { flag_reason: d.flagReason }),
  };
}

function questionFrom(r: Record<string, unknown>): TrainingQuestion {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    trainingModuleId: r.training_module_id as string,
    prompt: r.prompt as string,
    questionType: r.question_type as TrainingQuestion["questionType"],
    options: (r.options as string[] | null) ?? [],
    correctIndex: r.correct_index as number,
    orderIndex: r.order_index as number,
  };
}
function questionTo(d: Partial<TrainingQuestion>) {
  return {
    ...(d.trainingModuleId !== undefined && { training_module_id: d.trainingModuleId }),
    ...(d.prompt !== undefined && { prompt: d.prompt }),
    ...(d.questionType !== undefined && { question_type: d.questionType }),
    ...(d.options !== undefined && { options: d.options }),
    ...(d.correctIndex !== undefined && { correct_index: d.correctIndex }),
    ...(d.orderIndex !== undefined && { order_index: d.orderIndex }),
  };
}

function attemptFrom(r: Record<string, unknown>): TrainingAttempt {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    assignmentId: r.assignment_id as string | undefined,
    trainingModuleId: r.training_module_id as string,
    moduleTitle: r.module_title as string | undefined,
    userId: r.user_id as string, userName: r.user_name as string,
    score: r.score as number, passed: r.passed as boolean,
    answers: (r.answers as number[] | null) ?? [],
    completedAt: toISO(r.completed_at as string),
  };
}
function attemptTo(d: Partial<TrainingAttempt>) {
  return {
    ...(d.assignmentId !== undefined && { assignment_id: d.assignmentId }),
    ...(d.trainingModuleId !== undefined && { training_module_id: d.trainingModuleId }),
    ...(d.moduleTitle !== undefined && { module_title: d.moduleTitle }),
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.userName !== undefined && { user_name: d.userName }),
    ...(d.score !== undefined && { score: d.score }),
    ...(d.passed !== undefined && { passed: d.passed }),
    ...(d.answers !== undefined && { answers: d.answers }),
    ...(d.completedAt !== undefined && { completed_at: d.completedAt }),
  };
}

function formTemplateFrom(r: Record<string, unknown>): FillableFormTemplate {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    title: r.title as string,
    category: r.category as FillableFormTemplate["category"],
    description: r.description as string | undefined,
    fields: (r.fields as FormField[] | null) ?? [],
    status: r.status as FillableFormTemplate["status"],
    requiresSignature: r.requires_signature as boolean,
    sensitive: r.sensitive as boolean,
    isDraft: r.is_draft as boolean,
    fileUrl: r.file_url as string | undefined,
    bodyText: r.body_text as string | null | undefined,
    linkedDocumentId: r.linked_document_id as string | null | undefined,
  };
}
function formTemplateTo(d: Partial<FillableFormTemplate>) {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.category !== undefined && { category: d.category }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.fields !== undefined && { fields: d.fields }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.requiresSignature !== undefined && { requires_signature: d.requiresSignature }),
    ...(d.sensitive !== undefined && { sensitive: d.sensitive }),
    ...(d.isDraft !== undefined && { is_draft: d.isDraft }),
    ...(d.fileUrl !== undefined && { file_url: d.fileUrl }),
    ...(d.bodyText !== undefined && { body_text: d.bodyText }),
    ...(d.linkedDocumentId !== undefined && { linked_document_id: d.linkedDocumentId }),
  };
}

function formAssignmentFrom(r: Record<string, unknown>): FormAssignment {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    templateId: r.template_id as string,
    templateTitle: r.template_title as string,
    assignedToUserId: r.assigned_to_user_id as string | undefined,
    assignedToName: r.assigned_to_name as string,
    status: r.status as FormAssignment["status"],
    dueDate: toISO(r.due_date as string),
    completedFormId: r.completed_form_id as string | undefined,
  };
}
function formAssignmentTo(d: Partial<FormAssignment>) {
  return {
    ...(d.templateId !== undefined && { template_id: d.templateId }),
    ...(d.templateTitle !== undefined && { template_title: d.templateTitle }),
    ...(d.assignedToUserId !== undefined && { assigned_to_user_id: d.assignedToUserId }),
    ...(d.assignedToName !== undefined && { assigned_to_name: d.assignedToName }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.dueDate !== undefined && { due_date: d.dueDate }),
    ...(d.completedFormId !== undefined && { completed_form_id: d.completedFormId }),
  };
}

function completedFormFrom(r: Record<string, unknown>): CompletedForm {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    templateId: r.template_id as string,
    templateTitle: r.template_title as string,
    employeeId: r.employee_id as string | undefined,
    employeeName: r.employee_name as string,
    fieldValues: (r.field_values as Record<string, string> | null) ?? {},
    signedByName: r.signed_by_name as string | undefined,
    completedAt: toISO(r.completed_at as string),
  };
}
function completedFormTo(d: Partial<CompletedForm>) {
  return {
    ...(d.templateId !== undefined && { template_id: d.templateId }),
    ...(d.templateTitle !== undefined && { template_title: d.templateTitle }),
    ...(d.employeeId !== undefined && { employee_id: d.employeeId }),
    ...(d.employeeName !== undefined && { employee_name: d.employeeName }),
    ...(d.fieldValues !== undefined && { field_values: d.fieldValues }),
    ...(d.signedByName !== undefined && { signed_by_name: d.signedByName }),
    ...(d.completedAt !== undefined && { completed_at: d.completedAt }),
  };
}

function employeeDocFrom(r: Record<string, unknown>): EmployeeDocument {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    employeeId: r.employee_id as string | undefined,
    employeeName: r.employee_name as string,
    documentType: r.document_type as EmployeeDocument["documentType"],
    title: r.title as string,
    fileUrl: r.file_url as string | undefined,
    sensitive: r.sensitive as boolean,
    uploadedByName: r.uploaded_by_name as string | undefined,
    notes: r.notes as string | undefined,
  };
}
function employeeDocTo(d: Partial<EmployeeDocument>) {
  return {
    ...(d.employeeId !== undefined && { employee_id: d.employeeId }),
    ...(d.employeeName !== undefined && { employee_name: d.employeeName }),
    ...(d.documentType !== undefined && { document_type: d.documentType }),
    ...(d.title !== undefined && { title: d.title }),
    ...(d.fileUrl !== undefined && { file_url: d.fileUrl }),
    ...(d.sensitive !== undefined && { sensitive: d.sensitive }),
    ...(d.uploadedByName !== undefined && { uploaded_by_name: d.uploadedByName }),
    ...(d.notes !== undefined && { notes: d.notes }),
  };
}

function csLogFrom(r: Record<string, unknown>): ControlledSubstanceLog {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    substanceName: r.substance_name as string,
    scheduleClass: r.schedule_class as ControlledSubstanceLog["scheduleClass"],
    transactionType: r.transaction_type as ControlledSubstanceLog["transactionType"],
    quantity: r.quantity as number,
    balanceAfter: r.balance_after as number,
    patientRef: r.patient_ref as string | undefined,
    prescriberName: r.prescriber_name as string | undefined,
    witnessName: r.witness_name as string | undefined,
    transactionDate: toISO(r.transaction_date as string),
    notes: r.notes as string | undefined,
  };
}
function csLogTo(d: Partial<ControlledSubstanceLog>) {
  return {
    ...(d.substanceName !== undefined && { substance_name: d.substanceName }),
    ...(d.scheduleClass !== undefined && { schedule_class: d.scheduleClass }),
    ...(d.transactionType !== undefined && { transaction_type: d.transactionType }),
    ...(d.quantity !== undefined && { quantity: d.quantity }),
    ...(d.balanceAfter !== undefined && { balance_after: d.balanceAfter }),
    ...(d.patientRef !== undefined && { patient_ref: d.patientRef }),
    ...(d.prescriberName !== undefined && { prescriber_name: d.prescriberName }),
    ...(d.witnessName !== undefined && { witness_name: d.witnessName }),
    ...(d.transactionDate !== undefined && { transaction_date: d.transactionDate }),
    ...(d.notes !== undefined && { notes: d.notes }),
  };
}

function notificationFrom(r: Record<string, unknown>): Notification {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    title: r.title as string,
    body: r.body as string | undefined,
    category: r.category as Notification["category"],
    severity: r.severity as Notification["severity"],
    entityType: r.entity_type as string | undefined,
    entityId: r.entity_id as string | undefined,
    link: r.link as string | undefined,
    read: r.read as boolean,
  };
}
function notificationTo(d: Partial<Notification>) {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.body !== undefined && { body: d.body }),
    ...(d.category !== undefined && { category: d.category }),
    ...(d.severity !== undefined && { severity: d.severity }),
    ...(d.entityType !== undefined && { entity_type: d.entityType }),
    ...(d.entityId !== undefined && { entity_id: d.entityId }),
    ...(d.link !== undefined && { link: d.link }),
    ...(d.read !== undefined && { read: d.read }),
  };
}

function orgSettingsFrom(r: Record<string, unknown>): OrganizationSettings {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    orgName: r.org_name as string,
    address: r.address as string | undefined,
    phone: r.phone as string | undefined,
    website: r.website as string | undefined,
    npiNumber: r.npi_number as string | undefined,
    taxId: r.tax_id as string | undefined,
    documentRetentionYears: r.document_retention_years as number,
    sessionTimeoutMinutes: r.session_timeout_minutes as number,
    requireTwoFactor: r.require_two_factor as boolean,
    passwordMinLength: r.password_min_length as number,
    credentialReminderDays: r.credential_reminder_days as number,
    trainingReminderDays: r.training_reminder_days as number,
    insuranceReminderDays: r.insurance_reminder_days as number,
    emailNotifications: r.email_notifications as boolean,
    pageRoles: (r.page_roles as Record<string, string[]> | null) ?? {},
    disabledPages: (r.disabled_pages as string[] | null) ?? [],
    defaultAccountRole: (r.default_account_role as string | null) ?? "staff",
  };
}

function navPreferenceFrom(r: Record<string, unknown>): NavPreference {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    userId: r.user_id as string,
    hiddenPages: (r.hidden_pages as string[] | null) ?? [],
    pageOrder: (r.page_order as string[] | null) ?? [],
    groupOrder: (r.group_order as string[] | null) ?? [],
    collapsedGroups: (r.collapsed_groups as string[] | null) ?? [],
  };
}
function navPreferenceTo(d: Partial<NavPreference>) {
  return {
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.hiddenPages !== undefined && { hidden_pages: d.hiddenPages }),
    ...(d.pageOrder !== undefined && { page_order: d.pageOrder }),
    ...(d.groupOrder !== undefined && { group_order: d.groupOrder }),
    ...(d.collapsedGroups !== undefined && { collapsed_groups: d.collapsedGroups }),
  };
}
function orgSettingsTo(d: Partial<OrganizationSettings>) {
  return {
    ...(d.orgName !== undefined && { org_name: d.orgName }),
    ...(d.address !== undefined && { address: d.address }),
    ...(d.phone !== undefined && { phone: d.phone }),
    ...(d.website !== undefined && { website: d.website }),
    ...(d.npiNumber !== undefined && { npi_number: d.npiNumber }),
    ...(d.taxId !== undefined && { tax_id: d.taxId }),
    ...(d.documentRetentionYears !== undefined && { document_retention_years: d.documentRetentionYears }),
    ...(d.sessionTimeoutMinutes !== undefined && { session_timeout_minutes: d.sessionTimeoutMinutes }),
    ...(d.requireTwoFactor !== undefined && { require_two_factor: d.requireTwoFactor }),
    ...(d.passwordMinLength !== undefined && { password_min_length: d.passwordMinLength }),
    ...(d.credentialReminderDays !== undefined && { credential_reminder_days: d.credentialReminderDays }),
    ...(d.trainingReminderDays !== undefined && { training_reminder_days: d.trainingReminderDays }),
    ...(d.insuranceReminderDays !== undefined && { insurance_reminder_days: d.insuranceReminderDays }),
    ...(d.emailNotifications !== undefined && { email_notifications: d.emailNotifications }),
    ...(d.pageRoles !== undefined && { page_roles: d.pageRoles }),
    ...(d.disabledPages !== undefined && { disabled_pages: d.disabledPages }),
    ...(d.defaultAccountRole !== undefined && { default_account_role: d.defaultAccountRole }),
  };
}

function chatMessageFrom(r: Record<string, unknown>): ChatMessage {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    userId: r.user_id as string,
    assistant: r.assistant as ChatMessage["assistant"],
    role: r.role as ChatMessage["role"],
    content: r.content as string,
    conversationId: (r.conversation_id as string | null) ?? undefined,
  };
}
function chatMessageTo(d: Partial<ChatMessage>) {
  return {
    ...(d.userId !== undefined && { user_id: d.userId }),
    ...(d.assistant !== undefined && { assistant: d.assistant }),
    ...(d.role !== undefined && { role: d.role }),
    ...(d.content !== undefined && { content: d.content }),
    ...(d.conversationId !== undefined && { conversation_id: d.conversationId }),
  };
}

// ─── factory ──────────────────────────────────────────────────────────────────

export function createSupabaseDataClient(): DataClient {
  const supabase = createClient();
  return {
    profiles:           makeCollection(supabase, "profiles",            profileFrom,            profileTo),
    locations:          makeCollection(supabase, "locations",           locationFrom,           locationTo),
    tasks:              makeCollection(supabase, "tasks",               taskFrom,               taskTo),
    credentials:        makeCollection(supabase, "credentials",         credentialFrom,         credentialTo),
    documents:          makeCollection(supabase, "documents",           documentFrom,           documentTo),
    trainingModules:    makeCollection(supabase, "training_modules",    trainingModuleFrom,     trainingModuleTo),
    trainingAssignments:makeCollection(supabase, "training_assignments",trainingAssignmentFrom, trainingAssignmentTo),
    oshaRecords:        makeCollection(supabase, "osha_records",        oshaFrom,               oshaTo),
    sdsRecords:         makeCollection(supabase, "sds_records",         sdsFrom,                sdsTo),
    riskCases:          makeCollection(supabase, "risk_cases",          riskFrom,               riskTo),
    incidents:          makeCollection(supabase, "incidents",           incidentFrom,           incidentTo),
    correctiveActions:  makeCollection(supabase, "corrective_actions",  correctiveActionFrom,   correctiveActionTo),
    breachAssessments:  makeCollection(supabase, "breach_assessments",  breachFrom,             breachTo),
    sraAssessments:     makeCollection(supabase, "sra_assessments",     sraAssessmentFrom,      sraAssessmentTo),
    sraFindings:        makeCollection(supabase, "sra_findings",        sraFindingFrom,         sraFindingTo),
    exclusionScreenings: makeCollection(supabase, "exclusion_screenings", exclusionFrom,        exclusionTo),
    ccoPreferences:     makeCollection(supabase, "cco_preferences",     ccoPreferenceFrom,      ccoPreferenceTo),
    agendaSnoozes:      makeCollection(supabase, "agenda_snoozes",      agendaSnoozeFrom,       agendaSnoozeTo),
    navPreferences:     makeCollection(supabase, "nav_preferences",     navPreferenceFrom,      navPreferenceTo),
    roleRequirements:   makeCollection(supabase, "role_requirements",   roleRequirementFrom,    roleRequirementTo),
    activityLog:        makeCollection(supabase, "activity_log",        activityLogFrom,        activityLogTo),
    backups:            makeCollection(supabase, "backups",             backupFrom,             backupTo),
    audits:             makeCollection(supabase, "audits",              auditRecFrom,           auditRecTo),
    auditItems:         makeCollection(supabase, "audit_items",         auditItemFrom,          auditItemTo),
    policyAcks:         makeCollection(supabase, "policy_acks",         ackFrom,                ackTo),
    regulatorySources:  makeCollection(supabase, "regulatory_sources",  regFrom,                regTo),
    recordVersions:     makeCollection(supabase, "record_versions",      recordVersionFrom,      recordVersionTo),
    insurancePolicies:  makeCollection(supabase, "insurance_policies",  insuranceFrom,          insuranceTo),
    emergencyDrills:    makeCollection(supabase, "emergency_drills",    drillFrom,              drillTo),
    employees:          makeCollection(supabase, "employees",           employeeFrom,           employeeTo),
    inventory:          makeCollection(supabase, "inventory",           inventoryFrom,          inventoryTo),
    timeClockEntries:   makeCollection(supabase, "time_clock_entries",  timeClockFrom,          timeClockTo),
    timeOffRequests:    makeCollection(supabase, "time_off_requests",   timeOffFrom,            timeOffTo),
    ptoBalances:        makeCollection(supabase, "pto_balances",        ptoBalanceFrom,         ptoBalanceTo),
    payrollRecords:     makeCollection(supabase, "payroll_records",     payrollFrom,            payrollTo),
    performanceReviews: makeCollection(supabase, "performance_reviews", reviewFrom,             reviewTo),
    disciplinaryActions:makeCollection(supabase, "disciplinary_actions",disciplinaryFrom,       disciplinaryTo),
    benefits:           makeCollection(supabase, "benefits",            benefitFrom,            benefitTo),
    vendors:            makeCollection(supabase, "vendors",             vendorFrom,             vendorTo),
    competencyRecords:  makeCollection(supabase, "competency_records",  competencyFrom,         competencyTo),
    auditLogs:          makeCollection(supabase, "audit_logs",          auditFrom,              auditTo),
    trainingQuestions:  makeCollection(supabase, "training_questions",  questionFrom,           questionTo),
    trainingAttempts:   makeCollection(supabase, "training_attempts",   attemptFrom,            attemptTo),
    formTemplates:      makeCollection(supabase, "form_templates",      formTemplateFrom,       formTemplateTo),
    formAssignments:    makeCollection(supabase, "form_assignments",    formAssignmentFrom,     formAssignmentTo),
    completedForms:     makeCollection(supabase, "completed_forms",     completedFormFrom,      completedFormTo),
    employeeDocuments:  makeCollection(supabase, "employee_documents",  employeeDocFrom,        employeeDocTo),
    controlledSubstanceLogs: makeCollection(supabase, "controlled_substance_logs", csLogFrom,  csLogTo),
    notifications:      makeCollection(supabase, "notifications",       notificationFrom,       notificationTo),
    organizationSettings: makeCollection(supabase, "organization_settings", orgSettingsFrom,     orgSettingsTo),
    chatMessages:       makeCollection(supabase, "chat_messages",       chatMessageFrom,        chatMessageTo),
  };
}
