import type { Collection, DataClient } from "./client";
import { buildSeed } from "./seed";

/** Simulated network latency so loading states are visible during development. */
const LATENCY_MS = 180;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

/** Deep clone so callers can never mutate the in-memory store directly. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

class MemoryCollection<T extends { id: string; createdDate: string }>
  implements Collection<T>
{
  private items: T[];

  constructor(seed: T[]) {
    this.items = seed.map(clone);
  }

  list(): Promise<T[]> {
    // Newest first, mirroring the source app's default ordering.
    const sorted = [...this.items].sort((a, b) =>
      b.createdDate.localeCompare(a.createdDate),
    );
    return delay(sorted.map(clone));
  }

  get(id: string): Promise<T | null> {
    const found = this.items.find((i) => i.id === id) ?? null;
    return delay(found ? clone(found) : null);
  }

  create(input: Omit<T, "id" | "createdDate">): Promise<T> {
    const record = {
      ...(input as T),
      id: crypto.randomUUID(),
      createdDate: new Date().toISOString(),
    } as T;
    this.items.push(record);
    return delay(clone(record));
  }

  update(
    id: string,
    patch: Partial<Omit<T, "id" | "createdDate">>,
  ): Promise<T> {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) {
      return Promise.reject(new Error(`Record ${id} not found`));
    }
    this.items[idx] = { ...this.items[idx], ...patch } as T;
    return delay(clone(this.items[idx]));
  }

  remove(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
    return delay(undefined);
  }
}

/** Construct an in-memory DataClient backed by the seed dataset. */
export function createMockDataClient(): DataClient {
  const seed = buildSeed();
  return {
    profiles: new MemoryCollection(seed.profiles),
    locations: new MemoryCollection(seed.locations),
    tasks: new MemoryCollection(seed.tasks),
    credentials: new MemoryCollection(seed.credentials),
    documents: new MemoryCollection(seed.documents),
    trainingModules: new MemoryCollection(seed.trainingModules),
    trainingAssignments: new MemoryCollection(seed.trainingAssignments),
    oshaRecords: new MemoryCollection(seed.oshaRecords),
    sdsRecords: new MemoryCollection(seed.sdsRecords),
    riskCases: new MemoryCollection(seed.riskCases),
    incidents: new MemoryCollection(seed.incidents),
    correctiveActions: new MemoryCollection(seed.correctiveActions),
    breachAssessments: new MemoryCollection(seed.breachAssessments),
    sraAssessments: new MemoryCollection(seed.sraAssessments),
    sraFindings: new MemoryCollection(seed.sraFindings),
    exclusionScreenings: new MemoryCollection(seed.exclusionScreenings),
    ccoPreferences: new MemoryCollection(seed.ccoPreferences),
    agendaSnoozes: new MemoryCollection(seed.agendaSnoozes),
    roleRequirements: new MemoryCollection(seed.roleRequirements),
    audits: new MemoryCollection(seed.audits),
    auditItems: new MemoryCollection(seed.auditItems),
    activityLog: new MemoryCollection(seed.activityLog),
    backups: new MemoryCollection(seed.backups),
    policyAcks: new MemoryCollection(seed.policyAcks),
    regulatorySources: new MemoryCollection(seed.regulatorySources),
    recordVersions: new MemoryCollection(seed.recordVersions),
    insurancePolicies: new MemoryCollection(seed.insurancePolicies),
    emergencyDrills: new MemoryCollection(seed.emergencyDrills),
    employees: new MemoryCollection(seed.employees),
    inventory: new MemoryCollection(seed.inventory),
    timeClockEntries: new MemoryCollection(seed.timeClockEntries),
    timeOffRequests: new MemoryCollection(seed.timeOffRequests),
    ptoBalances: new MemoryCollection(seed.ptoBalances),
    payrollRecords: new MemoryCollection(seed.payrollRecords),
    performanceReviews: new MemoryCollection(seed.performanceReviews),
    disciplinaryActions: new MemoryCollection(seed.disciplinaryActions),
    benefits: new MemoryCollection(seed.benefits),
    vendors: new MemoryCollection(seed.vendors),
    competencyRecords: new MemoryCollection(seed.competencyRecords),
    auditLogs: new MemoryCollection(seed.auditLogs),
    trainingQuestions: new MemoryCollection(seed.trainingQuestions),
    trainingAttempts: new MemoryCollection(seed.trainingAttempts),
    formTemplates: new MemoryCollection(seed.formTemplates),
    formAssignments: new MemoryCollection(seed.formAssignments),
    completedForms: new MemoryCollection(seed.completedForms),
    employeeDocuments: new MemoryCollection(seed.employeeDocuments),
    controlledSubstanceLogs: new MemoryCollection(seed.controlledSubstanceLogs),
    notifications: new MemoryCollection(seed.notifications),
    organizationSettings: new MemoryCollection(seed.organizationSettings),
    chatMessages: new MemoryCollection(seed.chatMessages),
  };
}
