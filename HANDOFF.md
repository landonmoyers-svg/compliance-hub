# Compliance Hub — Handoff (start here)

**Last updated:** 2026-09-15 · **Written for:** any Claude chat (local or cloud) picking this project up cold.
**Contains no secrets.** Credentials, API keys and passwords are never written here — Landon enters those himself.

If you read only one section, read **§0**. Everything else is reference.

---

## 0. The 60-second version

**What this is.** Compliance Hub is a Next.js + Supabase app that runs the compliance program for **Lone Peak Psychiatry** (owner: Landon Moyers). It is also being prepared to sell to other practices (multi-tenant).

**Where the real current code is — read this carefully.**

| | Commit | State |
|---|---|---|
| `main` on GitHub | `0d8d1ca` (2026-08-23) | **This is what is live in production.** |
| `feature/external-training-mineral` | 7+ commits ahead of `main` | **All work since 2026-09-01 lives here. Not merged. Not deployed.** |

Commits on the feature branch, oldest first: `f0f36bc` external training (Mineral) · `63b9dab` fixes to it · `4d13cc9` employment-law register · `57dda39` `npm run typecheck` script · `06298ee` regulatory change feed · `db0963f` med samples · `8689ad7` usage-pace engine for medical supplies · `030828d` this handoff · `52d69dd` multi-tenancy migrations captured into the repo · `754a7da` supplies lot-level expiry, use-first and ordering. The branch is pushed to GitHub (it existed only on one Mac until 2026-09-15).

**The production database is ahead of production code.** These migrations are applied to prod, but the code that uses them is only on the feature branch: `external_training_and_verification`, `training_certificate_can_view_object`, `law_obligations`, `seed_law_obligations`, `law_alerts`, `med_samples_module`, `med_samples_can_view_object`, `medical_supply_logs_occurred_at`, `medical_supply_lots_and_ordering`. All are additive, so production is not broken — but do not assume `main` reflects the schema.

