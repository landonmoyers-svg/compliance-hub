// The Guide's authoritative knowledge of the app itself — what each feature is,
// WHY it matters (the specific rule/standard behind it), HOW to use it step by
// step, and what "done well" looks like. This is the teaching layer: it powers
// the Learn view and grounds Sage so guidance is accurate and consistent instead
// of improvised. Kept free of client-only imports so the API route can use it too.
//
// Sources for the "why" are the real obligations (HIPAA Privacy/Security/Breach
// rules, OSHA, OIG compliance-program guidance, DEA, Utah DOPL). Keep these
// current as regulations change.

export interface FeatureGuide {
  slug: string;
  title: string;
  route: string;
  /** High-level grouping for the Learn view. */
  category:
    | "Start here" | "People & Roles" | "Policies & Training" | "Privacy & Security"
    | "Safety" | "Oversight" | "Operations";
  /** One-line plain-English "what is this". */
  what: string;
  /** Why it matters — the obligation/standard, in plain English. */
  why: string;
  /** How to use it, step by step. */
  how: string[];
  /** What "good" / "done" looks like on this page. */
  doneWhen: string;
  /** Roles who most own this (accountRole values); omit = everyone. */
  roles?: string[];
  /** Related playbook slugs (see playbooks.ts). */
  playbooks?: string[];
}

