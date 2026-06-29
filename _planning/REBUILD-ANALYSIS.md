# Compliance Hub — Clean Rebuild Analysis

Source: Base44 (Vite + React + react-router) app at
`../Compliance Original/untitled-app-c425f14a`.
Target: clean Next.js (App Router) + TypeScript + Tailwind, no Base44 SDK.

**Guiding principle:** Rebuild *intent*, not implementation. The original is buggy;
do NOT reproduce its bugs. For each page: understand the job-to-be-done, then build
it correctly with proper loading/error/empty states, validation, safe data access,
and correct date/money/permission handling.

---

## 1. Design tokens (port verbatim)

Dark-only theme, Inter font. HSL CSS variables:
- background `0 0% 7.1%` (#121212), foreground `0 0% 100%`
- card/popover `0 0% 10.2%`, secondary/muted/accent `0 0% 14.1%`
- primary `210 100% 56%` (dodger blue #1E90FF), ring same
- border/input `0 0% 26%`
- destructive `4 90% 58%`, success `122 39% 49%`, warning `45 100% 51%`
- chart-1..5: `210 100% 56%`, `122 39% 49%`, `45 100% 51%`, `4 90% 58%`, `270 50% 60%`
- radius `0.75rem`; sidebar-* tokens mirror card/blue
- custom 6px dark scrollbar

Tailwind: `darkMode: class`, extend colors from the HSL vars, `fontFamily.inter`,
radius lg/md/sm from `--radius`, accordion keyframes, `tailwindcss-animate`.

## 2. Allowed deps (open-source only; drop all @base44/*)

Radix UI primitives, @tanstack/react-query, lucide-react, recharts, date-fns,
react-hook-form + zod + @hookform/resolvers, class-variance-authority, clsx,
tailwind-merge, sonner (toasts), cmdk, next-themes. Drop: @base44/sdk,
@base44/vite-plugin, stripe (unless billing needed), three/leaflet/quill unless a
page truly needs them. shadcn/ui primitives are MIT — regenerate cleanly.

## 3. Architecture seam (the key decision)

Put ALL reads/writes behind a `DataClient` interface. Generate TS types + Zod
schemas from the 65 entities. Ship a **mock/seed** implementation now so the whole
UI is buildable; swap a real backend later without touching pages.
- AI features (PolicyAssistant, DocumentIntake, DocumentMigration, Concierge) go
  behind an `AIClient` seam returning typed, Zod-validated structured output. Mock
  now (deterministic canned responses), real LLM later (use latest Claude model).
- PHI-adjacent data (HIPAA incidents, credentials, payroll, medical docs): the
  real backend MUST be BAA-covered / HIPAA-eligible, encryption at rest, audit
  logging, row-level security. Flag as a real decision; does not block UI build.

## 4. Auth / roles / permissions

Status state machine: `loading | unauthenticated | no_profile | ready | error`.
- loading → spinner; unauthenticated/error → Landing; no_profile → Onboarding;
  ready → app shell.
- `User` (auth): `{ id, full_name, email, role: 'admin'|'user' }`
- `ComplianceUserProfile`: userId, fullName, email, **accountRole**, staffRole,
  professionalRole, department, primaryLocationId, additionalLocationIds[], active,
  twoFactorEnabled, lastLoginAt.
- Roles: owner, admin, hr, clinical_leadership, manager, staff, contractor,
  read_only, inactive.
- **FIX (cross-cutting):** original mixes `user.role` and `userProfile.accountRole`
  inconsistently. Pick ONE source of truth → `accountRole`. Compute
  `isAdmin = accountRole ∈ {owner, admin, hr, clinical_leadership}`. Guard for
  undefined profile. Enforce permissions at the data layer, not just UI hiding.
- Permission flags (table by role): canManageUsers, canManageDocuments,
  canViewAllSOPs, canView/ManageHRFiles, canView/ManageEmployeeContracts,
  canView/ManageCredentialing, canView/ManageInsurance, canView/ManageOSHA,
  canView/ManageSDS, canUseChatbot, canViewAuditLogs, canManageRisk.

## 5. Navigation (grouped sidebar) — verbatim structure

Collapsible sidebar, fixed footer (user card + logout, "Open LP Alert" external).
Admin-only groups hidden when `!isAdmin`; items have per-item `adminOnly`.

- **My Workspace** (all users): My Portal `/staff-portal` (UserCircle),
  SOP Assistant `/policy-assistant` (MessageSquare), Time Clock `/hr/timeclock`
  (Clock), Time Off `/hr/time-off` (Umbrella)
- **Overview**: Command Center `/` (LayoutDashboard),
  ✨ Setup Concierge `/compliance-concierge` (Sparkles, gradient highlight, admin),
  Executive Dashboard `/executive-dashboard` (TrendingUp, admin),
  Compliance Calendar `/compliance-calendar` (CalendarDays, admin),
  Reports `/reports` (TrendingUp, admin)
- **Documents & Forms** (admin): SOP Library `/sop-library` (FileText),
  SOP Assistant `/policy-assistant` (MessageSquare),
  Fillable Forms `/fillable-documents` (Layers),
  Form Gap Matrix `/form-gap-matrix` (ClipboardCheck),
  Doc Intake AI `/document-intake` (Inbox),
  Doc Migration `/document-migration` (FolderLock),
  Policy Attestation `/policy-attestation` (CheckCircle2)
- **Training & Credentials** (admin): Training Academy `/training-academy`
  (GraduationCap), Training Center `/training` (GraduationCap),
  Credentials `/credentials` (BadgeCheck),
  Competency Tracker `/competency-tracker` (Award)
- **Compliance & Safety** (admin): OSHA Tracker `/osha-tracker` (ClipboardCheck),
  Controlled Substances `/controlled-substances` (FlaskConical),
  Inventory `/inventory` (Package), HIPAA & Risk `/risk-management` (ShieldAlert),
  SDS Library `/sds-library` (FlaskConical),
  Emergency Prep `/emergency-preparedness` (AlertTriangle),
  Insurance Vault `/insurance-vault` (Shield),
  Vendor Management `/vendor-management` (Building2)
- **Admin & Resources** (admin, collapsed default): Official Sources
  `/official-sources` (BookOpen), Regulatory Sources `/regulatory-sources`
  (BookOpen), Audit Trail `/audit-trail` (Shield),
  User Management `/user-management` (Users), Settings `/settings` (Building2)
- **HR & Payroll** (visible if any item visible): HR Hub `/hr-hub` (Users, admin),
  Employees `/hr/employees` (Users, admin), Payroll `/hr/payroll` (DollarSign,
  admin), Time Clock `/hr/timeclock` (Clock), Time Off `/hr/time-off` (CalendarDays),
  Performance `/hr/performance` (Star, admin), Benefits `/hr/benefits` (Heart,
  admin), Disciplinary `/hr/disciplinary` (AlertTriangle, admin)

Plus non-nav routes: `/dashboard`, `/sds-library`, `/employee-vault`,
`/insurance-vault`, `/fillable-forms`, `/audit-trail`, `/official-source-library`,
`/compliance-qa-report`. Landing + Onboarding + 404 outside the shell.

## 6. Cross-cutting bug principles (apply everywhere)

1. **Dates:** never `String.split('T')[0]` or raw `new Date(str)-new Date()` math.
   Use date-fns (`differenceInDays`, `isPast`, `format`) with null guards. Treat
   date-only inputs as UTC (`'T00:00:00Z'`) to avoid TZ off-by-one.
2. **Money:** store integer cents; never sum floats. Validate ≥ 0, net ≤ gross.
3. **Expiration status:** compute from `expirationDate` (derive active/expiring/
   expired), don't trust a stale stored status enum.
4. **Safe access:** guard every `.map`/property on possibly-undefined query data;
   default arrays; show empty states.
5. **States:** every data view needs loading (skeleton), error (with retry), and
   empty states. Every mutation needs error toast + disabled/pending UI.
6. **Validation:** Zod on all forms; required fields, date order, email format,
   number ranges, cross-field rules (e.g. PTO ≤ balance, follow-up ≥ issued).
7. **Referential integrity:** reference employees by ID + lookup name, never store
   free-text names as the key (Payroll, EmployeeVault, TimeOff).
8. **Atomicity:** multi-write flows (acknowledge→vault copy, mark-review→task,
   employee→invite) need transaction/rollback or clear failure handling.
9. **No hardcoded business data:** locations, facility name, labor laws, OSHA/DEA
   dates, review thresholds come from data/config, not literals.
10. **Audit trail:** log writes for users/roles/payroll/reviews/discipline/settings.
11. **Query invalidation:** invalidate precisely, not shotgun-invalidate everything.
12. **A11y:** aria-labels on icon buttons, dialog focus management, not color-only.

## 7. AI seams (design clean, mock first)

- **PolicyAssistant** `/policy-assistant`: Q&A constrained to approved sources
  (RegulatorySource + active ComplianceDocument). Returns `{answer, citations[],
  sourcesCovered, suggestTraining}`. Validate output; handle errors; persist chat.
- **DocumentIntake** `/document-intake`: classify pasted/uploaded doc →
  `{title, documentType, complianceArea, accessLevel, category, summary, tags[],
  requiresAcknowledgment, requiresTraining, placement}`. Editable review step;
  whitelist editable fields; retry on AI error.
- **DocumentMigration** `/document-migration`: classify + suggestedDestination;
  HR labels (active/draft/duplicate/superseded) → approve imports to SOP/Form/
  Training. Validate destination↔file requirement; per-destination handlers.
- **ComplianceConcierge** `/compliance-concierge`: guided setup chat that creates
  entities + checklist progress. Persist conversation server-side (not per-tab
  sessionStorage); batch creates with rollback; granular progress.

## 8. Per-page intent + top fixes (44 routes)

### Overview / Command
- **CommandCenter `/`** — single-pane triage: compliance score, action queues,
  incident wizards, quick actions. FIX: dynamic locations (actually filter data);
  correct score formula incl. already-expired creds; loading/error states; null
  guards; one wizard-state machine.
- **ExecutiveDashboard `/executive-dashboard`** — exec KPIs, trends, dept
  compliance. FIX: real historical trend data (not hardcoded months/weeks);
  multi-factor dept compliance (creds+training+acks, not just tasks); live 30-day
  window; wire Export/Audit-prep actions; chart a11y.
- **Dashboard `/dashboard`** — role-adaptive daily view. FIX: split admin vs staff
  layouts; safe date formatting; centralized route + color logic; safe insurance
  renewal math.
- **ComplianceCalendar `/compliance-calendar`** — month calendar of deadlines from
  5 sources + recurring OSHA/DEA. FIX: correct month-end date math
  (`new Date(y, m+1, 0)`); config-driven OSHA/DEA dates per facility; useMemo;
  legend filtering; richer event detail.
- **Reports `/reports`** — analytics tabs + CSV export. FIX: validate context/
  access; server-side filtering/pagination (no 500 cap); TZ-correct month trend;
  error boundaries per chart; data-freshness indicator.
- **ReportGenerator `/reports` (alt)** — custom report builder. FIX: actually apply
  date range; implement hr-compliance type; synchronous (not fake async);
  timestamped filenames; validate date range.
- **ComplianceConcierge** — see AI seams.
- **ComplianceQAReport `/compliance-qa-report`** — internal QA/meta page. FIX:
  error handling on function invoke + Promise.all; derive status from real data
  not hardcoded text; refresh.

### Documents & Forms
- **SOPLibrary `/sop-library`** — document repository w/ versions, review dates,
  access. FIX: upload try/catch + disable save on fail; trust type metadata not URL
  string; atomic bulk upload; loading states; tag validation; safe review-date calc.
- **PolicyAssistant** — see AI seams. Plus: URL allowlist for citations; token/
  context bounds; rate limit; message skeletons.
- **FillableDocuments `/fillable-documents`** — template fill → PDF. FIX: implement
  PDF generation (jsPDF) not alert; dynamic field schema from template; validate
  required; upload error handling + success confirmation.
- **FillableForms `/fillable-forms`** — forms library, packets, assignments,
  official sources. FIX: ID-based merge (not name match); seed w/ progress+errors;
  category mapping in data file; empty states; live stats.
- **FormGapMatrix `/form-gap-matrix`** — policy↔required-form gap audit + AI drafts.
  FIX: explicit policy↔form mapping (no substring match); mutation error handling;
  parallel generate w/ progress; template-specific draft fields; HR approval step.
- **DocumentIntake** — see AI seams.
- **DocumentMigration** — see AI seams.
- **PolicyAttestation `/policy-attestation`** — e-sign acknowledgments + vault copy.
  FIX: capture real IP server-side; atomic ack+vault write w/ rollback; correct
  annual-renewal date; mark prior ack expired; admin filtering/pagination;
  accessLevel field not hardcoded heuristics.

### Training & Credentials
- **TrainingAcademy `/training-academy`** — modules, quiz builder, assignments,
  attempts. FIX: real user id (not 'current-user'); persist attempt score/%;
  require exactly one correct answer; count unique assignments passed; loading/a11y.
- **Training `/training`** — simpler assign/complete. FIX: single role source;
  safe date parse; mutation error toasts; empty-state CTA.
- **Credentials `/credentials`** — license/cert expiration tracking. FIX: upload
  try/catch; date-fns formatting (no split); derive expiring/expired from date;
  validate expiration ≥ issue; upload pending state.
- **CompetencyTracker `/competency-tracker`** — competency/skills validation. FIX:
  differenceInDays; auto-expire status from validUntil; consistent date formatting;
  validate validUntil ≥ assessmentDate; dup warning.

### Compliance & Safety
- **OSHATracker `/osha-tracker`** — OSHA records (injury/illness/hazcom/etc.). FIX:
  null-safe dates; recordability editable in form; document upload; result count;
  link the warning banner to references.
- **ControlledSubstances `/controlled-substances`** — DEA logs/inventory/disposal/
  spill. FIX: add Form 106 deadline tracking/alerts (banner says 1 business day but
  no tracking); keep delegated panel but reinforce deadlines.
- **Inventory `/inventory`** — assets across locations w/ movement log, AI import,
  CSV. FIX: log movement on create too; pass old+new to mutation (no stale state);
  removed_at/reason fields; refetch after mutation; clearer action semantics.
- **RiskManagement `/risk-management`** — HIPAA/risk cases w/ severity + access.
  FIX: preserve readonly fields in edit; required severity; actually enforce/show
  accessLevel; useMemo filters; handle missing context.
- **SDSLibrary `/sds-library`** — Safety Data Sheets, barcode/PDF import, chatbot.
  FIX: mutation error toasts; labeled UPC/ID; signal-word color map w/ fallback;
  productName required everywhere; close detail modal on delete; a11y search.
- **EmergencyPreparedness `/emergency-preparedness`** — OSHA drills. FIX: the edit
  Dialog is MISSING — add it; isPast for overdue; score input in form; validate
  participant counts; server "today".
- **InsuranceVault `/insurance-vault`** — policies, renewals, core-6 pinned. FIX:
  remove `|| true` that disables empty state; date-fns (no split); normalize day
  for renewal math; validate amounts as positive numbers; configurable reminder days.
- **VendorManagement `/vendor-management`** — vendors, BAAs, PHI, insurance exp.
  FIX: keep baaRequired in sync with type AND PHI (both directions); count BAA-
  needed only when baaStatus set and ≠ signed; validate dates; BAA/insurance file
  upload; a11y for status icons.

### HR & Portal
- **HRHub `/hr-hub`** — HR ops hub + tabs. FIX: single employment-status source;
  TZ-safe date compares; tab loading states; validate add-employee + atomic invite;
  don't over-fetch data non-admins can't see; finish/disable placeholder onboarding
  steps; consistent date formatting.
- **EmployeeDirectory `/hr/employees`** — searchable roster. FIX: optional-chain pay
  display; validate/normalize pay (cents); guard role check for undefined profile;
  unique-email check; show employment-type default; restrict admin-only fields;
  null-safe name search.
- **Payroll `/hr/payroll`** — payroll records + status flow. FIX (critical): compute
  gross from hours×rate (OT ×1.5) or validate; validate period start<end and
  net≤gross; integer cents; void/reverse workflow for paid; employee by ID; TZ-safe
  period dates.
- **TimeOff `/hr/time-off`** — requests + PTO balances. FIX (critical): enforce
  balance (show available, block over-request); validate date range + future; UTC
  date handling; overlap detection; show review notes; store reviewer ID; selectable
  balance year; apply carry-over.
- **PerformanceReviews `/hr/performance`** — EOS reviews (GWC, Rocks). FIX: pick ONE
  GWC schema; robust "needs attention" calc; validate rock structure; review-type
  options from data; validate scheduledDate; warn on incomplete GWC; explicit status
  machine; audit changes.
- **Benefits `/hr/benefits`** — plan definitions + costs. FIX: validate contributions
  ≥0; distinguish 0 vs unspecified cost; strict active boolean; structured
  eligibility rules; enrollment lifecycle; typed contacts; expiration actionable.
- **Disciplinary `/hr/disciplinary`** — actions + audit trail. FIX: structured PIP
  (phases/goals/check-ins) or link to reviews; acknowledgement + legal-review fields;
  clarify reason(category) vs description(narrative); witnesses as array; validate
  followUp ≥ issued; define escalation; require resolution note; termination linkage.
- **TimeClock `/hr/timeclock`** — clock in/out + geo/IP + admin edit. FIX (critical):
  server-side duration + server timestamps (UTC); geo/IP best-effort with timeout,
  don't block; enforce geofence only if required; prevent duplicate active entries;
  validate edited in<out; store original times + edit reason + editor + timestamp;
  configurable reporting period; PTO interaction policy.
- **StaffPortal `/staff-portal`** — employee self-service. FIX: server-computed next-
  due for recurring training (persist, notify); check module active; server time;
  labor laws from DB (drop hardcoded); role/department-filtered training + SOPs;
  handle multiple balances; robust initials fallback.
- **EmployeeVault `/employee-vault`** — secure HR doc storage. FIX: employee by ID
  (not 'manual'/free text); enforce accessLevel server-side (RLS); encrypt + audit
  access for sensitive/medical (HIPAA); file-type + size validation; versioning;
  retention policy; stable download endpoint not raw URL.

### Admin / Resources / Auth
- **OfficialSourceLibrary `/official-sources`** — curated regulatory library (table).
  FIX: hide Add for non-admins; separate reviewedAt from updatedAt; guard deleted
  selection; configurable overdue threshold; real links to linked policies/training;
  bulk actions; optimistic w/ rollback; CSV export.
- **RegulatorySourceLibrary `/regulatory-sources`** — same data, card UX + mark-
  review→task. FIX: atomic source-update+task-create; single role source; configurable
  due offset; add applicableRoles input (currently dropped); live editForm sync; link
  manager UI; search includes roles.
- **AuditTrail `/audit-trail`** — HIPAA audit log viewer + CSV. FIX: server-side
  pagination/filtering (drop 500 cap); redact IPs; TZ label; action types from enum;
  make flag/review actionable (review dialog); validate failed_login reason.
- **UserManagement `/user-management`** — users, roles, invites. FIX: consolidate to
  one role system (accountRole, sync auth); validate email; validate all fields;
  cascade/guard orphan profiles; audit role changes; deactivation reason+date;
  persistent invite toast; owner-only system-role edit; bulk edit.
- **Settings `/settings`** — org config tabs. FIX: single form state + clear per-tab
  save feedback; re-sync on mutation; validate numbers (retention≥1, timeout≥5) and
  URLs; required location address; granular perms; rollback + error toast; dismissible
  success.
- **LandingPage** — public marketing/sign-in. FIX: differentiate Sign In vs Request
  Access; real auth route(s); app name from config; auth error feedback.
- **Onboarding** — profile creation (3 steps). FIX: guard if profile exists; required
  onComplete; disable nav during save; show email early; retry on error; dropdowns
  from config; validate text fields.
- **UserNotRegisteredError** — logged-in-but-no-profile. FIX: dark theme; add logout;
  admin contact from settings; explain reason; refresh-to-retry.
- **AppLayout** — shell: sidebar + content (`lg:ml-72`), gradient bg, providers
  (QueryClient, Auth, Toaster), outlet context (user, userProfile). In Next: root
  authed `layout.tsx` with providers + Sidebar; pass auth via context.

## 9. Entities (65)

Full field-level digest persisted separately (tool-results JSON). Domains:
Core/Users (User, ComplianceUserProfile, OrganizationSettings, WorkLocation,
ClinicLocation, AuditLog/ComplianceAuditLog, SetupChecklistItem), Documents
(ComplianceDocument, DocumentVersion, FillableFormTemplate, FormAssignment,
CompletedForm, FormSourceCitation, PolicyAcknowledgment, EmployeeDocument),
Training (TrainingModule, TrainingAssignment, TrainingQuestion, TrainingAttempt,
CompetencyRecord), Credentials (CredentialRecord), Safety (OSHARecord, SDSRecord,
EmergencyDrill, RiskManagementCase, ComplianceEvidenceItem, SafetyMeeting),
Controlled substances + Inventory (InventoryItem, InventoryMovement,
InventoryImportDraft, controlled-substance logs), Insurance/Vendor
(InsurancePolicyRecord, VendorRecord), HR (Employee, PayrollRecord, TimeOffRequest,
PTOBalance, TimeClockEntry, PerformanceReview, OnboardingChecklist,
DisciplinaryAction, Benefit, BenefitLink), Regulatory (RegulatorySource,
ReportSnapshot), Chat (ChatConversation, ChatMessage), AutomationRule.
Generate TS + Zod for each with enums verbatim; required fields enforced.
