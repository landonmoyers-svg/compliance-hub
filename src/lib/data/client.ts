import type {
  AuditLog,
  Benefit,
  ChatMessage,
  SopRegulationLink,
  CompetencyRecord,
  CompletedForm,
  ComplianceDocument,
  ComplianceTask,
  ComplianceUserProfile,
  ControlledSubstanceLog,
  ControlledSubstanceItem,
  ControlledSubstanceEvent,
  DeaRecord,
  CredentialRecord,
  DisciplinaryAction,
  EmergencyDrill,
  Employee,
  EmployeeDocument,
  FillableFormTemplate,
  FormAssignment,
  InsurancePolicyRecord,
  BusinessRecord,
  LifecycleTask,
  CeRecord,
  EmergencyPlan,
  InventoryItem,
  Notification,
  OrganizationSettings,
  OSHARecord,
  PayrollRecord,
  PerformanceReview,
  PolicyAcknowledgment,
  BreachAssessment,
  ActivityLog,
  AgendaSnooze,
  Audit,
  AuditItem,
  BackupRecord,
  CcoPreference,
  CorrectiveAction,
  ExclusionScreening,
  Incident,
  NavPreference,
  PTOBalance,
  RecordVersion,
  RegulatorySource,
  RiskManagementCase,
  RoleRequirement,
  SraAssessment,
  SraFinding,
  SDSRecord,
  TimeClockEntry,
  TimeOffRequest,
  TrainingAssignment,
  TrainingAttempt,
  TrainingModule,
  TrainingQuestion,
  VendorRecord,
  PayerContract,
  PayerEnrollment,
  WorkLocation,
} from "./schema";

/**
 * The data-access seam. Every page reads/writes through this interface — never a
 * concrete backend. Today it's backed by an in-memory mock; swap in a real
 * (BAA-covered, HIPAA-eligible) backend later without touching any UI.
 */

export interface Collection<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(input: Omit<T, "id" | "createdDate">): Promise<T>;
  update(id: string, patch: Partial<Omit<T, "id" | "createdDate">>): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface DataClient {
  profiles: Collection<ComplianceUserProfile>;
  locations: Collection<WorkLocation>;
  tasks: Collection<ComplianceTask>;
  credentials: Collection<CredentialRecord>;
  documents: Collection<ComplianceDocument>;
  trainingModules: Collection<TrainingModule>;
  trainingAssignments: Collection<TrainingAssignment>;
  oshaRecords: Collection<OSHARecord>;
  sdsRecords: Collection<SDSRecord>;
  riskCases: Collection<RiskManagementCase>;
  incidents: Collection<Incident>;
  correctiveActions: Collection<CorrectiveAction>;
  breachAssessments: Collection<BreachAssessment>;
  sraAssessments: Collection<SraAssessment>;
  sraFindings: Collection<SraFinding>;
  exclusionScreenings: Collection<ExclusionScreening>;
  ccoPreferences: Collection<CcoPreference>;
  agendaSnoozes: Collection<AgendaSnooze>;
  navPreferences: Collection<NavPreference>;
  roleRequirements: Collection<RoleRequirement>;
  audits: Collection<Audit>;
  auditItems: Collection<AuditItem>;
  activityLog: Collection<ActivityLog>;
  backups: Collection<BackupRecord>;
  policyAcks: Collection<PolicyAcknowledgment>;
  regulatorySources: Collection<RegulatorySource>;
  recordVersions: Collection<RecordVersion>;
  insurancePolicies: Collection<InsurancePolicyRecord>;
  businessRecords: Collection<BusinessRecord>;
  lifecycleTasks: Collection<LifecycleTask>;
  ceRecords: Collection<CeRecord>;
  emergencyPlans: Collection<EmergencyPlan>;
  emergencyDrills: Collection<EmergencyDrill>;
  employees: Collection<Employee>;
  inventory: Collection<InventoryItem>;
  timeClockEntries: Collection<TimeClockEntry>;
  timeOffRequests: Collection<TimeOffRequest>;
  ptoBalances: Collection<PTOBalance>;
  payrollRecords: Collection<PayrollRecord>;
  performanceReviews: Collection<PerformanceReview>;
  disciplinaryActions: Collection<DisciplinaryAction>;
  benefits: Collection<Benefit>;
  vendors: Collection<VendorRecord>;
  payerContracts: Collection<PayerContract>;
  payerEnrollments: Collection<PayerEnrollment>;
  competencyRecords: Collection<CompetencyRecord>;
  auditLogs: Collection<AuditLog>;
  trainingQuestions: Collection<TrainingQuestion>;
  trainingAttempts: Collection<TrainingAttempt>;
  formTemplates: Collection<FillableFormTemplate>;
  formAssignments: Collection<FormAssignment>;
  completedForms: Collection<CompletedForm>;
  employeeDocuments: Collection<EmployeeDocument>;
  controlledSubstanceLogs: Collection<ControlledSubstanceLog>;
  controlledSubstanceItems: Collection<ControlledSubstanceItem>;
  controlledSubstanceEvents: Collection<ControlledSubstanceEvent>;
  deaRecords: Collection<DeaRecord>;
  notifications: Collection<Notification>;
  organizationSettings: Collection<OrganizationSettings>;
  chatMessages: Collection<ChatMessage>;
  sopRegulationLinks: Collection<SopRegulationLink>;
}

/** Keys of the collection-typed properties on DataClient. */
export type CollectionName = {
  [K in keyof DataClient]: DataClient[K] extends Collection<infer _T> ? K : never;
}[keyof DataClient];