export const FEATURES: FeatureGuide[] = [
  {
    slug: "guide", title: "Your Guide", route: "/guide", category: "Start here",
    what: "Your home base — today's prioritized plan, step-by-step walkthroughs of any task, and short lessons on every feature.",
    why: "A compliance program only works if the person running it knows what to do next and why. The Guide keeps you a step ahead instead of buried.",
    how: [
      "Start each day on the plan — the highest-risk, most time-sensitive items are already at the top.",
      "Use “Walk me through it” when a task has several steps across pages; the Guide walks you through each one.",
      "Use “Learn” to understand any feature — what it is, why it matters, and how to use it.",
      "Use “Plan my week” to turn the plan into a schedule you can actually keep.",
    ],
    doneWhen: "You end each day knowing nothing important slipped, and you're never guessing what to do next.",
  },
  {
    slug: "chief-of-staff", title: "Daily Priorities", route: "/chief-of-staff", category: "Start here",
    what: "One risk-ranked list that fuses every deadline in the program — credentials, training, policy reviews, corrective actions, security findings, breach clocks, insurance, BAAs, screening, backups, and regulatory dates.",
    why: "OIG compliance-program guidance expects active monitoring and follow-up. Scattered deadlines are how things lapse; a single ranked plan is how they don't.",
    how: [
      "Read top-to-bottom: Overdue first, then Today, This week, and On the horizon.",
      "Each item says why it matters and links straight to where you act on it.",
      "Add anything to your tasks, or snooze it for a week if it's genuinely not now.",
      "Use “Brief me” for a short spoken-style summary of where you stand.",
    ],
    doneWhen: "The Overdue bucket is empty and This week is under control.",
    roles: ["owner", "admin", "hr", "clinical_leadership"],
  },
  {
    slug: "org-chart", title: "Org Chart & Role Requirements", route: "/org-chart", category: "People & Roles",
    what: "Your chain of command plus the training and credentials each role is required to hold — with per-person gaps flagged.",
    why: "HIPAA's “minimum necessary” standard and good governance require clear roles and accountability. Defining what each role must hold is what makes training and credential tracking meaningful.",
    how: [
      "Set each person's job role and who they report to.",
      "For each role, list the required training and credentials.",
      "Review the per-person gaps — required vs. actually held.",
      "Assign the missing training in one click where the person has a login.",
    ],
    doneWhen: "Every active employee has a role, a manager, and no unexplained requirement gaps.",
    roles: ["owner", "admin", "hr"],
    playbooks: ["onboard-hire"],
  },
  {
    slug: "credentials", title: "Credentials", route: "/credentials", category: "People & Roles",
    what: "A tracker for every license, certification, DEA registration, and background check, with expiration dates and renewal reminders.",
    why: "Letting a provider work on a lapsed license or DEA registration is a licensing violation and a billing/liability exposure. Payers and surveyors ask for current proof.",
    how: [
      "Add each credential with its number, issuing body, and expiration date.",
      "Attach the certificate or license image as proof.",
      "Watch the expiring list; start renewals well before the date.",
      "When a renewal arrives, add the new term — the old one is superseded automatically.",
    ],
    doneWhen: "No active provider has an expired or soon-to-expire credential without a renewal already in progress.",
    roles: ["owner", "admin", "hr", "clinical_leadership"],
    playbooks: ["credentials-current", "onboard-hire"],
  },
  {
    slug: "exclusion-screening", title: "Exclusion Screening", route: "/exclusion-screening", category: "People & Roles",
    what: "Monthly screening of staff and vendors against the OIG-LEIE and SAM exclusion lists, with dated proof.",
    why: "Billing federal programs for anything involving an excluded person can trigger civil monetary penalties. OIG guidance is to screen at hire and monthly thereafter, and keep proof.",
    how: [
      "Screen every active employee and every billing-relevant vendor.",
      "Record the date and result for each — that dated record is your proof.",
      "Re-screen monthly; the plan flags who's due.",
    ],
    doneWhen: "Everyone has a clean screening dated within the last month.",
    playbooks: ["monthly-screening"],
    roles: ["owner", "admin", "hr"],
  },
  {
    slug: "sop-library", title: "SOP Library", route: "/sop-library", category: "Policies & Training",
    what: "Your policies, procedures, and SOPs, each with a review date and staff acknowledgment tracking.",
    why: "HIPAA requires written policies and evidence staff were trained on them; surveyors ask for current, reviewed, acknowledged policies. Out-of-date policies are a finding.",
    how: [
      "Add each policy — or have the Guide draft the full document for you.",
      "Set a review date (annual is typical) so it resurfaces before it goes stale.",
      "Mark which policies require staff acknowledgment.",
      "Track who has acknowledged and follow up on the rest.",
    ],
    doneWhen: "Every required policy exists, is within its review date, and required staff have acknowledged it.",
    roles: ["owner", "admin", "hr", "clinical_leadership"],
    playbooks: ["sop-foundation", "audit-ready"],
  },
  {
    slug: "training-academy", title: "Training Academy", route: "/training-academy", category: "Policies & Training",
    what: "Build training modules and quizzes and assign them to staff, with completion tracking.",
    why: "Annual HIPAA and OSHA training is required, and OIG lists training as a core compliance element. You need proof each person completed the required training.",
    how: [
      "Create the required modules (HIPAA, OSHA bloodborne pathogens, HazCom, code of conduct).",
      "Assign them to the right roles with a due date.",
      "Monitor completion and nudge anyone overdue.",
    ],
    doneWhen: "Every role's required training is assigned and completed on time.",
    roles: ["owner", "admin", "hr"],
    playbooks: ["onboard-hire"],
  },
  {
    slug: "policy-attestation", title: "Policy Acknowledgments", route: "/policy-attestation", category: "Policies & Training",
    what: "Collects and records each employee's acknowledgment that they've read a required policy.",
    why: "It's not enough to have a policy — you must show staff received and understood it. Acknowledgment records are the proof.",
    how: [
      "Publish the policies that require acknowledgment.",
      "Staff review and acknowledge from their portal.",
      "Follow up with anyone outstanding.",
    ],
    doneWhen: "Every required acknowledgment is collected and dated.",
    roles: ["owner", "admin", "hr"],
  },
  {
    slug: "security-risk-assessment", title: "Security Risk Assessment", route: "/security-risk-assessment", category: "Privacy & Security",
    what: "The annual HIPAA Security Rule risk assessment across administrative, physical, and technical safeguards, with remediation tracking.",
    why: "The HIPAA Security Rule (§164.308(a)(1)) requires an accurate, thorough risk analysis — and it's the single most common thing OCR asks for after a breach. Skipping it is a frequent, expensive finding.",
    how: [
      "Work each safeguard; the app can pre-fill status from your live data.",
      "For every gap, record the risk level and a remediation plan (the Guide can draft it).",
      "Drive high and medium findings to closure.",
      "Repeat at least annually, and after any major change.",
    ],
    doneWhen: "Every safeguard is assessed and no high/medium finding is left un-remediated.",
    roles: ["owner", "admin", "clinical_leadership"],
    playbooks: ["annual-sra"],
  },
  {
    slug: "incidents", title: "Incidents & Corrective Actions", route: "/incidents", category: "Privacy & Security",
    what: "Report compliance incidents and drive each to closure with corrective and preventive actions (CAPA).",
    why: "OIG expects a way to detect issues and respond. An open incident with no corrective action is exactly what surveyors and plaintiffs look for.",
    how: [
      "Log the incident with what happened, when, and severity.",
      "Open a corrective action with an owner and due date.",
      "If PHI may have been exposed, run the breach assessment.",
      "Close the loop once the fix is verified.",
    ],
    doneWhen: "No incident is left open without an owned corrective action moving toward closure.",
    roles: ["owner", "admin", "hr", "clinical_leadership"],
    playbooks: ["possible-breach"],
  },
  {
    slug: "breach-assessment", title: "Breach Risk Assessment", route: "/breach-assessment", category: "Privacy & Security",
    what: "The HIPAA four-factor analysis that decides whether an incident is a reportable breach — with the 60-day notification clock.",
    why: "The Breach Notification Rule (§164.402–410) presumes a breach unless a four-factor analysis shows low probability of compromise. Notification is due without unreasonable delay and within 60 days.",
    how: [
      "Enter the incident and work the four factors (nature of PHI, who received it, whether it was actually acquired/viewed, and mitigation).",
      "Record the determination — low probability, or reportable breach.",
      "If reportable, the 60-day clock starts; notify affected individuals (and HHS/media per thresholds).",
    ],
    doneWhen: "Every possible-exposure incident has a documented four-factor determination, and any reportable breach is notified within 60 days.",
    roles: ["owner", "admin", "clinical_leadership"],
    playbooks: ["possible-breach"],
  },
  {
    slug: "vendor-management", title: "Vendor Management & BAAs", route: "/vendor-management", category: "Privacy & Security",
    what: "Track vendors and business associates, including Business Associate Agreement (BAA) status and periodic reviews.",
    why: "Sharing PHI with a vendor without a signed BAA is itself a HIPAA violation (§164.502(e)). You're accountable for your business associates.",
    how: [
      "List every vendor that touches PHI or systems (EHR, billing, IT, shredding, cloud).",
      "Mark which need a BAA and record signed/expired status.",
      "Set a review date and re-verify periodically.",
    ],
    doneWhen: "Every PHI-touching vendor has a current, signed BAA on file.",
    playbooks: ["vendor-baa"],
    roles: ["owner", "admin"],
  },
  {
    slug: "emergency-preparedness", title: "Emergency Preparedness", route: "/emergency-preparedness", category: "Safety",
    what: "Written emergency response plans (with step-by-step algorithms) for every required scenario, plus drill scheduling and tracking.",
    why: "OSHA requires an emergency action plan, and a behavioral-health setting must be ready for medical, active-threat, fire, and evacuation events. Drills prove the plan is real.",
    how: [
      "Check coverage against the required scenarios; draft any missing plans.",
      "Review each plan for gaps.",
      "Schedule the required drills and record that they happened.",
    ],
    doneWhen: "Every required scenario has a current plan and drills are on schedule.",
    playbooks: ["emergency-plans"],
    roles: ["owner", "admin", "clinical_leadership"],
  },
  {
    slug: "sds-library", title: "SDS Library & HazCom", route: "/sds-library", category: "Safety",
    what: "Safety Data Sheets for every hazardous product on site (OSHA Hazard Communication).",
    why: "OSHA's HazCom standard (§1910.1200) requires an accessible SDS for each hazardous chemical. Missing SDSs are a common OSHA citation.",
    how: [
      "Add an SDS entry for each hazardous product (disinfectants, alcohol, bleach).",
      "Attach the manufacturer's SDS document.",
      "Keep the library current as products change.",
    ],
    doneWhen: "Every hazardous product on site has a current SDS on file.",
    playbooks: ["osha-hazcom"],
    roles: ["owner", "admin"],
  },
  {
    slug: "osha-tracker", title: "OSHA Recordkeeping", route: "/osha-tracker", category: "Safety",
    what: "Log work-related injuries/illnesses and generate the OSHA 300 log, 300A summary, and 301 forms.",
    why: "OSHA requires covered employers to record work-related injuries and post the 300A summary annually. The app applies the recordability decision and produces the forms.",
    how: [
      "Log any work-related injury or illness event.",
      "Let the tool decide recordability and place it on the 300 log.",
      "Generate and post the 300A summary in the required window.",
    ],
    doneWhen: "All recordable events are logged and the 300A is posted on schedule.",
    playbooks: ["osha-hazcom"],
    roles: ["owner", "admin", "hr"],
  },
  {
    slug: "audits", title: "Audits & Mock Surveys", route: "/audits", category: "Oversight",
    what: "Run internal audits and mock HIPAA/OSHA/payer surveys, capturing findings and corrective actions.",
    why: "OIG expects internal auditing and monitoring. A mock survey finds the gaps before a real surveyor — or payer — does.",
    how: [
      "Start an audit from a checklist (internal, mock HIPAA, mock OSHA, payer).",
      "Score each item pass/partial/fail with a finding and remediation.",
      "Turn failed items into corrective actions and close them.",
    ],
    doneWhen: "You've run the mock survey for your risk areas and closed the findings.",
    roles: ["owner", "admin", "clinical_leadership"],
    playbooks: ["audit-ready"],
  },
  {
    slug: "program-effectiveness", title: "Program Effectiveness", route: "/program-effectiveness", category: "Oversight",
    what: "Maps your live program to the OIG seven elements and generates a board-ready report.",
    why: "The OIG seven elements are the recognized framework for an “effective” compliance program. Leadership and boards expect to see the program measured against them.",
    how: [
      "Review each of the seven elements — strong, partial, or gap — scored from real data.",
      "Work the gaps (they link to where you fix them).",
      "Generate the board report for your leadership meeting.",
    ],
    doneWhen: "No element is a gap, and you have a current board report.",
    roles: ["owner", "admin"],
    playbooks: ["audit-ready", "board-review"],
  },
  {
    slug: "controlled-substances", title: "Controlled Substances", route: "/controlled-substances", category: "Operations",
    what: "Chain-of-custody for controlled substances — bottle-level tracking, provider checkout, and destruction records.",
    why: "DEA requires accountability and accurate records for controlled substances; gaps invite diversion and DEA action. Behavioral-health practices using ketamine especially need tight custody.",
    how: [
      "Log receipt and mint bottle-level IDs.",
      "Record provider checkout with a custody log.",
      "Document waste/destruction with references.",
    ],
    doneWhen: "Every controlled substance is accounted for from receipt to administration or destruction.",
    roles: ["owner", "admin", "clinical_leadership"],
  },
  {
    slug: "inventory", title: "Inventory", route: "/inventory", category: "Operations",
    what: "Physical asset inventory across locations, with AI photo cataloging, value estimates, and Utah personal-property-tax classification.",
    why: "You need an asset record for insurance and continuity, and Utah taxes business personal property annually (Pub 20) — the app classifies and depreciates each item and prepares the county statement.",
    how: [
      "Add items (snap a photo and let AI catalog it) and assign a location.",
      "For taxable assets, set the Utah tax class plus acquisition cost and year.",
      "Print the personal-property-tax worksheet before the May 15 filing.",
    ],
    doneWhen: "Assets are cataloged by location and taxable items are classified for the annual filing.",
    playbooks: ["ppt-filing"],
    roles: ["owner", "admin"],
  },
  {
    slug: "insurance-vault", title: "Insurance Vault", route: "/insurance-vault", category: "Operations",
    what: "Track insurance policies (malpractice, general liability, cyber) with renewal dates.",
    why: "A lapse in malpractice or cyber coverage is a serious exposure. Renewals sneak up; tracking them prevents a gap.",
    how: [
      "Add each policy with carrier, number, and renewal date.",
      "Start renewals before the date; the plan surfaces them.",
    ],
    doneWhen: "Every required policy is active with no upcoming renewal unmanaged.",
    roles: ["owner", "admin"],
  },
];

const BY_SLUG: Record<string, FeatureGuide> = Object.fromEntries(FEATURES.map((f) => [f.slug, f]));
const BY_ROUTE: Record<string, FeatureGuide> = Object.fromEntries(FEATURES.map((f) => [f.route, f]));

export function featureBySlug(slug: string): FeatureGuide | undefined {
  return BY_SLUG[slug];
}

/** The feature guide for a pathname (exact route, else longest matching prefix). */
export function featureForPath(path: string): FeatureGuide | undefined {
  if (BY_ROUTE[path]) return BY_ROUTE[path];
  const key = FEATURES.map((f) => f.route)
    .filter((r) => r !== "/" && path.startsWith(r))
    .sort((a, b) => b.length - a.length)[0];
  return key ? BY_ROUTE[key] : undefined;
}

export const FEATURE_CATEGORIES: FeatureGuide["category"][] = [
  "Start here", "People & Roles", "Policies & Training", "Privacy & Security",
  "Safety", "Oversight", "Operations",
];
