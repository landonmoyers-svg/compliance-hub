import type { DataClient } from "./client";

/** Build an ISO timestamp offset from "now" by a number of days. */
function days(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString();
}

type SeedData = {
  [K in keyof DataClient]: DataClient[K] extends {
    list(): Promise<infer T>;
  }
    ? T extends (infer U)[]
      ? U[]
      : never
    : never;
};

/**
 * Deterministic mock dataset for Lone Peak Psychiatry. Designed so the
 * dashboards show a realistic mix: a few overdue/expired items, several
 * expiring-soon, and healthy baselines — enough to exercise every widget.
 */
export function buildSeed(): SeedData {
  return {
    profiles: [
      {
        id: "profile-1",
        createdDate: days(-400),
        userId: "user-1",
        fullName: "Dr. Avery Stone",
        email: "avery.stone@lonepeak.example",
        accountRole: "owner",
        staffRole: "Medical Director",
        professionalRole: "MD",
        department: "ownership",
        primaryLocationId: "loc-1",
        active: true,
      },
    ],
    locations: [
      { id: "loc-1", createdDate: days(-500), name: "Lehi Clinic", type: "clinic", city: "Lehi", state: "UT", active: true },
      { id: "loc-2", createdDate: days(-500), name: "Provo Clinic", type: "clinic", city: "Provo", state: "UT", active: true },
      { id: "loc-3", createdDate: days(-300), name: "Draper Office", type: "office", city: "Draper", state: "UT", active: true },
    ],
    employees: [
      { id: "emp-1", createdDate: days(-380), firstName: "Avery", lastName: "Stone", email: "avery.stone@lonepeak.example", title: "Medical Director", department: "ownership", employmentStatus: "active", hireDate: days(-380), locationId: "loc-1" },
      { id: "emp-2", createdDate: days(-300), firstName: "Jordan", lastName: "Reyes", email: "jordan.reyes@lonepeak.example", title: "Nurse Practitioner", department: "clinical", employmentStatus: "active", hireDate: days(-300), locationId: "loc-1" },
      { id: "emp-3", createdDate: days(-250), firstName: "Sam", lastName: "Patel", email: "sam.patel@lonepeak.example", title: "Therapist", department: "clinical", employmentStatus: "active", hireDate: days(-250), locationId: "loc-2" },
      { id: "emp-4", createdDate: days(-220), firstName: "Riley", lastName: "Chen", email: "riley.chen@lonepeak.example", title: "Office Manager", department: "administration", employmentStatus: "active", hireDate: days(-220), locationId: "loc-1" },
      { id: "emp-5", createdDate: days(-120), firstName: "Morgan", lastName: "Diaz", email: "morgan.diaz@lonepeak.example", title: "Front Desk", department: "front_desk", employmentStatus: "active", hireDate: days(-120), locationId: "loc-2" },
      { id: "emp-6", createdDate: days(-90), firstName: "Casey", lastName: "Nguyen", email: "casey.nguyen@lonepeak.example", title: "Billing Specialist", department: "billing", employmentStatus: "on_leave", hireDate: days(-90), locationId: "loc-3" },
    ],
    tasks: [
      { id: "task-1", createdDate: days(-20), title: "Post OSHA 300A summary", category: "osha", status: "open", priority: "high", dueDate: days(-3), assignedToName: "Riley Chen", locationId: "loc-1" },
      { id: "task-2", createdDate: days(-15), title: "Review BBP exposure control plan", category: "safety", status: "open", priority: "critical", dueDate: days(-1), assignedToName: "Avery Stone", locationId: "loc-1" },
      { id: "task-3", createdDate: days(-10), title: "Quarterly HIPAA risk review", category: "hipaa", status: "in_progress", priority: "high", dueDate: days(5), assignedToName: "Avery Stone", locationId: "loc-1" },
      { id: "task-4", createdDate: days(-8), title: "Update emergency contact roster", category: "admin", status: "open", priority: "medium", dueDate: days(9), assignedToName: "Riley Chen", locationId: "loc-2" },
      { id: "task-5", createdDate: days(-30), title: "Renew controlled substance log audit", category: "controlled", status: "open", priority: "high", dueDate: days(12), assignedToName: "Jordan Reyes", locationId: "loc-1" },
      { id: "task-6", createdDate: days(-40), title: "Annual fire drill", category: "emergency", status: "completed", priority: "medium", dueDate: days(-25), completedAt: days(-26), assignedToName: "Riley Chen", locationId: "loc-1" },
      { id: "task-7", createdDate: days(-5), title: "Vendor BAA collection", category: "vendor", status: "open", priority: "medium", dueDate: days(20), assignedToName: "Casey Nguyen", locationId: "loc-3" },
      { id: "task-8", createdDate: days(-3), title: "Onboard new front-desk hire", category: "hr", status: "in_progress", priority: "low", dueDate: days(7), assignedToName: "Riley Chen", locationId: "loc-2" },
    ],
    credentials: [
      { id: "cred-1", createdDate: days(-200), employeeName: "Jordan Reyes", credentialName: "RN License", credentialType: "license", issuingBody: "Utah DOPL", issueDate: days(-700), expirationDate: days(-10) },
      { id: "cred-2", createdDate: days(-200), employeeName: "Jordan Reyes", credentialName: "DEA Registration", credentialType: "dea", issuingBody: "DEA", issueDate: days(-600), expirationDate: days(18) },
      { id: "cred-3", createdDate: days(-200), employeeName: "Sam Patel", credentialName: "LCSW License", credentialType: "license", issuingBody: "Utah DOPL", issueDate: days(-500), expirationDate: days(25) },
      { id: "cred-4", createdDate: days(-200), employeeName: "Avery Stone", credentialName: "MD License", credentialType: "license", issuingBody: "Utah DOPL", issueDate: days(-900), expirationDate: days(120) },
      { id: "cred-5", createdDate: days(-200), employeeName: "Sam Patel", credentialName: "CPR/BLS", credentialType: "cpr_bls_acls", issuingBody: "AHA", issueDate: days(-300), expirationDate: days(60) },
      { id: "cred-6", createdDate: days(-200), employeeName: "Morgan Diaz", credentialName: "Hepatitis B Immunization", credentialType: "immunization", issueDate: days(-120), expirationDate: null },
      { id: "cred-7", createdDate: days(-200), employeeName: "Avery Stone", credentialName: "DEA Registration", credentialType: "dea", issuingBody: "DEA", issueDate: days(-400), expirationDate: days(8) },
    ],
    documents: [
      { id: "doc-1", createdDate: days(-300), title: "HIPAA Privacy Policy", documentType: "policy", complianceArea: "hipaa", status: "active", accessLevel: "all_staff", version: "3.1", reviewDate: days(-5), requiresAcknowledgment: true },
      { id: "doc-2", createdDate: days(-280), title: "Bloodborne Pathogens Exposure Control Plan", documentType: "policy", complianceArea: "osha", status: "under_review", accessLevel: "clinical", version: "2.0", reviewDate: days(10), requiresAcknowledgment: true },
      { id: "doc-3", createdDate: days(-260), title: "Controlled Substance Handling SOP", documentType: "sop", complianceArea: "controlled", status: "active", accessLevel: "clinical", version: "1.4", reviewDate: days(40), requiresAcknowledgment: false },
      { id: "doc-4", createdDate: days(-200), title: "Emergency Action Plan", documentType: "policy", complianceArea: "emergency", status: "active", accessLevel: "all_staff", version: "1.2", reviewDate: days(15), requiresAcknowledgment: true },
      { id: "doc-5", createdDate: days(-150), title: "Telehealth Consent SOP", documentType: "sop", complianceArea: "clinical", status: "draft", accessLevel: "clinical", version: "0.9", reviewDate: null, requiresAcknowledgment: false },
      { id: "doc-6", createdDate: days(-100), title: "Workplace Violence Prevention Policy", documentType: "policy", complianceArea: "safety", status: "active", accessLevel: "all_staff", version: "1.0", reviewDate: days(-2), requiresAcknowledgment: true },
    ],
    trainingModules: [
      { id: "tm-1", createdDate: days(-365), title: "HIPAA Privacy & Security", trainingType: "compliance", frequencyMonths: 12, passingScore: 80, active: true },
      { id: "tm-2", createdDate: days(-365), title: "OSHA Bloodborne Pathogens", trainingType: "safety", frequencyMonths: 12, passingScore: 80, active: true },
      { id: "tm-3", createdDate: days(-200), title: "Workplace Violence Prevention", trainingType: "safety", frequencyMonths: 12, passingScore: 80, active: true },
      { id: "tm-4", createdDate: days(-120), title: "Controlled Substance Diversion Prevention", trainingType: "compliance", frequencyMonths: 12, passingScore: 85, active: true },
    ],
    trainingAssignments: [
      { id: "ta-1", createdDate: days(-60), trainingModuleId: "tm-1", moduleTitle: "HIPAA Privacy & Security", assignedToUserId: "user-2", assignedToName: "Jordan Reyes", status: "completed", dueDate: days(-30), completedAt: days(-35), score: 92 },
      { id: "ta-2", createdDate: days(-60), trainingModuleId: "tm-2", moduleTitle: "OSHA Bloodborne Pathogens", assignedToUserId: "user-2", assignedToName: "Jordan Reyes", status: "assigned", dueDate: days(-4) },
      { id: "ta-3", createdDate: days(-50), trainingModuleId: "tm-1", moduleTitle: "HIPAA Privacy & Security", assignedToUserId: "user-3", assignedToName: "Sam Patel", status: "in_progress", dueDate: days(6) },
      { id: "ta-4", createdDate: days(-50), trainingModuleId: "tm-3", moduleTitle: "Workplace Violence Prevention", assignedToUserId: "user-3", assignedToName: "Sam Patel", status: "assigned", dueDate: days(14) },
      { id: "ta-5", createdDate: days(-40), trainingModuleId: "tm-4", moduleTitle: "Controlled Substance Diversion Prevention", assignedToUserId: "user-2", assignedToName: "Jordan Reyes", status: "assigned", dueDate: days(-1) },
      { id: "ta-6", createdDate: days(-30), trainingModuleId: "tm-1", moduleTitle: "HIPAA Privacy & Security", assignedToUserId: "user-5", assignedToName: "Morgan Diaz", status: "completed", dueDate: days(-10), completedAt: days(-12), score: 88 },
      { id: "ta-7", createdDate: days(-20), trainingModuleId: "tm-3", moduleTitle: "Workplace Violence Prevention", assignedToUserId: "user-4", assignedToName: "Riley Chen", status: "assigned", dueDate: days(21) },
      { id: "ta-8", createdDate: days(-20), trainingModuleId: "tm-2", moduleTitle: "OSHA Bloodborne Pathogens", assignedToUserId: "user-3", assignedToName: "Sam Patel", status: "completed", dueDate: days(-5), completedAt: days(-6), score: 95 },
    ],
    oshaRecords: [
      { id: "osha-1", createdDate: days(-120), recordTitle: "Needlestick — exam room 2", recordType: "injury", eventDate: days(-118), status: "closed", recordabilityStatus: "recordable" },
      { id: "osha-2", createdDate: days(-60), recordTitle: "Annual HazCom training", recordType: "training", eventDate: days(-58), status: "closed", recordabilityStatus: "non_recordable" },
      { id: "osha-3", createdDate: days(-20), recordTitle: "Slip in break room", recordType: "injury", eventDate: days(-19), status: "in_progress", recordabilityStatus: "not_reviewed" },
      { id: "osha-4", createdDate: days(-10), recordTitle: "Quarterly safety inspection", recordType: "inspection", eventDate: days(-9), status: "open", recordabilityStatus: "non_recordable" },
    ],
    sdsRecords: [
      { id: "sds-1", createdDate: days(-200), productName: "Isopropyl Alcohol 70%", manufacturer: "MedSupply", signalWord: "DANGER", status: "active" },
      { id: "sds-2", createdDate: days(-200), productName: "Surface Disinfectant", manufacturer: "CleanCo", signalWord: "WARNING", status: "active" },
      { id: "sds-3", createdDate: days(-180), productName: "Hand Sanitizer Gel", manufacturer: "PureHands", signalWord: "WARNING", status: "needs_review" },
      { id: "sds-4", createdDate: days(-150), productName: "Bleach Solution", manufacturer: "CleanCo", signalWord: "DANGER", status: "active" },
      { id: "sds-5", createdDate: days(-100), productName: "Glass Cleaner", manufacturer: "ShineCo", signalWord: "CAUTION", status: "missing" },
      { id: "sds-6", createdDate: days(-80), productName: "Lubricating Jelly", manufacturer: "MedSupply", signalWord: "NONE", status: "active" },
    ],
    riskCases: [
      { id: "risk-1", createdDate: days(-40), caseTitle: "Patient PHI emailed unencrypted", caseType: "hipaa", severity: "high", status: "investigating", accessLevel: "restricted", reportedByName: "Riley Chen", incidentDate: days(-42) },
      { id: "risk-2", createdDate: days(-25), caseTitle: "Slip-and-fall near entrance", caseType: "safety", severity: "medium", status: "open", accessLevel: "standard", reportedByName: "Morgan Diaz", incidentDate: days(-26) },
      { id: "risk-3", createdDate: days(-15), caseTitle: "Medication count discrepancy", caseType: "controlled", severity: "critical", status: "open", accessLevel: "restricted", reportedByName: "Jordan Reyes", incidentDate: days(-16) },
      { id: "risk-4", createdDate: days(-90), caseTitle: "Staff complaint — scheduling", caseType: "hr", severity: "low", status: "resolved", accessLevel: "restricted", reportedByName: "Casey Nguyen", incidentDate: days(-92) },
    ],
    incidents: [],
    correctiveActions: [],
    breachAssessments: [],
    sraAssessments: [],
    sraFindings: [],
    exclusionScreenings: [],
    ccoPreferences: [],
    agendaSnoozes: [],
    navPreferences: [],
    roleRequirements: [],
    audits: [],
    auditItems: [],
    activityLog: [],
    backups: [],
    policyAcks: [
      { id: "ack-1", createdDate: days(-30), userId: "user-2", userName: "Jordan Reyes", documentId: "doc-1", documentTitle: "HIPAA Privacy Policy", status: "acknowledged", acknowledgedAt: days(-30), expiresAt: days(335) },
      { id: "ack-2", createdDate: days(-30), userId: "user-3", userName: "Sam Patel", documentId: "doc-1", documentTitle: "HIPAA Privacy Policy", status: "acknowledged", acknowledgedAt: days(-30), expiresAt: days(335) },
    ],
    regulatorySources: [
      { id: "reg-1", createdDate: days(-300), title: "HIPAA Privacy Rule", citationLabel: "45 CFR 164", issuingBody: "HHS", sourceType: "regulation", jurisdiction: "Federal", reviewStatus: "current", lastCheckedAt: days(-40), officialUrl: "https://www.hhs.gov/hipaa" },
      { id: "reg-2", createdDate: days(-300), title: "OSHA Bloodborne Pathogens Standard", citationLabel: "29 CFR 1910.1030", issuingBody: "OSHA", sourceType: "regulation", jurisdiction: "Federal", reviewStatus: "needs_review", lastCheckedAt: days(-200), officialUrl: "https://www.osha.gov" },
      { id: "reg-3", createdDate: days(-250), title: "Utah Controlled Substance Act", citationLabel: "Utah Code 58-37", issuingBody: "Utah Legislature", sourceType: "statute", jurisdiction: "Utah", reviewStatus: "current", lastCheckedAt: days(-20) },
      { id: "reg-4", createdDate: days(-200), title: "OSHA Hazard Communication", citationLabel: "29 CFR 1910.1200", issuingBody: "OSHA", sourceType: "regulation", jurisdiction: "Federal", reviewStatus: "needs_review", lastCheckedAt: days(-220) },
      { id: "reg-5", createdDate: days(-150), title: "HHS Telehealth Guidance", citationLabel: "HHS-TH-2024", issuingBody: "HHS", sourceType: "guidance", jurisdiction: "Federal", reviewStatus: "under_review", lastCheckedAt: days(-60) },
    ],
    recordVersions: [],
    businessRecords: [],
    lifecycleTasks: [],
    ceRecords: [],
    insurancePolicies: [
      { id: "ins-1", createdDate: days(-300), policyName: "Professional Liability", policyType: "malpractice", carrierName: "MedPro", policyNumber: "MP-10293", coverageAmountCents: 300000000, annualPremiumCents: 1850000, renewalDate: days(22) },
      { id: "ins-2", createdDate: days(-300), policyName: "Business Owners Policy", policyType: "bop", carrierName: "Hartford", policyNumber: "BOP-55821", coverageAmountCents: 200000000, annualPremiumCents: 940000, renewalDate: days(95) },
      { id: "ins-3", createdDate: days(-300), policyName: "Cyber Liability", policyType: "cyber", carrierName: "Coalition", policyNumber: "CY-77410", coverageAmountCents: 100000000, annualPremiumCents: 620000, renewalDate: days(-3) },
    ],
    emergencyDrills: [
      { id: "drill-1", createdDate: days(-120), drillTitle: "Fire evacuation — Lehi", drillType: "fire", scheduledDate: days(-26), status: "completed", participantCount: 14 },
      { id: "drill-2", createdDate: days(-30), drillTitle: "Active shooter response", drillType: "active_shooter", scheduledDate: days(-2), status: "scheduled", participantCount: 0 },
      { id: "drill-3", createdDate: days(-20), drillTitle: "Severe weather shelter", drillType: "severe_weather", scheduledDate: days(18), status: "scheduled", participantCount: 0 },
    ],
    inventory: [
      { id: "inv-1", createdDate: days(-200), itemName: "Vitals Monitor", itemType: "equipment", status: "active", condition: "good", locationId: "loc-1", removedFromInventory: false, quantity: 1, estimatedValueCents: 45000, aiIdentified: false },
      { id: "inv-2", createdDate: days(-200), itemName: "Exam Table", itemType: "furniture", status: "active", condition: "fair", locationId: "loc-2", removedFromInventory: false, quantity: 1, estimatedValueCents: 90000, aiIdentified: false },
      { id: "inv-3", createdDate: days(-150), itemName: "Medication Refrigerator", itemType: "equipment", status: "broken", condition: "poor", locationId: "loc-1", removedFromInventory: false, quantity: 1, estimatedValueCents: 120000, aiIdentified: false },
      { id: "inv-4", createdDate: days(-120), itemName: "Office Laptop", itemType: "electronics", status: "active", condition: "new", locationId: "loc-3", removedFromInventory: false, quantity: 1, estimatedValueCents: 130000, aiIdentified: false },
      { id: "inv-5", createdDate: days(-90), itemName: "Waiting Room Chair", itemType: "furniture", status: "removed", condition: "poor", locationId: "loc-2", removedFromInventory: true, quantity: 1, estimatedValueCents: 8000, aiIdentified: false },
    ],
    timeClockEntries: [],
    timeOffRequests: [],
    ptoBalances: [],
    payrollRecords: [],
    performanceReviews: [],
    disciplinaryActions: [],
    benefits: [],
    vendors: [],
    payerContracts: [],
    payerEnrollments: [],
    competencyRecords: [],
    auditLogs: [],
    trainingQuestions: [],
    trainingAttempts: [],
    formTemplates: [],
    formAssignments: [],
    completedForms: [],
    employeeDocuments: [],
    controlledSubstanceLogs: [],
    controlledSubstanceItems: [],
    controlledSubstanceEvents: [],
    deaRecords: [],
    notifications: [],
    organizationSettings: [],
    chatMessages: [],
  };
}
