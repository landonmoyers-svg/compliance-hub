import type {
  AuditLog,
  Benefit,
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
  InsurancePolicyRecord,
  InventoryItem,
  Notification,
  OSHARecord,
  PayrollRecord,
  PerformanceReview,
  PolicyAcknowledgment,
  PTOBalance,
  RegulatorySource,
  RiskManagementCase,
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
  policyAcks: Collection<PolicyAcknowledgment>;
  regulatorySources: Collection<RegulatorySource>;
  insurancePolicies: Collection<InsurancePolicyRecord>;
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
  competencyRecords: Collection<CompetencyRecord>;
  auditLogs: Collection<AuditLog>;
  trainingQuestions: Collection<TrainingQuestion>;
  trainingAttempts: Collection<TrainingAttempt>;
  formTemplates: Collection<FillableFormTemplate>;
  formAssignments: Collection<FormAssignment>;
  completedForms: Collection<CompletedForm>;
  employeeDocuments: Collection<EmployeeDocument>;
  controlledSubstanceLogs: Collection<ControlledSubstanceLog>;
  notifications: Collection<Notification>;
}

/** Keys of the collection-typed properties on DataClient. */
export type CollectionName = {
  [K in keyof DataClient]: DataClient[K] extends Collection<infer _T> ? K : never;
}[keyof DataClient];
