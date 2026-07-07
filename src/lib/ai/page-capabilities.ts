// Page-awareness for the universal assistant. Maps a route to what the page is
// for, which propose-and-confirm actions make sense there, and example prompts.
// Kept free of client-only imports so both the API route and the widget can use it.

export interface PageCapability {
  title: string;
  purpose: string;
  actions: string[];   // action types the assistant may propose on this page
  examples: string[];  // suggested prompts shown in the widget
}

const TASK = "create_task";

const CAPABILITIES: Record<string, PageCapability> = {
  "/": {
    title: "Command Center",
    purpose: "A dashboard of the compliance program's health — scores, expiring items, and open tasks.",
    actions: [TASK],
    examples: ["What should I focus on first?", "Create a task to review expiring credentials this week"],
  },
  "/chief-of-staff": {
    title: "Chief of Staff",
    purpose: "Your prioritized, risk-ranked compliance plan across the whole program, kept a step ahead.",
    actions: [TASK],
    examples: ["What should I tackle first today?", "Create a task for the most urgent item"],
  },
  "/inventory": {
    title: "Inventory",
    purpose: "Track physical assets across locations, with AI photo cataloging and value estimates.",
    actions: ["create_inventory_item", TASK],
    examples: ["Add a label printer worth about $200 in the front office", "What can this page do?"],
  },
  "/credentials": {
    title: "Credentials",
    purpose: "Track staff licenses, certifications, and DEA registrations with expiration dates.",
    actions: ["create_credential", TASK],
    examples: ["Add a Utah RN license for Jane Doe expiring 2027-05-01", "Add a DEA registration for Dr. Smith"],
  },
  "/sop-library": {
    title: "SOP Library",
    purpose: "Store policies, procedures, and SOPs with review dates and acknowledgment tracking.",
    actions: ["create_document", TASK],
    examples: ["Draft a HIPAA privacy policy document", "Create a bloodborne pathogens exposure control SOP"],
  },
  "/vendor-management": {
    title: "Vendor Management",
    purpose: "Track vendors and business associates, including BAA status and reviews.",
    actions: ["create_vendor", TASK],
    examples: ["Add Supabase as a business associate that needs a BAA", "Add our shredding vendor"],
  },
  "/incidents": {
    title: "Incidents & Corrective Actions",
    purpose: "Report compliance incidents and drive each to closure with corrective actions (CAPA).",
    actions: [TASK],
    examples: ["How do I report an incident?", "Create a task to follow up on an open corrective action"],
  },
  "/breach-assessment": {
    title: "Breach Risk Assessment",
    purpose: "Run the HIPAA four-factor analysis to decide if an incident is a reportable breach, with a 60-day clock.",
    actions: [TASK],
    examples: ["What are the four factors?", "Create a task to notify affected parties within 60 days"],
  },
  "/security-risk-assessment": {
    title: "Security Risk Assessment",
    purpose: "Conduct the annual HIPAA Security Rule risk assessment across administrative, physical, and technical safeguards.",
    actions: [TASK],
    examples: ["What does this assessment cover?", "Create a task to remediate a high-risk finding"],
  },
  "/audits": {
    title: "Audits & Mock Surveys",
    purpose: "Run internal audits and mock HIPAA/OSHA/payer surveys; capture findings and corrective actions.",
    actions: [TASK],
    examples: ["Start a mock HIPAA survey", "Create a task for a failed audit item"],
  },
  "/program-effectiveness": {
    title: "Program Effectiveness",
    purpose: "Maps the compliance program to the OIG seven elements and generates a board report.",
    actions: [TASK],
    examples: ["Which of the seven elements has a gap?", "Draft a board report"],
  },
  "/risk-management": {
    title: "HIPAA & Risk",
    purpose: "Document and manage HIPAA incidents and risk cases through investigation to closure.",
    actions: ["create_risk_case", TASK],
    examples: ["Open a risk case for a lost laptop", "Log a HIPAA incident: email sent to wrong patient"],
  },
  "/sds-library": {
    title: "SDS Library",
    purpose: "Maintain Safety Data Sheets for hazardous products (OSHA HazCom).",
    actions: ["create_sds_record", TASK],
    examples: ["Add an SDS entry for isopropyl alcohol", "Add bleach as a hazardous product"],
  },
  "/insurance-vault": {
    title: "Insurance Vault",
    purpose: "Track insurance policies (malpractice, GL, cyber) with renewal dates.",
    actions: ["create_insurance_policy", TASK],
    examples: ["Add a malpractice policy renewing 2026-09-01", "Add our general liability policy"],
  },
  "/emergency-preparedness": {
    title: "Emergency Preparedness",
    purpose: "Schedule and track emergency drills (fire, tornado, lockdown).",
    actions: ["create_emergency_drill", TASK],
    examples: ["Schedule a fire drill for next month", "Add a lockdown drill"],
  },
  "/training-academy": {
    title: "Training Academy",
    purpose: "Build training modules and quizzes to assign to staff.",
    actions: ["create_training_module", TASK],
    examples: ["Create an annual HIPAA training module", "Add an OSHA bloodborne pathogens training"],
  },
  "/regulatory-sources": {
    title: "Regulatory Sources",
    purpose: "Track the federal and state regulations the practice must follow.",
    actions: ["create_regulatory_source", TASK],
    examples: ["Add the Utah telehealth statute", "Add OSHA Hazard Communication"],
  },
  "/exclusion-screening": {
    title: "Exclusion Screening",
    purpose: "Screen staff and vendors against OIG-LEIE and SAM exclusion lists and keep dated proof.",
    actions: [TASK],
    examples: ["Who is due for screening?", "Create a task to screen all staff this month"],
  },
  "/activity-log": {
    title: "Daily Activity Log",
    purpose: "A per-day log of every task by a person or AI, with the ability to undo AI actions.",
    actions: [TASK],
    examples: ["What did the AI do today?", "Create a task to review this week's activity"],
  },
  "/access-matrix": {
    title: "Role Access Matrix",
    purpose: "Documents who can see and do what by role, aligned to HIPAA minimum-necessary and best practice.",
    actions: [TASK],
    examples: ["Who can view payroll?", "Create a task to review access for the Manager role"],
  },
  "/settings": {
    title: "Settings",
    purpose: "Configure the organization profile and Work Locations.",
    actions: ["create_location", TASK],
    examples: ["Add our Provo clinic", "Add a Lehi office location"],
  },
  "/org-chart": {
    title: "Org Chart & Role Requirements",
    purpose: "Define the chain of command and the training/credentials each role requires; surface per-person gaps.",
    actions: [TASK],
    examples: ["Who has open requirement gaps?", "Create a task to define requirements for the MA role"],
  },
  "/hr/employees": {
    title: "Employees",
    purpose: "Manage the employee directory and provision app logins.",
    actions: ["create_employee", TASK],
    examples: ["Add employee Jane Doe jane@example.com as clinical staff and invite her", "Add a new front-desk employee"],
  },
};

const DEFAULT: PageCapability = {
  title: "Compliance Hub",
  purpose: "A healthcare compliance and practice-management app.",
  actions: [TASK],
  examples: ["What can I do on this page?", "Create a follow-up task"],
};

/** Resolve the capability for a pathname (longest known prefix, else default). */
export function capabilityForPath(path: string): PageCapability {
  if (CAPABILITIES[path]) return CAPABILITIES[path];
  // Longest-prefix match for nested routes.
  const key = Object.keys(CAPABILITIES)
    .filter((k) => k !== "/" && path.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? CAPABILITIES[key] : DEFAULT;
}
