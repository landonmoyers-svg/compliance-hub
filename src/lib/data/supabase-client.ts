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
  ComplianceDocument,
  ComplianceTask,
  ComplianceUserProfile,
  CredentialRecord,
  EmergencyDrill,
  Employee,
  InsurancePolicyRecord,
  InventoryItem,
  OSHARecord,
  PolicyAcknowledgment,
  RegulatorySource,
  RiskManagementCase,
  SDSRecord,
  TrainingAssignment,
  TrainingModule,
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

function insuranceFrom(r: Record<string, unknown>): InsurancePolicyRecord {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    policyName: r.policy_name as string, policyType: r.policy_type as string,
    carrierName: r.carrier_name as string | undefined,
    policyNumber: r.policy_number as string | undefined,
    coverageAmountCents: r.coverage_amount_cents as number | undefined,
    annualPremiumCents: r.annual_premium_cents as number | undefined,
    renewalDate: r.renewal_date as string | undefined,
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
    hireDate: r.hire_date as string | undefined,
    locationId: r.location_id as string | undefined,
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
    ...(d.hireDate !== undefined && { hire_date: d.hireDate }),
    ...(d.locationId !== undefined && { location_id: d.locationId }),
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
    policyAcks:         makeCollection(supabase, "policy_acks",         ackFrom,                ackTo),
    regulatorySources:  makeCollection(supabase, "regulatory_sources",  regFrom,                regTo),
    insurancePolicies:  makeCollection(supabase, "insurance_policies",  insuranceFrom,          insuranceTo),
    emergencyDrills:    makeCollection(supabase, "emergency_drills",    drillFrom,              drillTo),
    employees:          makeCollection(supabase, "employees",           employeeFrom,           employeeTo),
    inventory:          makeCollection(supabase, "inventory",           inventoryFrom,          inventoryTo),
  };
}
