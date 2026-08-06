// Playbooks — the multi-step tasks the Guide walks a user through, one step at a
// time, across the pages each step lives on. Each step teaches (why + how),
// links to exactly where to act, and can point the on-screen highlight tour at a
// specific control via `anchor` (a data-guide="..." attribute on that page).
// Content only; no client imports so the API route can reference these too.

export interface PlaybookStep {
  key: string;
  title: string;
  /** Why this step matters (the obligation or the practical reason). */
  why: string;
  /** How to do it, concretely, on the page you're sent to. */
  how: string;
  /** Where to do it. */
  route: string;
  /** Optional data-guide anchor on that page for the highlight-tour style. */
  anchor?: string;
  /** Optional Sage prompt that pre-fills the chat style for this step. */
  ask?: string;
}

export interface Playbook {
  slug: string;
  title: string;
  goal: string;
  /** ~time to complete, for expectations. */
  estimate: string;
  /** accountRole values this is mainly for; omit = anyone. */
  roles?: string[];
  steps: PlaybookStep[];
}

export const PLAYBOOKS: Playbook[] = [
  {
    slug: "onboard-hire",
    title: "Onboard a new hire",
    goal: "Get a new employee fully set up — access, training, credentials, and screening — so they're compliant from day one.",
    estimate: "~15 min",
    roles: ["owner", "admin", "hr"],
    steps: [
      {
        key: "add-employee",
        title: "Add the employee and invite their login",
        why: "Everything else — training assignments, credentials, the portal — hangs off the employee record. A login lets them do their own acknowledgments.",
        how: "Add the person with their name, email, department, and role, and send the invite. If they won't have a login yet, add them without an email and invite later.",
        route: "/hr/employees", anchor: "add-employee",
        ask: "Help me add a new employee and invite them.",
      },
      {
        key: "set-role",
        title: "Set their role and manager",
        why: "Their job role decides which training and credentials are required, and their manager sets the chain of command for accountability.",
        how: "On the org chart, set the person's job role and who they report to.",
        route: "/org-chart", anchor: "org-role",
      },
      {
        key: "assign-training",
        title: "Assign required training",
        why: "Annual HIPAA and OSHA training is required, and role-specific training must be assigned and completed with proof.",
        how: "Assign the modules their role requires, with a due date. The org chart flags exactly what's missing.",
        route: "/org-chart", anchor: "assign-training",
        ask: "What training does this role require, and can you assign it?",
      },
      {
        key: "collect-credentials",
        title: "Collect their licenses and credentials",
        why: "A clinician can't see patients or bill on a lapsed or missing license/DEA. Capture them now with expiration dates.",
        how: "Add each license, certification, and (if applicable) DEA registration, with numbers, expiration dates, and a copy attached.",
        route: "/credentials", anchor: "add-credential",
        ask: "Help me add this new hire's license and DEA credentials.",
      },
      {
        key: "screen",
        title: "Run a background & exclusion screening",
        why: "Billing federal programs for an excluded person triggers penalties. OIG guidance is to screen at hire and keep dated proof.",
        how: "Screen the new hire against the OIG-LEIE and SAM lists and record the dated clean result.",
        route: "/exclusion-screening", anchor: "run-screening",
      },
      {
        key: "acknowledge",
        title: "Assign policy acknowledgments",
        why: "New staff must receive and acknowledge your key policies (HIPAA, code of conduct) — the acknowledgment is your proof of training.",
        how: "Make sure the required policies are set to require acknowledgment; the new hire completes them from their portal.",
        route: "/policy-attestation", anchor: "require-ack",
      },
    ],
  },
  {
    slug: "annual-sra",
    title: "Run the annual Security Risk Assessment",
    goal: "Complete the HIPAA Security Rule risk analysis and get every high/medium finding into remediation.",
    estimate: "~30–45 min",
    roles: ["owner", "admin", "clinical_leadership"],
    steps: [
      {
        key: "open-sra",
        title: "Open the Security Risk Assessment",
        why: "The Security Rule (§164.308(a)(1)) requires an accurate, thorough risk analysis at least annually — it's the #1 thing OCR requests after a breach.",
        how: "Open the assessment; it can pre-fill each safeguard's status from your live data to save time.",
        route: "/security-risk-assessment", anchor: "sra-start",
        ask: "Walk me through this year's Security Risk Assessment.",
      },
      {
        key: "work-safeguards",
        title: "Work each safeguard (administrative, physical, technical)",
        why: "A real risk analysis covers all three safeguard categories, not just IT. Gaps you don't record are gaps you can't defend.",
        how: "Go safeguard by safeguard; confirm or correct the pre-filled status and note evidence.",
        route: "/security-risk-assessment", anchor: "sra-safeguards",
      },
      {
        key: "remediate",
        title: "Write remediation for every high/medium finding",
        why: "Identifying a risk without a remediation plan is worse than not documenting it. Each finding needs an owner, plan, and date.",
        how: "For each finding, set the risk level and a remediation plan — the Guide can draft the plan — with a due date.",
        route: "/security-risk-assessment", anchor: "sra-remediate",
        ask: "Draft a remediation plan for my high-risk findings.",
      },
      {
        key: "track",
        title: "Track findings to closure on your plan",
        why: "Open findings age into overdue risk. The Daily Priorities plan keeps them in front of you until they're closed.",
        how: "Check that high/medium findings now appear on your plan, and drive them to closure.",
        route: "/chief-of-staff",
      },
    ],
  },
  {
    slug: "credentials-current",
    title: "Get credentials current",
    goal: "Make sure no provider is working on an expired or soon-to-expire license, certification, or DEA registration.",
    estimate: "~10 min",
    roles: ["owner", "admin", "hr", "clinical_leadership"],
    steps: [
      {
        key: "review-expiring",
        title: "Review what's expired or expiring",
        why: "A lapsed license or DEA is a licensing violation and a billing/liability exposure — and payers ask for current proof.",
        how: "Open Credentials and look at the expired / expiring-soon items first.",
        route: "/credentials", anchor: "expiring",
        ask: "Which credentials are expired or expiring soon?",
      },
      {
        key: "start-renewals",
        title: "Start renewals and log the new term",
        why: "Renewals take time with licensing boards; starting late is how lapses happen.",
        how: "For each expiring credential, begin the renewal and add the new term when it arrives — the old one is superseded automatically.",
        route: "/credentials", anchor: "add-credential",
      },
      {
        key: "reminders",
        title: "Make sure nothing else is about to slip",
        why: "Staying ahead beats scrambling. The plan surfaces every credential before it lapses.",
        how: "Check the plan for any credential items and add tasks for the ones you'll handle this week.",
        route: "/chief-of-staff",
      },
    ],
  },
  {
    slug: "possible-breach",
    title: "Respond to a possible PHI breach",
    goal: "Handle a suspected privacy incident correctly — assess it, meet the 60-day clock if reportable, and prevent a repeat.",
    estimate: "~20 min",
    roles: ["owner", "admin", "clinical_leadership"],
    steps: [
      {
        key: "log-incident",
        title: "Log the incident",
        why: "You must be able to show you detected and responded. Capture what happened, when, and what PHI was involved.",
        how: "Open an incident with the facts, date, and severity.",
        route: "/incidents", anchor: "add-incident",
        ask: "Help me log a possible privacy incident.",
      },
      {
        key: "four-factor",
        title: "Run the four-factor breach assessment",
        why: "The Breach Notification Rule presumes a breach unless a four-factor analysis shows low probability of compromise. This determination is required.",
        how: "Work the four factors (nature of PHI, who received it, whether it was actually acquired/viewed, mitigation) and record the determination.",
        route: "/breach-assessment", anchor: "four-factor",
        ask: "Walk me through the HIPAA four-factor analysis.",
      },
      {
        key: "notify",
        title: "If reportable, meet the 60-day notification clock",
        why: "Notification is due without unreasonable delay and within 60 days of discovery; HHS (and sometimes media) thresholds apply.",
        how: "If the determination is a reportable breach, the 60-day clock is on your plan — notify affected individuals and file as required.",
        route: "/chief-of-staff",
      },
      {
        key: "capa",
        title: "Open a corrective action to prevent a repeat",
        why: "Surveyors and plaintiffs look for the fix, not just the report. A closed-loop corrective action shows the program works.",
        how: "Create a corrective action with an owner and due date, and drive it to closure.",
        route: "/incidents", anchor: "add-capa",
      },
    ],
  },
  {
    slug: "audit-ready",
    title: "Get audit-ready",
    goal: "Find and fix your gaps before a real HIPAA/OSHA surveyor or payer does, and produce a board-ready picture of the program.",
    estimate: "~30 min",
    roles: ["owner", "admin", "clinical_leadership"],
    steps: [
      {
        key: "mock-survey",
        title: "Run a mock survey",
        why: "OIG expects internal auditing. A mock survey surfaces the findings while you can still fix them quietly.",
        how: "Start a mock HIPAA (or OSHA/payer) survey and score each item honestly.",
        route: "/audits", anchor: "start-audit",
        ask: "Start a mock HIPAA survey and tell me where I'm weak.",
      },
      {
        key: "fix-findings",
        title: "Turn failed items into corrective actions",
        why: "A finding with no fix is just a documented problem. Each failed item needs an owner and a due date.",
        how: "For every partial/fail, open a corrective action and start closing it.",
        route: "/incidents", anchor: "add-capa",
      },
      {
        key: "seven-elements",
        title: "Check the OIG seven elements",
        why: "The seven elements are the recognized definition of an effective program; leadership expects to see you measured against them.",
        how: "Review each element for gaps and work the ones flagged.",
        route: "/program-effectiveness", anchor: "seven-elements",
      },
      {
        key: "board-report",
        title: "Generate the board report",
        why: "Leadership oversight is itself a compliance element. A clear report closes the loop.",
        how: "Generate the board report and bring it to your next leadership meeting.",
        route: "/program-effectiveness", anchor: "board-report",
        ask: "Draft a board report on our compliance program.",
      },
    ],
  },
  {
    slug: "sop-foundation",
    title: "Build your core policy set",
    goal: "Get your required written policies in place, reviewed, and acknowledged by staff.",
    estimate: "~25 min",
    roles: ["owner", "admin", "clinical_leadership"],
    steps: [
      {
        key: "draft-core", title: "Draft your core policies",
        why: "HIPAA requires written policies, and surveyors ask for current ones. Starting from a solid draft beats a blank page.",
        how: "Have Sage draft the essentials — HIPAA privacy & security, breach response, and a code of conduct — saved straight to the SOP Library.",
        route: "/sop-library", anchor: "add-document", ask: "Draft our core HIPAA privacy, security, and breach-response policies.",
      },
      {
        key: "review-dates", title: "Set a review date on each policy",
        why: "Out-of-date policies are a finding. An annual review date resurfaces each one before it goes stale.",
        how: "Give every policy a review date (annual is typical).",
        route: "/sop-library",
      },
      {
        key: "acknowledge", title: "Require staff acknowledgment",
        why: "It's not enough to have a policy — you must prove staff received it.",
        how: "Mark the policies that require acknowledgment; staff sign them from their portal.",
        route: "/policy-attestation", anchor: "require-ack",
      },
    ],
  },
  {
    slug: "osha-hazcom",
    title: "Set up OSHA safety & HazCom",
    goal: "Meet OSHA's core requirements — an SDS library, injury recordkeeping, and required safety training.",
    estimate: "~20 min",
    roles: ["owner", "admin"],
    steps: [
      {
        key: "sds", title: "Build your SDS library",
        why: "OSHA's HazCom standard (§1910.1200) requires an accessible Safety Data Sheet for every hazardous chemical on site.",
        how: "Add an SDS entry for each hazardous product — disinfectants, alcohol, bleach — and attach the manufacturer's sheet.",
        route: "/sds-library", ask: "Add SDS entries for our common disinfectants.",
      },
      {
        key: "osha-log", title: "Set up OSHA recordkeeping",
        why: "OSHA requires recording work-related injuries/illnesses and posting the 300A summary annually.",
        how: "Log any recordable events; the tracker builds the 300 log, 300A, and 301 forms for you.",
        route: "/osha-tracker",
      },
      {
        key: "safety-training", title: "Assign OSHA safety training",
        why: "Bloodborne pathogens and HazCom training are required for clinical staff.",
        how: "Assign the OSHA training modules to the staff who need them.",
        route: "/training-academy", ask: "Assign OSHA bloodborne-pathogens and HazCom training to clinical staff.",
      },
    ],
  },
  {
    slug: "monthly-screening",
    title: "Run monthly exclusion screening",
    goal: "Screen every employee and billing-relevant vendor and keep dated proof.",
    estimate: "~10 min",
    roles: ["owner", "admin", "hr"],
    steps: [
      {
        key: "who-due", title: "See who's due",
        why: "OIG guidance is to screen at hire and monthly thereafter.",
        how: "Check who hasn't been screened in the last month.",
        route: "/exclusion-screening", anchor: "run-screening", ask: "Who is due for exclusion screening?",
      },
      {
        key: "screen", title: "Screen and record the results",
        why: "Billing federal programs for anything involving an excluded person triggers penalties. The dated record is your proof.",
        how: "Screen each subject against OIG-LEIE and SAM, and record the dated result.",
        route: "/exclusion-screening",
      },
    ],
  },
  {
    slug: "vendor-baa",
    title: "Onboard a vendor & get the BAA",
    goal: "Add a new vendor and make sure any PHI access is covered by a signed Business Associate Agreement.",
    estimate: "~10 min",
    roles: ["owner", "admin"],
    steps: [
      {
        key: "add-vendor", title: "Add the vendor",
        why: "You're accountable for every business associate that touches PHI or your systems.",
        how: "Add the vendor and mark whether it has access to PHI.",
        route: "/vendor-management", anchor: "add-vendor", ask: "Add a new vendor that will have access to PHI.",
      },
      {
        key: "baa", title: "Get the BAA signed and tracked",
        why: "Sharing PHI with a vendor without a signed BAA is itself a HIPAA violation (§164.502(e)).",
        how: "Record the BAA status and set a review date so it doesn't lapse.",
        route: "/vendor-management",
      },
    ],
  },
  {
    slug: "emergency-plans",
    title: "Stand up emergency plans & drills",
    goal: "A written response plan for every required scenario, plus scheduled and recorded drills.",
    estimate: "~25 min",
    roles: ["owner", "admin", "clinical_leadership"],
    steps: [
      {
        key: "coverage", title: "Check scenario coverage & draft what's missing",
        why: "OSHA requires an emergency action plan, and a behavioral-health setting must be ready for medical and active-threat events.",
        how: "See which required scenarios lack a plan, and draft the missing ones.",
        route: "/emergency-preparedness", ask: "Which emergency plans are we missing, and can you draft them?",
      },
      {
        key: "drills", title: "Schedule and record drills",
        why: "A drill is what proves the plan is real, not just paper.",
        how: "Schedule the required fire, medical, and lockdown drills, and record them once done.",
        route: "/emergency-preparedness",
      },
    ],
  },
  {
    slug: "board-review",
    title: "Prepare your leadership review",
    goal: "Produce a clear, honest picture of program effectiveness for your leadership or board meeting.",
    estimate: "~15 min",
    roles: ["owner", "admin"],
    steps: [
      {
        key: "elements", title: "Check the OIG seven elements",
        why: "The seven elements are the recognized definition of an effective compliance program.",
        how: "Review each element for gaps and work the ones flagged.",
        route: "/program-effectiveness", anchor: "seven-elements",
      },
      {
        key: "report", title: "Generate the board report",
        why: "Leadership oversight is itself a compliance element; a clear report closes the loop.",
        how: "Generate the board report and bring it to your meeting.",
        route: "/program-effectiveness", anchor: "board-report", ask: "Draft a board report on our compliance program.",
      },
    ],
  },
  {
    slug: "weekly-backup",
    title: "Do your compliance data backup",
    goal: "Take a compliant offsite backup and stay on cadence.",
    estimate: "~5 min",
    roles: ["owner", "admin"],
    steps: [
      {
        key: "export", title: "Export an offsite copy",
        why: "HIPAA's contingency-plan standard requires your data to survive a system loss — a backup you can read without the app.",
        how: "Export the full backup and store the copy somewhere offsite (not just on this machine).",
        route: "/backup",
      },
    ],
  },
  {
    slug: "ppt-filing",
    title: "Prepare the Utah property-tax filing",
    goal: "Classify your taxable assets and produce the county personal-property statement (Pub 20).",
    estimate: "~20 min",
    roles: ["owner", "admin"],
    steps: [
      {
        key: "classify", title: "Classify your taxable assets",
        why: "Utah taxes business personal property annually; each item needs a valuation class plus its acquisition cost and year.",
        how: "On taxable inventory items, set the Utah tax class and the acquisition cost/year (the Suggest button helps).",
        route: "/inventory", ask: "Which inventory items still need a Utah tax class?",
      },
      {
        key: "worksheet", title: "Print the tax worksheet",
        why: "The worksheet preps your county Signed Statement — assessed Jan 1, due May 15.",
        how: "Print the personal-property-tax worksheet, grouped by location, and use it to file.",
        route: "/inventory",
      },
    ],
  },
];

const PB_BY_SLUG: Record<string, Playbook> = Object.fromEntries(PLAYBOOKS.map((p) => [p.slug, p]));

export function playbookBySlug(slug: string): Playbook | undefined {
  return PB_BY_SLUG[slug];
}
