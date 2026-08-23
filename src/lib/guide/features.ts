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
    what: "Monthly screening of staff and vendors against the OIG-LEIE and SAM.gov exclusion lists, with dated, downloadable proof.",
    why: "Billing federal programs for anything involving an excluded person can trigger civil monetary penalties. OIG guidance is to screen at hire and monthly thereafter, and to keep proof you did.",
    how: [
      "FASTEST PATH: click Run automated screening. It downloads the current official OIG-LEIE database and checks every active employee and vendor at once — you do not screen people one at a time.",
      "Clear results are recorded automatically. Download the evidence certificate for the run: it names the list, its size, the retrieval time, and the result per person — that is what an auditor accepts as proof.",
      "SAM.gov is a MANUAL verification step: their API blocks server-side checks, so each potential match has a SAM.gov button that opens a pre-filled search in your browser. This is expected, not a fault.",
      "A flagged result is a POSSIBLE name match, never a confirmed exclusion. Open it, verify identity against the official record by date of birth or NPI, then mark it No match or Confirmed match.",
      "Never take adverse action on a name match alone — common names collide constantly.",
      "Re-screen monthly; the coverage tile shows who is due.",
    ],
    doneWhen: "Coverage is 100% of active subjects within the last month, every potential match is resolved, and you have the evidence certificate saved.",
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

  /* ── added 2026-08-22: pages that had no lesson, written from the ACTUAL
     current UI (real stat tiles, real buttons, real AI actions) so the Guide
     never describes a control that doesn't exist. ───────────────────── */
  {
    slug: "home", title: "Home — Compliance Command Center", route: "/", category: "Start here",
    what: "The live action queue for the whole program: what is critical, overdue, due today, due this week, and coming up in 30 days.",
    why: "Compliance fails by drift, not by decision — a lapsed license or missed training is almost never deliberate. A single queue that surfaces what is actually late is what keeps a small practice audit-ready.",
    how: [
      "Read the six tiles first: Critical items, High priority, Open tasks, Active documents, Sources to review, Broken inventory. They are the whole program in one glance.",
      "Work the tabs left to right — Overdue and Due today before Coming up (30 days). Anything in Expired or Past review is already a finding if a surveyor walked in.",
      "Click any row to jump straight to the record; you do not need to hunt for it in its own module.",
      "Fastest habit: open Home once each morning and clear Overdue + Due today. Ten minutes here prevents most findings.",
    ],
    doneWhen: "Overdue and Expired are empty, and nothing in Due today is untouched.",
    playbooks: ["daily-compliance-check"],
  },
  {
    slug: "forms", title: "Forms", route: "/fillable-documents", category: "Policies & Training",
    what: "Your form library: build templates, fill them out (with AI help), assign them to staff, and keep completed submissions as records.",
    why: "Documentation is the evidence half of compliance. A form that is filled out vaguely, speculatively, or with blame in it can weaken the record it was meant to protect — and one containing patient PHI does not belong in this app at all.",
    how: [
      "Templates tab → click Fill out on any active form to complete it right now. You do NOT need to assign it to yourself first.",
      "FASTEST PATH: click AI prefill — it fills what it can from the employee and organization records already in the app, and labels each value with its source so you can verify it.",
      "Read the blue “How to complete this properly” panel at the top; each field also carries its own one-line guidance.",
      "Before submitting, click Review answers. The AI flags speculation, blame, admissions of liability, or vagueness and suggests defensible wording. Editing a flagged field clears its warning instantly.",
      "If the form asks whether it contains patient information, answer honestly — see the PHI lesson. Saying yes routes you to a local copy for the chart instead of saving PHI here.",
      "Use Assign form (Assignments tab) when someone else must complete it; Completed holds the permanent record and a PDF of each submission.",
    ],
    doneWhen: "Every active template shows the green Guided badge, pending assignments are near zero, and completed forms read as objective fact.",
    playbooks: ["assign-a-form"],
  },
  {
    slug: "phi-boundary", title: "The no-PHI rule", route: "/fillable-documents", category: "Privacy & Security",
    what: "This app holds the practice's OWN compliance records — never patient data. Anything that would identify a specific patient belongs in the chart/EHR.",
    why: "Keeping patient PHI out of this system is a deliberate boundary: it keeps the practice's breach surface small and avoids triggering vendor BAA obligations. The moment real PHI is entered, that protection is gone.",
    how: [
      "Use a DE-IDENTIFIED reference wherever a form or report asks about a patient — initials, or the last 4 of the MRN. Never the full name, date of birth, full MRN, or diagnosis.",
      "When you report an incident or submit a patient-touching form, the app asks: “Does this contain patient information?” Answer truthfully.",
      "Answer YES and the app refuses to store it, and instead generates a local copy on your device to file in the patient's chart. That copy is never sent to our servers.",
      "Then log a de-identified version here so the compliance record still exists — the event is tracked without the PHI.",
      "An employee's own date of birth or SSN on an HR or OSHA form is employment data, not patient PHI, and is fine to store.",
    ],
    doneWhen: "No completed form or incident in the app contains a patient name, DOB, MRN, or diagnosis.",
  },
  {
    slug: "my-portal", title: "My Portal", route: "/staff-portal", category: "Start here",
    what: "Each person's own compliance dashboard — their action items, training, credentials, and the policies awaiting their signature.",
    why: "Compliance is personal as well as organizational: the individual has to actually complete the training and sign the policy. This is the one page every staff member needs.",
    how: [
      "Check the three training tiles first — Completed, Pending, Overdue. Overdue is the only one that matters today.",
      "Use Read & sign on any pending policy: you must open and read the document before the signature is accepted, and the exact version you signed is stored permanently with your attestation.",
      "If a policy is later updated, it reappears here for a fresh signature and the old one is kept marked Superseded — that history is the evidence.",
      "Add your own licenses and certificates here so they are tracked before they expire; they stay private to you and the people who oversee credentials.",
    ],
    doneWhen: "No overdue training, and nothing waiting to be signed.",
  },
  {
    slug: "training", title: "Training", route: "/training", category: "Policies & Training",
    what: "Assign compliance training modules, track completion, and hold the quiz results that prove it.",
    why: "HIPAA requires workforce training and OSHA requires it for hazards staff actually face. “We told everyone” is not evidence — a dated completion record is.",
    how: [
      "FASTEST PATH: use Assign to all staff for anything everyone needs (HIPAA, harassment, bloodborne pathogens) rather than assigning one by one.",
      "Use Assign training for a single person or a role-specific module.",
      "Watch the Overdue tile — that is the number a surveyor asks about.",
      "Staff complete via Take quiz, or Attest complete for modules that are read-and-acknowledge rather than tested.",
      "Export roster (CSV) gives you the completion evidence to hand to an auditor.",
    ],
    doneWhen: "Overdue is zero and every active staff member has a dated completion for each required module.",
  },
  {
    slug: "policy-qa", title: "Policy Q&A", route: "/policy-assistant", category: "Policies & Training",
    what: "Ask plain-English questions about your own policies and get answers drawn only from your active documents and approved regulatory sources.",
    why: "The fastest way to follow a policy is to be able to ask it a question. Constraining answers to YOUR approved content is what makes it safe to rely on.",
    how: [
      "Just ask — “what is our sanction policy for a privacy violation?” or “how long do we keep records?”",
      "Answers are limited to your approved content; it will not speculate beyond your documents and sources.",
      "Use the Knowledge base panel to see how much it has to work with, and click through to add missing policies or regulatory sources.",
      "Start a New conversation per topic; earlier conversations are kept so you can return to them.",
      "If an answer is thin, the real fix is usually uploading the missing policy in SOP Library — the assistant is only as good as what you have approved.",
    ],
    doneWhen: "Common staff questions get correct answers grounded in your own documents.",
  },
  {
    slug: "employee-vault", title: "Employee Vault", route: "/employee-vault", category: "People & Roles",
    what: "Per-employee HR document storage — offer letters, I-9s, W-4s, reviews, disciplinary and medical records — with sensitive files access-restricted.",
    why: "Employment records must be retained, and some categories (medical, background checks) must be kept separate from the general personnel file. Restricting them in the app is how that separation is enforced.",
    how: [
      "FASTEST PATH: click Add document, upload the file, and let the AI read it — it fills in the document type, title, sensitivity, and even matches the employee. Review before saving.",
      "Flag anything medical, background-check, disciplinary, or termination-related as Sensitive; only owner/HR and explicitly granted users can then open it.",
      "Use Auto-fill from files to backfill type and title across documents already uploaded.",
      "Click a document title to open it; click the employee name to see that person's full compliance picture.",
    ],
    doneWhen: "Every active employee has their required HR documents on file and restricted records are correctly flagged Sensitive.",
  },
  {
    slug: "business-records", title: "Business Records", route: "/business-records", category: "Operations",
    what: "Documents the practice owns as an entity — state licenses, contracts, insurance, BAAs, leases, audits, and tax records — with renewal tracking.",
    why: "An expired business license, malpractice policy, or BAA is an operational and legal exposure that nobody owns by default. Tracking renewal dates is what prevents the surprise.",
    how: [
      "FASTEST PATH: Add record and upload the document — the AI reads it and fills in the type, dates, and identifiers for you.",
      "Watch the Renewing ≤60d and Expired tiles; those are the only two that need action.",
      "Renewal status is always derived live from the expiration date, so it can never be stale.",
      "Click a record title to open the document or edit its details.",
    ],
    doneWhen: "Expired is zero and nothing in Renewing ≤60d is unowned.",
  },
  {
    slug: "payer-enrollment", title: "Payer Enrollment", route: "/payer-enrollment", category: "Operations",
    what: "Two linked things: the practice's contracts with insurance payers, and each provider's paneling (enrollment) under those contracts.",
    why: "Being credentialed is not the same as being paneled — a provider can hold a perfect license and still not be billable under a payer. Re-credentialing deadlines are the usual cause of lost revenue.",
    how: [
      "Add contract for a payer-level agreement; Add paneling for an individual provider under it.",
      "Re-cred due / overdue is the tile that costs money — work it first.",
      "Providers are grouped by name; former staff move to their own collapsed section automatically so they stop cluttering the active list.",
      "This is deliberately separate from Credentials: Credentials is the license itself, this is permission to bill.",
    ],
    doneWhen: "No overdue re-credentialing, and every billing provider is paneled with every active payer.",
  },
  {
    slug: "competency-tracker", title: "Competency Tracker", route: "/competency-tracker", category: "People & Roles",
    what: "Skill and competency validations per staff member — who has been assessed on what, by whom, and when it expires.",
    why: "Training proves someone was taught; competency proves they can actually do it. Payers and accreditors ask for role-specific competency, especially for clinical skills.",
    how: [
      "Use the matrix to spot gaps fast — Staff with gaps and Avg coverage tell you where to look before you open anything.",
      "Add competency records the assessment, the evaluator, and the validity period.",
      "Expired status is derived live from the validity date, so the matrix is always truthful.",
      "Click a person's name to open their full record rather than searching for them elsewhere.",
    ],
    doneWhen: "No expired competencies and every clinical role is fully covered.",
  },
  {
    slug: "continuing-education", title: "Continuing Education", route: "/continuing-education", category: "People & Roles",
    what: "CE hour tracking per clinician against their license renewal cycle.",
    why: "A clinician who misses CE cannot renew their license — which takes them out of service and off payer panels. Tracking hours as they are earned avoids the scramble.",
    how: [
      "FASTEST PATH: Log CE and attach the certificate — the AI reads it and fills in the hours, date, and topic.",
      "Targets are sensible Utah defaults; verify them against the clinician's actual board rules.",
      "Staff can log their own CE from My Portal, which keeps the burden off whoever runs compliance.",
      "Click a CE entry to open or correct it.",
    ],
    doneWhen: "Every clinician is on pace for their renewal cycle with certificates attached.",
  },
  {
    slug: "regulatory-sources", title: "Regulatory Sources", route: "/regulatory-sources", category: "Oversight",
    what: "The register of rules that actually apply to your practice — federal and state regulations, guidance, and the internal policies that satisfy them.",
    why: "An OIG-style compliance program expects you to know which rules apply and to notice when they change. This is that register, plus the link from each rule to the SOP that answers it.",
    how: [
      "Work the Needs review and SOP gaps tiles — a gap means a rule with no policy behind it, which is the finding you want to avoid.",
      "Use Align to have the AI map a source to the SOPs that satisfy it and show what is missing.",
      "Use Fetch/Update to pull the current official text so you can see what changed.",
      "Click a source title to open its record; the official URL always points to the government source, not a copy.",
    ],
    doneWhen: "No SOP gaps, and nothing sitting in Needs review.",
  },


  {
    slug: "employees", title: "Employees", route: "/hr/employees", category: "People & Roles",
    what: "The staff roster — who works here, their title, department, employment status, and hire date.",
    why: "Almost every other module keys off this list. If someone is missing or still marked active after they leave, their expired licence keeps counting against you and their access is never revoked.",
    how: [
      "Add employee for anyone new — do this BEFORE inviting them to the app, so their records link up correctly.",
      "Keep employment status accurate. Marking someone Inactive is what stops their expired credentials from showing as live compliance failures across the app.",
      "Click a person's name to open their record; click Records to see everything linked to them — credentials, training, documents, competencies — in one panel.",
      "This is the directory only; pay, discipline, and reviews live in their own restricted modules.",
    ],
    doneWhen: "The roster matches who actually works here today, with departures marked Inactive.",
  },
  {
    slug: "user-management", title: "User Management", route: "/user-management", category: "People & Roles",
    what: "Who has a login, what role it grants, and who is still on the roster without an account.",
    why: "Access control is a Security Rule requirement: the right people need access and departures must lose it promptly. Role is what decides who can see payroll, discipline, or sensitive HR files.",
    how: [
      "Work the No account yet tile — those are staff who cannot use the app at all.",
      "Invite sends an email so they set their own password; you never handle their credentials.",
      "Choose the role carefully — it is the access boundary. Owner and admin see the most; staff see their own portal and shared content.",
      "When someone leaves, deactivate the account here AND mark them Inactive on the roster. Both matter.",
    ],
    doneWhen: "Everyone who needs access has it at the right role, and nobody who left still does.",
  },
  {
    slug: "settings", title: "Settings", route: "/settings", category: "Operations",
    what: "Organization profile, locations, which modules are enabled for which roles, security policy, notification timing, and storage.",
    why: "This is where the app is shaped to your practice — reminder lead times, retention periods, and who can see which module.",
    how: [
      "Organization: name, address, NPI, tax ID — these appear on exported reports and packets, so get them right once.",
      "Locations: add each physical site. Records can then be tied to a site, which matters if a manager should only see their own.",
      "Modules & Access: turn off modules you do not use and set which roles can reach each page — the fastest way to declutter the app for staff.",
      "Notifications: set how far ahead credential, training, and insurance reminders fire. Longer lead times mean fewer emergencies.",
    ],
    doneWhen: "Your details are correct, unused modules are hidden, and reminder lead times give you real warning.",
    roles: ["owner", "admin"],
  },
  {
    slug: "reports", title: "Reports", route: "/reports", category: "Oversight",
    what: "Cross-program analytics plus the exports you hand to an auditor, board, or insurer.",
    why: "When someone asks for proof, you need it in a form you can send. Generating it on demand beats assembling it under pressure.",
    how: [
      "FASTEST PATH for an audit request: Download compliance packet (PDF) — one document covering the whole program.",
      "Export CSV when someone wants to work the data themselves.",
      "Counts here exclude former staff and superseded records, so they reconcile with your compliance score rather than inflating it.",
    ],
    doneWhen: "You can produce current evidence for any area within a minute of being asked.",
  },
  {
    slug: "executive-dashboard", title: "Executive Dashboard", route: "/executive-dashboard", category: "Oversight",
    what: "The leadership view — overall compliance health, credential posture, department breakdown, and what is coming due.",
    why: "Leadership needs the trend and the exceptions, not the queue. This is the view for a board update or a partner conversation.",
    how: [
      "Start with the health score and what is affecting it — the deductions tell you exactly where the program is weak.",
      "Use the department breakdown to see which team is behind rather than chasing individuals.",
      "The credential donut and upcoming deadlines exclude renewed and former-staff records, so an item shown as expired is genuinely expired.",
    ],
    doneWhen: "The score is where you want it and no department is an outlier.",
    roles: ["owner", "admin", "clinical_leadership"],
  },
  {
    slug: "compliance-calendar", title: "Compliance Calendar", route: "/compliance-calendar", category: "Oversight",
    what: "Every dated obligation on one calendar — credential expirations, training due dates, document reviews, drills, and payer re-credentialing.",
    why: "Deadlines that live in separate modules collide without warning. Seeing them together is how you avoid a month with five renewals in it.",
    how: [
      "Scan the month for clusters — that is your early warning to start something now rather than in three weeks.",
      "Export calendar (.ics) to subscribe from Outlook, Google, or Apple Calendar so deadlines reach you where you already work.",
      "Renewed items and former staff are filtered out, so a red date is a real one.",
    ],
    doneWhen: "The calendar is subscribed in your real calendar and no month is overloaded.",
  },
  {
    slug: "risk-cases", title: "Risk Cases", route: "/risk-management", category: "Oversight",
    what: "Longer-running risks being investigated or monitored over time — not the intake point for new events.",
    why: "Some issues outlive a single incident report: a recurring pattern, a systemic gap, an insurer-driven review. Those need an owner and a status, not a closed ticket.",
    how: [
      "Report new events under Incidents — this page is for what needs ongoing management.",
      "New case for a risk that will take time; assign an owner and keep the status current.",
      "Work Critical (active) first, then Open and Investigating.",
      "Click a case title to open it.",
    ],
    doneWhen: "No critical case is unowned and nothing has gone stale without an update.",
  },
  {
    slug: "document-intake", title: "Document Intake & Migration", route: "/document-intake", category: "Operations",
    what: "Bulk-import documents — individual files, a whole folder, or a .zip — and let AI route each one to the right module.",
    why: "Most practices start with years of documents in folders. This is how they become tracked records instead of a shared drive nobody trusts.",
    how: [
      "FASTEST PATH for a migration: drop an entire folder or .zip rather than files one at a time.",
      "The AI reads each document, identifies what it is, and proposes the destination module — review the destination before filing.",
      "Un-file anything routed wrongly and send it to the right place.",
      "Do NOT drop anything containing patient PHI here — this app holds practice records only.",
    ],
    doneWhen: "Your existing documents are filed in the right modules with dates tracked.",
  },
  {
    slug: "payroll", title: "Payroll records", route: "/hr/payroll", category: "People & Roles",
    what: "A searchable archive of historical payroll records. Visible only to owners and HR.",
    why: "Wage and hour records must be retained, and you need to be able to answer a question about past pay without digging through a payroll provider.",
    how: [
      "This is an archive, not a payroll system — it holds what was already paid.",
      "FASTEST PATH to answer a question: Ask Sage — “what did we pay Jane in March?” beats scrolling.",
      "Export CSV for an accountant or an audit request.",
    ],
    doneWhen: "Historical payroll is searchable and retained for your retention period.",
    roles: ["owner", "hr"],
  },
  {
    slug: "disciplinary", title: "Disciplinary Actions", route: "/hr/disciplinary", category: "People & Roles",
    what: "Verbal and written warnings, performance improvement plans, and formal disciplinary records. HR and admin only.",
    why: "Consistent, contemporaneous, factual documentation is what defends an employment decision later. Vague or after-the-fact notes are what lose those cases.",
    how: [
      "Record it at the time — a warning documented weeks later is far weaker evidence.",
      "Write only what was observed: what happened, when, who was present, what was said, and what the employee was told to do differently. No conclusions about character or motive.",
      "Note that the employee had a chance to respond, and record their response.",
      "Track Active PIPs so follow-up dates are not missed — an unfinished PIP is worse than none.",
    ],
    doneWhen: "Every action is factual, dated, consistent with how similar issues were handled, and has its follow-up tracked.",
    roles: ["owner", "admin", "hr"],
  },
  {
    slug: "performance", title: "Performance Reviews", route: "/hr/performance", category: "People & Roles",
    what: "EOS-style reviews using GWC (Gets it / Wants it / Capacity to do it), Right-Person-Right-Seat, and quarterly Rocks.",
    why: "Regular documented review is both a management tool and supporting evidence that employment decisions were performance-based.",
    how: [
      "Score GWC honestly — a no on any of the three is the actual conversation to have.",
      "Watch Needs attention (seat): that flags someone who may be in the wrong role rather than underperforming in the right one.",
      "Set a small number of Rocks per quarter; more than three per person is a wish list, not a plan.",
      "Active PIPs here should match what is in Disciplinary Actions.",
    ],
    doneWhen: "Everyone has a current review and seat concerns are being addressed.",
    roles: ["owner", "admin", "hr"],
  },
  {
    slug: "employee-lifecycle", title: "Onboarding & Offboarding", route: "/employee-lifecycle", category: "People & Roles",
    what: "Standardized new-hire and departure checklists — access, HR documents, credentials to collect, equipment, and compliance training.",
    why: "Onboarding and offboarding are where things get missed: a credential never collected, or access never revoked. A checklist is the control.",
    how: [
      "Start checklist the day someone is hired — not their first day. Several items need to happen before they arrive.",
      "FASTEST PATH on departure: run the offboarding checklist immediately. Revoking access promptly is a Security Rule expectation and the item most often forgotten.",
      "Work it top to bottom; each completed item is dated evidence the step happened.",
      "Marking someone Inactive on the roster is part of offboarding — it stops their records counting as live failures.",
    ],
    doneWhen: "No open checklist for anyone who already started or already left.",
  },


  {
    slug: "setup-guide", title: "Setup Guide", route: "/compliance-concierge", category: "Start here",
    what: "A guided checklist that walks a brand-new practice from empty app to an operational compliance program.",
    why: "Starting from nothing is the hardest moment. This orders the work so each step builds on the last instead of leaving you guessing.",
    how: [
      "Work it top to bottom — the order is deliberate: people and locations first, because nearly everything else attaches to them.",
      "Ask the assistant here when a step is unclear; it can explain and in many cases do the step for you.",
      "You can leave and come back — progress is kept.",
    ],
    doneWhen: "Every setup step is complete and the app reflects your real practice.",
  },
  {
    slug: "role-permissions", title: "Role Permissions", route: "/access-matrix", category: "Privacy & Security",
    what: "A readable map of who can see and do what, by role, mapped to the HIPAA minimum-necessary principle.",
    why: "Minimum necessary means people should have the least access that lets them do their job. To enforce that you first have to be able to see it — and to show a surveyor you know it.",
    how: [
      "Read across a role to see everything it can reach; read down a module to see who can reach it.",
      "Use it before assigning someone a role — the matrix tells you exactly what you are granting.",
      "Change what a role can reach in Settings → Modules & Access.",
    ],
    doneWhen: "Every role grants the least access that still lets that person work.",
    roles: ["owner", "admin"],
  },
  {
    slug: "audit-trail", title: "Audit Trail", route: "/audit-trail", category: "Privacy & Security",
    what: "The per-user access log — navigation, file and record access, changes to sensitive records, exports, and failed logins.",
    why: "The Security Rule expects audit controls and periodic review of activity. This is that record, and it is what an investigation depends on.",
    how: [
      "Review Flagged and High + critical risk periodically — that is the review the rule expects, and doing it is itself evidence.",
      "Watch Failed logins for repeated attempts on one account.",
      "Filter by person or date range when investigating something specific.",
      "Export CSV to preserve evidence outside the app.",
    ],
    doneWhen: "You review flagged activity on a regular cadence and nothing unexplained is sitting there.",
    roles: ["owner", "admin"],
  },
  {
    slug: "activity-log", title: "Daily Activity Log", route: "/activity-log", category: "Oversight",
    what: "Every meaningful action by a person or by Sage, compiled by day — with AI actions reversible.",
    why: "When AI can create and change records, you need to see what it did and be able to undo it. That is what makes it safe to let it help.",
    how: [
      "Skim the day to see what changed across the whole practice.",
      "Check AI actions today, and use Undo on anything the assistant got wrong.",
      "Use it to reconstruct what happened when something looks off.",
    ],
    doneWhen: "You can account for what changed each day, including anything AI did.",
  },
  {
    slug: "backup", title: "Data Backup", route: "/backup", category: "Operations",
    what: "An offsite export of your entire compliance dataset, readable without the app.",
    why: "The Security Rule requires a data backup plan and the ability to recover. A backup you cannot read without the vendor is not a real contingency plan.",
    how: [
      "Run a backup on the reminder cadence — the tiles show your last one and whether you are current.",
      "Store the download somewhere genuinely separate — not the same laptop or the same cloud account.",
      "The export is readable on its own, so your records survive even if you stop using the app.",
    ],
    doneWhen: "A recent backup exists and is stored offsite.",
    roles: ["owner", "admin"],
  },
  {
    slug: "benefits", title: "Benefits", route: "/hr/benefits", category: "People & Roles",
    what: "Benefit plan catalog, employer contribution summary, and enrollment tracking.",
    why: "Plan documents and enrollment records must be retained, and you need to know what a plan actually costs and who is on it.",
    how: [
      "Add plan for each benefit offered, with the enrollment deadline and renewal date.",
      "Watch renewal dates — they drive open enrollment, which has a hard deadline.",
      "Monthly employer cost gives you the real number for budgeting.",
      "Click a plan name to open it.",
    ],
    doneWhen: "Every offered plan is on file with current renewal dates.",
    roles: ["owner", "admin", "hr"],
  },
  {
    slug: "medical-supplies", title: "Medical Supplies", route: "/medical-supplies", category: "Safety",
    what: "Consumable clinical supplies — gloves, syringes, gauze — tracked against par levels with lot and expiration tracking.",
    why: "Running out mid-clinic is an operational failure; using expired supplies is a patient-safety and survey issue. Par levels prevent both.",
    how: [
      "FASTEST PATH to add stock: Upload a photo — the AI identifies the product and fills in the details.",
      "Set a realistic par level per item; At/below par then becomes your reorder list.",
      "Work the Expired tile first — expired clinical supplies must come off the shelf.",
      "Record lot numbers where they matter; that is what makes a recall actionable.",
    ],
    doneWhen: "Nothing expired on the shelf and nothing sitting below par.",
  },
  {
    slug: "staff-supplies", title: "Staff Supplies", route: "/staff-supplies", category: "Operations",
    what: "Movable, lower-value office items — keyboards, mice, cables, adapters — with a location and movement history.",
    why: "Small equipment disappears without a custody record. Knowing what you have and who has it avoids re-buying it.",
    how: [
      "FASTEST PATH: Upload a photo and let the AI identify and classify the item.",
      "Record where each item lives; the movement ledger then shows who took what and when.",
      "Watch Missing — that is the reconciliation list.",
      "This is distinct from clinical Inventory (equipment and assets) and Medical Supplies (consumables).",
    ],
    doneWhen: "Items are located and nothing sits unexplained in Missing.",
  },
  {
    slug: "official-sources", title: "Official Source Library", route: "/official-sources", category: "Oversight",
    what: "A reference library of the federal and state source documents themselves — the actual regulations, guidance, and statutes.",
    why: "When a question turns on exact wording, you need the primary source, not a summary. Keeping the real text on hand is what makes your policies defensible.",
    how: [
      "Use it to read the actual rule behind a requirement rather than relying on interpretation.",
      "Mark current after you have confirmed a source is still the live version.",
      "Regulatory Sources is your register of what applies; this is the underlying text.",
    ],
    doneWhen: "The sources you rely on are present and confirmed current.",
  },
  {
    slug: "form-gap-matrix", title: "Form Gap Matrix", route: "/form-gap-matrix", category: "Policies & Training",
    what: "An audit of the forms a practice like yours should maintain against the templates you actually have — and it can generate the missing ones.",
    why: "You cannot notice a form you have never had. This names the gaps instead of leaving you to discover them during a survey.",
    how: [
      "Work the Missing tile — each is a form you are expected to have.",
      "Generate a draft from the matrix, then open Edit in Forms to review it before it goes into use.",
      "Anything generated arrives as a Draft on purpose — review the wording before staff rely on it.",
      "Remember the no-PHI rule: if a suggested form would collect patient identifiers, it belongs in the chart, not here.",
    ],
    doneWhen: "No required form is missing and no generated draft is still unreviewed.",
  },
  {
    slug: "bulk-upload", title: "Bulk Document Upload", route: "/bulk-upload", category: "Operations",
    what: "Drag in whole folders or many files at once — licences, DEA certificates, board certs, COIs — and file them together.",
    why: "Credential files usually arrive as a pile. Uploading them one at a time is the reason they never get entered.",
    how: [
      "Choose a folder or drop many files at once rather than going one by one.",
      "Review what was detected before filing; Copy manifest gives you a record of the batch.",
      "For a broader migration across many modules, use Document Intake instead.",
    ],
    doneWhen: "Your backlog of certificates is uploaded and attached to the right records.",
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