**Pending decision (Landon's):** merge the whole feature branch into `main`, or cherry-pick only some. Do not merge it without asking.

**Nothing is half-built right now.** The most recent feature (supplies expiry + ordering) is finished and committed — see **§8**, including the one thing not yet verified (the page rendered in a browser).

**Verify what's live** at any time: `https://compliance-hub-lone-peak.vercel.app/api/version` returns the deployed git SHA.

---

## 1. The practice and the product

- **Practice:** Lone Peak Psychiatry, Utah. Owner and platform admin: Landon (`landon@lonepeakpsychiatry.com`).
- **Sites (the `locations` table):** Lehi Clinic · Murray Clinic 1 · Murray Clinic 2 · Murray Admin Building.
- **Canonical URL:** `https://compliance-hub-lone-peak.vercel.app` (all `.vercel.app` aliases serve the same build; Vercel Deployment Protection is intentionally OFF — the app has its own login).
- **Staff already use Jane.app** for clinical work, so the Hub's UI deliberately mirrors Jane's design language.

### The product bar (Landon's words, applies to all work)
> "Every feature and page should feel like a breath of fresh air to navigate. It should almost feel like magic how easy it is to complete tasks and knock things out and get things in compliance."

In practice: prefill from known data, guide inline, catch mistakes before they matter, make the next action obvious. Don't ship merely-functional UI.

### The hard boundary: NO PATIENT PHI
The app stores the practice's **own** employee, HR and business records only. There are **no BAAs** with Vercel, Supabase or Anthropic, so patient PHI must never be stored. This is enforced, not just documented:
- `PhiNotice` component on document/intake surfaces.
- A pre-save checkpoint on incident reports and patient-touching forms asks *"Does this contain patient information?"* — *yes* blocks the save and generates a local in-browser copy for the chart instead.
- When importing anything clinical (e.g. the ketamine audit), import **de-identified findings** and leave patient-level source files outside the app. Jane/Athena patient numbers tied to dates count as identifiers.

---

## 2. Stack, environments, commands

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 · Supabase (Postgres + Auth + Storage) · Vercel · Anthropic API.
**Next.js 16 has breaking changes.** `AGENTS.md` says: read `node_modules/next/dist/docs/` before writing Next code. Middleware is `src/proxy.ts`.

| Thing | Value |
|---|---|
| Repo | `git@github.com:landonmoyers-svg/compliance-hub.git` |
| Deploy | Push to `main` → Vercel auto-deploys production. Team `lone-peak`, project `compliance-hub`. |
| Prod Supabase | project ref `gkrhxfthvqprmnztoxxw` |
| Staging Supabase | `noptrlztqiwpdhoxhcyo` — usually **paused** to save cost; restore with Supabase MCP `restore_project` |
| Supabase MCP (local sessions) | Use the authenticated server `b618894b-1b5d-4f98-8821-302887e3b793`. The connector literally named `supabase` is unauthenticated. |
| Local dev | `npm run dev` points at **staging** (`.env.development.local` overrides `.env.local`). If staging is paused, login fails with `ERR_NAME_NOT_RESOLVED` — that's a sleeping DB, not a password problem. |

**Commands**
- `npm run typecheck` — use this, not raw `tsc`. It skips the stray `.next/types/* 2.ts` duplicate files macOS keeps creating.
- `npm run build`
- `npm run test:unit` — 78 tests over usage pace, lot expiry, FEFO and ordering maths. (`tsx` is a devDependency as of 2026-09-15; before that this script silently did nothing.)
- `npm run test:e2e` — Playwright.

**Env var names** (values live in Vercel, never in git): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `SAM_API_KEY`, `AI_DAILY_CAP` (optional), `NEXT_PUBLIC_APP_URL`.

**Deploy fallback** if the GitHub→Vercel webhook stalls: `npx vercel deploy --prod --yes --scope lone-peak` from the repo. Never stack deploys; wait for one to finish.

---

## 3. Architecture you must understand before changing anything

### 3.1 The data seam (adding a field touches ALL of these)
1. `src/lib/data/schema.ts` — Zod entity + inferred type
2. `src/lib/data/client.ts` — the `Collections` interface
3. `src/lib/data/supabase-client.ts` — **both** `<x>From` (row → app) and `<x>To` (app → row) mappers, plus the `makeCollection(supabase, "table", from, to)` binding
4. `src/lib/data/mock-client.ts` + `src/lib/data/seed.ts`
5. The DB migration

Pages use `useCollection` / `useCreate` / `useUpdate` / `useRemove` from `src/lib/data/hooks`.

### 3.2 Multi-tenancy (shipped 2026-08-22/23)
- Shared database, one deployment. `organizations` + `org_memberships` (**role lives on the membership, per org** — being an admin at one practice grants nothing at another) + `org_member_locations` (site scoping).
- **Every table has `org_id`**, stamped by a `trg_set_org_id` BEFORE INSERT trigger that derives it from the caller's single active membership.
- **RLS pattern on every table:** `org_id IN (SELECT my_org_ids())` → `can_see_location(org_id, location_id)` (tables with a location) → a role helper evaluated for *that* org, e.g. `is_privileged(org_id)`, `is_writer(org_id)`, `owner_or_admin(org_id)`, `hr_admin_or_owner(org_id)`, `owner_or_hr(org_id)`, `clinical_admin_or_owner(org_id)`, `can_view_sensitive_docs(org_id)`.
- `profiles.platform_admin` (Landon only) gates **Settings → Organization → Companies**, which creates a new tenant and invites its owner (`/api/admin/create-organization`).
- Storage: one private bucket `documents`. Files are served only via `/api/storage/sign`, which authorises through `can_view_object(path)` — a list of table/column pairs that may reference a file.
- Not yet built: starter-content seeding for a new tenant (a new company starts empty), an org switcher, per-org notification scan.

### 3.3 Access tiers
Broadly readable by staff (SOPs, regulatory sources, training modules, directory) · own-or-privileged (credentials, insurance, training assignments) · privileged-only (payroll, disciplinary, incidents, audits, controlled substances, audit logs). Special-category employee documents (medical, background check, I-9, W-4) are restricted to owner/admin/HR. **AI routes run as the requesting user** (never service-role), so AI cannot see more than the user can.

### 3.4 Navigation and shell
`src/lib/nav.ts` — 10 groups, each with a `shortLabel` for the top bar: Overview · My Work · Training · Documents · Risk · Safety · Medical Inventory · General Inventory · HR · Admin. (Inventory was split out of Safety into its own two tabs on 2026-09-15, on the feature branch; `main` still has 8.) The Jane-style shell is `src/components/layout/jane-topbar.tsx` + `jane-sidebar.tsx`, both driven by `src/lib/use-resolved-nav.ts`. Visibility = role access ∩ org-enabled modules ∩ industry, then personal ordering. The owner can never be locked out.

### 3.5 AI
Most features use Haiku (`claude-haiku-4-5-20251001`); per-user daily cap via `enforceAiCap` (`src/lib/ai/usage.ts`). AI identify prompts are written to **refuse to invent** lot numbers, NDCs, expiry dates or licence numbers that aren't legible — a plausible invented identifier is worse than a blank.

### 3.6 The Guide (`/guide`)
`src/lib/guide/features.ts` (58 per-page lessons on the feature branch — every nav page has one; written from the actual UI) and `src/lib/guide/playbooks.ts` (17 step-by-step walkthroughs, incl. "Your first week as a new practice" for tenant #2). **Update the relevant lesson when you change a page** — a lesson describing controls that no longer exist is worse than none. Check coverage with: every `href` in `nav.ts` should appear as a `route` in `features.ts`.

### 3.7 Usage pace engine (`src/lib/usage-pace.ts`)
Shared by Medical Supplies and Med Samples so "days left" means the same everywhere. Weekly buckets with a 4-week half-life (recency weighting); runway planned against `weighted mean + k × standard error`, where k shrinks as evidence grows (1.5 → 0.8 → 0.35). Returns "learning" rather than a number when there's too little history. Adapters: `src/lib/medical-supplies.ts` (counts `used`), `src/lib/med-samples.ts` (counts `dispensed`).

### 3.8 Lot-level stock (`src/lib/stock-lots.ts`)
Medical supplies keep stock in `medical_supply_lots`; a DB trigger syncs the product row's on-hand, lot and soonest expiry. The library does first-expired-first-out allocation (never draws expired lots), projects waste lot by lot at the measured pace, learns shelf life from past deliveries, and sizes orders (`recommendOrder`). `supplyStock()` in `medical-supplies.ts` bundles lots + pace + expiry plan + runway + order advice per item — the page reads only that.

---

## 4. Rules and gotchas — each one cost real time

**Data layer**
1. **From/To mapper parity is the #1 silent production bug.** A field in `From` but missing from `To` works in the mock and is silently dropped on every real save. After adding a field, count its snake_case name in `supabase-client.ts` — it must appear in both directions.
2. **Adding a `.default(...)` Zod field makes it REQUIRED on the inferred type** and breaks every existing place that constructs that entity literal (seed, AI assistant, document intake, setup guide).
3. **Every new table needs, in the same migration:** `org_id`, RLS enabled, policies in the pattern above, the `trg_set_org_id` trigger, and `grant … to authenticated` **and** `grant all … to service_role`. MCP-created tables do not auto-grant.
4. **Any function used in an RLS policy must be `grant execute … to authenticated`**, or every read fails with 42501.
5. **MCP `execute_sql` runs as service-role, where the org trigger does NOT fire** — set `org_id` explicitly or the row is invisible under RLS.
6. **Any new column that stores a file path needs a clause in `can_view_object`**, or the file is unviewable by anyone but the uploader.
7. **Records can exist and display nowhere.** e.g. `corrective_actions` only render on `/incidents` when linked by `incidentId`. Check the page's filter before creating rows.
8. Date inputs: seed with `(value ?? "").slice(0, 10)`. When writing a date into a `timestamptz`, use midday (`T12:00:00`) or it renders as the previous day in Mountain Time.
9. Superseded credentials/insurance and former employees must be filtered on **every** surface that shows expiring items (`supersededCredentialIds`, `holderIsActive`).
10. `employees.id` ≠ auth user id. `PersonLink`'s `userId` must be an auth id.
11. `src/lib/auth/context.tsx` maps the profile row **by hand** — a new profile column must be added there too.

**Testing**
12. **An UPDATE filtered out by RLS affects 0 rows and raises no error.** Assert with `get diagnostics n = row_count`, never just `exception when others`.
13. RLS test pattern: in a `DO $$` block, `set_config('request.jwt.claims', json_build_object('sub', uid, 'role','authenticated')::text, true)`, `set local role authenticated`, run queries, then `raise exception` with the results so everything rolls back.
14. Uniform synthetic data has zero variance — it silently tests nothing about margins or confidence. Use noisy series.
15. Postgres has no `min(uuid)`.

**Tooling / environment**
16. Stale 0-byte `.git/index.lock` / `.git/HEAD.lock` recur in this repo. Check `pgrep -x git` first; if nothing is running, remove them.
17. Paths containing parentheses (Next route groups like `app/(app)/`) trigger a manual approval on every write. Don't use route groups.
18. Turbopack rejects a symlinked `node_modules` in a worktree ("points out of the filesystem root") — hardlink-copy with `cp -al` instead.
19. The SAM.gov exclusions API blocks server/cloud IPs. SAM is a manual per-match check by design; OIG-LEIE screening is fully automated.
20. Landon sometimes works from a **Chromebook**: localhost URLs and file downloads on the Mac never reach him. Share previews as Artifacts.

**Safety (non-negotiable)**
21. Never type passwords, API keys or secrets. Landon enters them.
22. Never `git reset --hard` in this repo. Verify the branch before any git write; stage specific paths.
23. Never delete Landon's files (the Downloads folder is shared with his own downloads).
24. Don't bypass a safety-classifier denial with another tool — ask.
25. HomeVault is a separate product with its own repo (`landonmoyers-svg/homevault`) since 2026-09-06. Don't touch it from here.

**Added 2026-09-15**
26. **Every migration applied through the MCP must also be saved in `supabase/migrations/`.** Thirteen lived only in production until 2026-09-15 — including all of multi-tenancy. Name files so they sort in apply order (e.g. `0017a…` before `0018`), and verify the body by hash against `supabase_migrations.schema_migrations`.
27. **Expiry is a calendar-day concept.** Compare dates, not timestamps — comparing expiry-at-midnight with "now" marked items expired on their last good day.
28. **Confirm a new npm script actually executes.** `test:unit` failed silently for a week because its runner wasn't installed.
29. **Push work branches to GitHub** as a backup. Seven commits once existed on a single Mac.

---

## 5. Module inventory

58 pages. Grouped as they appear in the nav.

- **Overview:** Home (command center, score, queues) · Your Guide · Daily Priorities (Chief of Staff agent) · Compliance Calendar (.ics export) · Setup Guide (concierge)
- **My Work:** My Portal (staff self-service: training, attestations, own credentials) · Policy Q&A (answers grounded in the org's own documents)
- **Training:** Training (assign, quiz, attest; **external/Mineral courses** on the feature branch) · Credentials (with role-based requirements engine) · Continuing Education · Payer Enrollment (contracts + paneling) · Competency Tracker
- **Documents:** SOP Library · Regulatory Sources (45 federal + Utah) · Forms (177 templates, completion guidance, AI prefill, AI "Review answers" coach) · Missing Forms · Policy Attestation · Document Intake · Bulk Upload · **Employment Law** (feature branch)
- **Risk:** Incidents & Corrective Actions · Security Risk Assessment · Audits & Mock Surveys · Exclusion Screening · Vendor Management · Insurance Vault · Business Records · Risk Cases · Breach Assessments
- **Safety:** OSHA Tracker (generates 300/300A/301) · SDS Library · Emergency Prep
- **Medical Inventory** (own tab, feature branch): Medical Supplies (lots, expiry, use-first, ordering) · **Med Samples** · Controlled Substances (bottle custody)
- **General Inventory** (own tab, feature branch): Inventory (assets; Utah PPT worksheet) · Staff Supplies
- **HR:** Employees · Onboarding & Offboarding · Employee Vault · Org Chart · Payroll · Performance · Benefits · Disciplinary
- **Admin:** User Management · Role Permissions · Settings (incl. Companies for the platform admin) · Audit Trail (7-year retention) · Daily Activity Log (AI undo) · Data Backup

---

## 6. Timeline — what was done

Earlier history (June–August) is summarised; recent work is detailed.

- **Jun–Jul 2026** — Rebuilt from a Base44 Vite app into clean Next.js (intent-faithful, not a line-by-line port). Built out the modules above. Access-control hardening, audit logging, AI cost controls.
- **2026-08-04/05** — Full nine-dimension audit (`AUDIT_REPORT.md`), fixes validated on staging, **production rollout** (deploy `024e0c5`), follow-up fix phase (accessibility, audit integrity, sensitive-doc access).
- **2026-08-16 → 22** — QA defect fixes; form completion guidance + AI prefill + AI review coach across all templates; PHI guardrails; superseded-record fixes across secondary surfaces; systematic readiness audit (59 pages, RLS, 18 write paths); employee↔login identity seam fixed (`d80abd0`).
- **2026-08-22/23** — **Multi-tenancy Phases 1–4** (`54096c9`, `5d3248f`, `8b867c7`), with a real cross-tenant storage leak found and fixed. Guide rebuilt 20 → 55 lessons (`91ea499`), then multi-tenancy lesson + playbooks 13 → 17 (`56e0060`). **Jane.app design language** rolled out (`561de0f` → `0d8d1ca`, current production).
- **2026-09-01/02** — Reviewed another session's **Mineral external-training** branch: good design, but it didn't compile, certificates were unviewable, and nothing displayed them — fixed (`63b9dab`). Employment-law register and regulatory change feed added on the same branch by another session (`4d13cc9`, `06298ee`).
- **2026-09-02** — **Ketamine chain-of-custody audit (Dec 2023–Feb 2024) imported** into prod as de-identified records: 1 audit, 12 findings, 1 risk case (no code change). Headline: no bottle is missing; 785 mg across three vials and the Murray vial trail remain open. A due-diligence workpaper reconstructing the missing Jan 2024 Clinic 2 stock-log period was written as a local file (§9).
- **2026-09-06** — HomeVault moved out to its own repository.
- **2026-09-09** — **Med Samples** module (`db0963f`): per-site sample stock, measured dispensing pace, 7-day runway warning, drug-rep contacts and a pre-filled restock request. **Usage-pace engine** generalised and applied to Medical Supplies (`8689ad7`); tests caught a mapper-parity bug and a bucketing off-by-one.
- **2026-09-15** — This handoff written (replacing a six-week-stale one) and pushed to `main`. The 7 local-only commits backed up to GitHub. **13 migrations that existed only in production captured into the repo**, hash-verified (`52d69dd`, `754a7da`). **Medical Supplies: lot-level expiry, use-first and order recommendations** (`754a7da`) — see §8. Inventory split out of Safety into **Medical Inventory** and **General Inventory** top tabs.

---

## 7. Open decisions and to-dos

**Decisions only Landon can make**
- Merge `feature/external-training-mineral` to `main` (ships 7 commits) or cherry-pick.
- Whether the 785 mg unaccounted across three ketamine vials needs assessing against DEA significant-loss reporting before its risk case closes.
- Keep, gate or remove the ~10 auto-generated form templates that define patient-identifier fields (0 submissions so far).
- Whether staff should keep read access to Business Records.

**Needs a look from Landon**
- The new Medical Supplies page has not been seen rendered in a browser (see §8). Once the branch is deployed somewhere he's signed in, walk through it.

**Offered, not started**
- Import the two provider credential spreadsheets in `~/Downloads/untitled folder 4/` (`LPP_Provider_License_Certification_Tracker_2026-09-02.xlsx`, `LPP RESOURCES 2026(PROVIDER INFO).xlsx`) into Credentials — reconcile, flag conflicts, don't overwrite.
- Attach de-identified evidence to the ketamine audit findings.
- Usage pace for Staff Supplies.

**Known gaps**
- Starter-content seeding for new tenants; org switcher; per-org notification scan.
- Backup **restore** (spec exists in the audit notes; export works, restore not built).
- Supabase Auth URL configuration should point at the `lone-peak` origin.
- Rotate the Anthropic API key (it was exposed in a chat earlier).
- The previous version of this file committed a **staging** test password and 2FA secret to git history. Staging holds no real data and is paused, but reset those accounts if the repo is ever shared.
- Dead tables from removed modules: `pto_balances`, `time_clock_entries`, `time_off_requests`.

---

## 8. Most recent feature: supplies expiry + ordering (built 2026-09-15, `754a7da`)

**Landon's request:** track expiration dates alongside the rate supplies are used, help prioritise using things before they expire, recommend how much to order when running low, and a button that opens the vendor page where that product is ordered.

**What was built**
- **Lots.** Stock lives in `medical_supply_lots` (lot number, expiry, received, remaining). A trigger keeps `medical_supplies.quantity_on_hand` = sum of lots, and its `expiration_date`/`lot_number` = the soonest-expiring lot in stock. Pre-lot stock is shown as a stand-in lot and converted to a real lot *before* any other lot write (writing a new lot first would silently drop it — proven on the DB).
- **Record dialog** (use / receive delivery / pull or discard / correct a count): use draws first-expired-first-out and shows which lot to pull; expired lots are refused and flagged to pull; every entry can be back-dated.
- **Waste projection** at the measured pace; "usable" stock excludes units that will expire, and runway + orders use usable stock.
- **Use first** panel: expired lots to pull, then lots projected to expire unused, then (with no pace yet) lots expiring within 45 days — each naming the lot, with a suggestion to move stock to a site that uses it faster.
- **Order recommendation:** planning rate × (days to arrive [default 7] + days to cover [default 30]) − usable − already on order, rounded to pack size, capped so the new lot won't expire before use (shelf life learned from past deliveries). No measured pace → falls back to the item's usual order qty, labelled as such.
- **Order button / dialog:** opens the saved product page (http(s) only — enforced in UI *and* a DB check constraint); without one, "Find it online" plus paste-to-save. "Mark as ordered" stores `last_ordered_at` + `pending_order_qty`; a delivery counts against it; unreceived after 21 days is flagged.
- New columns on `medical_supplies`: `order_url`, `lead_time_days`, `target_cover_days`, `pack_size`, `last_ordered_at`, `pending_order_qty`. `medical_supply_logs.lot_id`. Action `expired` added. SKU is now actually editable (it was stored but had no input).

**Verified:** 78 unit tests, typecheck, build; the lots trigger, check constraints and RLS as a real staff user (rolled back); the pre-lot conversion ordering.
**Not verified:** the page rendered in a browser. The branch isn't deployed, and local dev points at a paused staging project that lacks the newer schema and needs a login. First thing to do after deploying: add a supply, record a delivery with an expiry, record use across two lots, open Order.

**Natural next steps (not requested yet):** the same lot/expiry model for Med Samples (samples expire hard); usage pace for Staff Supplies.

---

## 8b. Clinic Desk integration — dose logging (branch `feature/clinic-desk-integration`, 2026-09-21, NOT deployed)

**Landon's request:** Clinic Desk (his desktop charting app, `~/Documents/Claude Code/clinic-desk`) links to the Hub and, *"when a dose of ketamine or spravato is logged it can log it in the tracker on compliance hub"* — **not** adding patient data to the Hub.

**What was built** (branch off `main`, independent of the Mineral branch):
- `GET /api/integrations/clinic-desk/bottles` — ketamine/Spravato bottles a dose can come from (`assigned_to_staff` or `in_use`, balance > 0), with `mine`, site, and `mgPerUnit` (mg → bottle units: mg, mL from "50 mg/mL", Spravato devices at 28 mg). Plus active staff names for the witness picker.
- `POST /api/integrations/clinic-desk/dose` — writes an `administer` event per bottle (and a witnessed `waste` event for discarded remainder), moves the bottle's balance and state exactly as the Controlled Substances page does, `patient_ref` always null. Checks every line before writing any; refuses a dose whose mg doesn't match the bottles' amounts (unit mix-ups); claims the balance with an optimistic `current_quantity` match; reverts the balance if the event insert fails; idempotent via a `[ref cd-….n]` tag in the event notes.
- **The PHI boundary is enforced server-side** (`src/lib/clinic-desk.ts` `parseDose`): the body is whitelisted, and any unexpected key — above all a patient-shaped one — refuses the whole request.
- **Auth = the user's own Hub session.** Clinic Desk calls these from inside its Compliance Hub pane (same-origin, cookies), so RLS applies as that user (controlled substances = privileged roles). No API key or service role. `guard.ts` rejects cross-site requests (Sec-Fetch-Site, Origin, JSON-only).

**Verified:** typecheck; the dose rules (patient-field refusal, witness-for-waste, time window, unit conversion, states) in Node. **Not verified:** against the live DB — the tracker has **no bottles yet** (checked 2026-09-21), so the first real use needs bottles received and checked out on `/controlled-substances`.
**To ship:** merge to `main` + deploy (Landon's decision), then cherry-pick onto `feature/external-training-mineral` so the branches don't diverge further.

---

## 9. Things that live outside git

- **Claude memory (local sessions only):** `~/.claude/projects/-Users-landonmoyers-Documents-Claude-Code/memory/` — one file per fact, indexed by `MEMORY.md`, loaded automatically into local chats. Much deeper detail on every topic above. Cloud chats cannot see it; this file is the portable version.
- **Ketamine audit source files** (contain patient identifiers — never upload to the app): `~/Downloads/Ketamine_Custody_Audit_Analysis_5.docx`, `Ketamine_Administration_Audit_Dec2023-Feb2024_9.xlsx`, `Ketamine_Vial_Custody_Reconciliation_Resegmented.xlsx`.
- **Stock-log due-diligence workpaper** (no patient identifiers): `~/Downloads/Ketamine_Stock_Log_Reconstruction_Jan2024.html`. Framing preference: missing-record documentation should **lead with the diligence performed**, not with cautions against misuse.
- `.env.local` (prod) and `.env.development.local` (staging) — gitignored, never commit.
- `AUDIT_REPORT.md` in the repo holds the full August audit.

---

## 10. How to verify before claiming something works

- Deployed SHA: `GET /api/version`.
- Code: `npm run typecheck && npm run build && npm run test:unit`.
- Database behaviour: the rolled-back `DO` block pattern in §4 (#13), asserting row counts.
- UI: load the page on the live site and check it; the Chrome session is usually logged in as the owner. Share visuals as Artifacts.
- When reviewing another session's work, check it actually **builds** — one branch was committed without compiling.
