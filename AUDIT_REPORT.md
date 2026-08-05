# Compliance Hub — Audit Report

> **Status: Read-only foundation pass (Pass 1) + partial live verification.** Pass 1 covered the read-only dimensions (build & baseline health, inventory, static security, dependency & code hygiene, read-only Supabase advisors). An isolated **staging environment has since been provisioned** (a faithful 66-table Supabase clone — see §8), and the two headline access-control findings were **live-tested** against it. That testing **refuted H1 and confirmed/elevated M2** — see §9 Live Verification. The remaining dynamic dimensions are still open.

> ⚠️ **Correction (2026-08-04, from live testing): the original "biggest risk" (H1 — blind cross-user write/delete) does NOT reproduce.** PostgreSQL applies the restrictive SELECT policy when locating rows for UPDATE/DELETE, so a staff user can only modify rows they can already see (their own). The real confirmed cross-user-tamper surface is **M2** (broad-tier tables writable by any authenticated user), now raised to High. This is the value of the "verify High findings by hand" step.

---

## 1. Audit metadata

| | |
|---|---|
| **Repository** | `compliance-hub` (Lone Peak Psychiatry compliance system) |
| **Git SHA** | `d2da39bd9d38bd4b7c8b91479b8f031ede90f9b3` |
| **Branch** | `main` (working tree clean at audit time) |
| **Last commit** | `d2da39b` — 2026-07-23 — "Fix verified cross-feature/data-seam bugs from full-app dependency audit" |
| **Stack** | Next.js **16.2.9** (App Router, custom `src/proxy.ts` middleware), React 19.2.4, Supabase (SSR auth + Postgres + Storage), Anthropic SDK, Tailwind v4, Playwright. Vercel-hosted. |
| **Toolchain** | Node v24.18.0, npm 11.16.0 |
| **Audit date** | 2026-08-04 |
| **Environments tested** | (a) **Static** read-only analysis of the repo at the pinned SHA. (b) **Read-only catalog queries** (advisors, `list_tables`) against the **live** Supabase project `gkrhxfthvqprmnztoxxw` ("Compliance Hub"). |
| **Data-safety confirmation** | ⚠️ **No non-production environment exists** (see finding **C1**). No writes, no anon-key probes, no destructive tests, and no dynamic tests were run. The only Supabase queries issued were read-only catalog/advisor calls. No secrets or real records appear in this report. |
| **Scope note** | Per owner direction, the **HIPAA/PHI dimension was not run** (system scoped as staff/operations data only). The database does hold **staff PII** (41 employees, 118 credentials, employee documents), so confidentiality/integrity findings below still matter. |

---

## 2. Executive summary

The app is in **solid engineering shape at the surface** — it builds cleanly, its source typechecks, secret handling is genuinely well-architected (no secrets in the client bundle or git history; service-role and Anthropic keys are server-only), API admin routes enforce role checks correctly, and RLS is force-enabled on all 66 tables with `anon` granted nothing. The **material risk is one layer down, in the RLS write policies**: reads are correctly tiered (own / privileged / broad), but **INSERT/UPDATE/DELETE on many personal, compliance-critical tables (credentials, insurance policies, vendor BAAs, training attempts, PTO balances) are gated only on "is authenticated," letting any logged-in staff/contractor blind-modify or delete records they cannot even read** (finding H1) — the single biggest risk. Compounding this: the codebase has **no isolated environment to test against**, so the whole class of dynamic/access-control findings can only be *statically* asserted and must be re-verified live (C1). Counting this pass: **1 Critical, 4 High, 10 Medium, ~9 Low.** Recommend standing up a Supabase branch + synthetic seed as the very next step, then running the deferred security/data-integrity pass against it.

---

## 3. Findings (severity-ranked)

Legend for **Status**: **Confirmed** = proven from source/build/advisor output in this pass. **Needs live verification** = asserted from static/migration text or advisor and must be reproduced against an isolated live DB (schema-drift risk, see H1/M7, makes this non-optional).

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| C1 | Critical | No non-production environment; audit's dynamic dimensions blocked, dev/testing likely runs against live prod data | Confirmed |
| ~~H1~~ | ~~High~~ → **Refuted / downgraded to Low** | RLS write policies look flat, but PostgreSQL gates UPDATE/DELETE by the SELECT policy too. **Live test: a staff user could NOT modify another user's credential or insurance.** Residual: any authenticated user can still INSERT junk rows and self-edit their own gated records (Low). | **Refuted by live test** (§9) |
| H2 | High | `SECURITY DEFINER` functions (incl. `purge_expired_audit_logs`, `audit_delete_labeled`) executable by the **anon** role via RPC | Confirmed (advisor); effect needs live verification |
| H3 | High | SSRF: `/api/sds/find-pdf` fetches a caller-supplied `directUrl` server-side with no host allowlist | Confirmed (static); needs live verification |
| H4 | High | 4 high-severity dependency vulns (Next.js, postcss, sharp); fix is a low-risk minor bump 16.2.9→16.3.0 | Confirmed |
| M1 | Medium | All ~28 `/api/ai/*` routes gate on authentication only (no role); AI daily cap **fails open** | Confirmed |
| **M2→H** | **High** | Broad "any authenticated" full-CRUD on shared-integrity tables (employees PII, training answer keys, policies, regulatory sources). **Live test: a staff user read AND modified another user's `employees` row.** This is the real cross-user-tamper surface. | **CONFIRMED by live test** (§9) |
| M3 | Medium | Cross-user disclosure: `notifications` and `profiles` readable by every authenticated user | Confirmed (static); needs live verification |
| M4 | Medium | Per-page **role** authorization is client-side only (auth*entication* is server-side via `proxy.ts`) | Confirmed |
| M5 | Medium | `employee-vault` renders "row-level access… not yet enforced in this view" — known-unfinished control | Confirmed |
| M6 | Medium | Performance/RLS: 80× per-row auth re-evaluation, 8 unindexed FKs, 3 duplicate permissive policies | Confirmed (advisor) |
| M7 | Medium | Schema drift: 14 live tables exist in **no** in-repo migration; migration won't replay to prod shape | Confirmed |
| M8 | Medium | No app-level login rate-limiting / account-lockout (delegated wholly to Supabase Auth) | Partially confirmed |
| M9 | Medium | Lint fails: 25 errors (incl. `set-state-in-effect` cascading renders); not gated in build/CI | Confirmed |
| M10 | Medium | Privileged-role list hardcoded in 10+ places (incl. admin routes) instead of canonical `roles.ts` | Confirmed |
| L1 | Low | No security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy) | Confirmed |
| L2 | Low | `src/lib/supabase/admin.ts` (service-role factory) lacks an `import "server-only"` guard | Confirmed |
| L3 | Low | `/api/monitoring/error` is unauthenticated with no rate limit (log-write/DoS sink) | Confirmed |
| L4 | Low | Supabase Auth "leaked password protection" (HaveIBeenPwned) is disabled | Confirmed (advisor) |
| L5 | Low | Storage bucket RLS policies are not in version control (live-only, dashboard-managed) | Confirmed (gap) |
| L6 | Low | Config drift: Anthropic model id hardcoded ~30 routes; divergent currency/date formatting; hardcoded prod URL | Confirmed |
| L7 | Low | Dead code / links / terminology drift (`ComingSoon` unused, `lpalert.example` dead link, employee/staff/provider) | Confirmed |
| L8 | Low | Local workspace hygiene: stray `.next/types/*.d 2.ts` cruft, broken `refs/heads/main 2` git ref, stray `env.local.rtf` | Confirmed |
| L9 | Low | No `typecheck` npm script; lint not in build gate; only e2e tests exist (none executed) | Confirmed |

### Finding detail

#### C1 — No non-production environment (Critical)
- **What / where:** `list_projects` returns exactly one Supabase project (`gkrhxfthvqprmnztoxxw`), which is the same project `.env.local` points at, and it holds real data (41 employees, 118 credentials, 352 audit logs). There is no staging project and no branch.
- **Reproduction:** `supabase list_projects` → one `ACTIVE_HEALTHY` project; `.env.local` `NEXT_PUBLIC_SUPABASE_URL` resolves to the same ref.
- **Impact:** Every dynamic/destructive audit dimension (RLS-via-anon-key, storage probes, cascade-delete, concurrent-edit, injection, 1,000-row load) cannot run without risking real data — so they are deferred. It also strongly implies day-to-day development and manual testing occur against production. The audit prompt itself designates "no non-production environment" a Critical finding.
- **Status:** Confirmed.

#### H1 — Flat RLS write policies → ~~blind IDOR writes/deletes~~ **REFUTED (downgraded to Low)**

> **Live-test verdict (§9): REFUTED.** Signed in as a `staff` user (Alice) against staging, attempts to UPDATE and DELETE another user's (`Bob`) credential and insurance policy **all affected 0 rows** — both with and without `return=representation` (HTTP 204/200 but the row was never changed). PostgreSQL applies the **SELECT** policy (`own-or-privileged`) when locating rows for an UPDATE/DELETE, so the flat write `USING` is effectively constrained to rows the user can already see. The dramatic scenario below ("delete anyone's license") does **not** hold. **Residual real issues (Low):** (a) any authenticated user can still **INSERT** junk rows into these tables (flat `WITH CHECK`); (b) a user can edit/​delete **their own** gated records where writes arguably should be admin-controlled (e.g. set own `training_attempts.passed = true`). Fix these two narrowly; the mass-tamper concern is void.

_Original (static) analysis, retained for context:_
- **What / where:** `supabase/migrations/0000_baseline_schema.sql`, policy block ~lines 1066–1330. On many tables, SELECT is correctly scoped (`is_privileged() OR owner`) but **INSERT/UPDATE/DELETE use only `USING (auth.uid() IS NOT NULL)`** — no ownership or role scoping. Affected: `credentials` (~1127–1132), `insurance_policies` (~1165), `benefits` (~1090), `vendors`/BAAs (~1324), `competency_records`, `completed_forms`, `form_assignments`, `training_assignments`, `training_attempts` (~1300), `pto_balances`, `time_clock_entries`, `time_off_requests`.
- **Impact:** Any authenticated account — including `contractor` / `read_only` — can (a) **delete or tamper with another person's license, insurance, or BAA record** by iterating row ids, *even without read access*, and (b) **self-modify gated data** (e.g. set their own `training_attempts` to passed, inflate their own `pto_balances`). Version-capture triggers exist on `credentials`, `documents`, `vendors`, `employee_documents` (partial recovery), but most write-open tables above have **no** version trigger — so a DELETE is unrecoverable.
- **Good counter-example in the same file:** `employee_documents` (~1136–1145) requires `is_privileged()` for writes — that is the pattern the tables above are missing.
- **Status:** Confirmed in migration text; **needs live verification** that prod policies match (schema drift is documented — see M7). *This is the finding to spot-check by hand first.*

#### H2 — Anon-executable `SECURITY DEFINER` functions (High)
- **What / where:** Security advisor flags six `SECURITY DEFINER` functions callable by the **`anon`** (unauthenticated) role via `/rest/v1/rpc/…`: `purge_expired_audit_logs`, `audit_delete_labeled`, `propagate_employee_name`, `propagate_module_title`, `propagate_template_title`, `hr_admin_or_owner` (plus `bump_ai_usage`, `is_privileged` to `authenticated`).
- **Impact:** `purge_expired_audit_logs()` and `audit_delete_labeled()` being callable **without signing in** is an audit-log-integrity risk — an anonymous internet caller could potentially trigger audit-log deletion. The `propagate_*` functions could mutate denormalized names/titles. `hr_admin_or_owner`/`is_privileged` are boolean auth-context checks and are low risk regardless.
- **Reproduction (deferred, do NOT run against prod):** `POST {SUPABASE_URL}/rest/v1/rpc/purge_expired_audit_logs` with only the anon key, on the isolated branch, and observe whether rows are deleted.
- **Remediation reference:** https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- **Status:** Confirmed callable (advisor); actual effect without auth context needs live verification.

#### H3 — SSRF via `/api/sds/find-pdf` (High)
- **What / where:** `src/app/api/sds/find-pdf/route.ts` accepts a caller-supplied `directUrl` and fetches it server-side (with a spoofed browser User-Agent), then uploads the response into the `documents` bucket. Authenticated `[user]`, no host allowlist observed.
- **Impact:** A signed-in user can make the server issue arbitrary outbound requests — internal/metadata endpoints, intranet hosts — and persist the result. Classic SSRF.
- **Status:** Confirmed from source; needs live verification of what internal hosts are reachable from the deploy environment.

#### H4 — High-severity dependency vulnerabilities (High)
- **What / where:** `npm audit` → 6 vulns (4 high). Next.js advisories include **unauthenticated disclosure of internal Server Function endpoints**, DoS via SVG in the Image Optimization API, cache confusion, and unbounded Edge server-action payloads; `postcss <=8.5.22` (source-map path traversal / XSS); `sharp <0.35.0` (libvips CVEs).
- **Impact:** The Next.js "unauthenticated disclosure of internal Server Function endpoints" advisory is directly relevant to this app's server-action surface.
- **Fix:** `npm audit fix --force` installs `next@16.3.0` — a **minor** bump from 16.2.9 (low risk), plus patched postcss/sharp. Re-run the build after.
- **Status:** Confirmed.

#### M1 — AI routes gate on authentication only; cap fails open (Medium)
- **Where:** all `src/app/api/ai/*` routes call `supabase.auth.getUser()` but no role check; `src/lib/ai/usage.ts` `enforceAiCap()` returns "allowed" if the counter RPC errors.
- **Impact:** Any signed-in user (incl. `read_only`/`contractor`) can invoke all ~28 AI endpoints (document drafting, analysis, board reports) — a cost and data-egress surface. A DB hiccup silently removes the per-user daily cap.
- **Status:** Confirmed. (`inventory-chat` and `concierge` are the only role-aware AI routes.)

#### M2 — Broad "any authenticated" full-CRUD tables (**High — CONFIRMED, the real cross-user-tamper surface**)

> **Live-test verdict (§9): CONFIRMED.** Signed in as a `staff` user (Alice), I both **read and updated** another user's `employees` row (changed Bob's `last_name` to "TAMPERED", HTTP 204, verified via admin query, then restored). Because these tables' **SELECT** policy is *also* flat (`auth.uid() IS NOT NULL`), the write is not gated — so unlike H1, cross-user tamper here is real. This is now the top confirmed access-control issue: any staff/contractor/read_only account can alter employee PII, rewrite training answer keys, and edit/delete official policies & regulatory content.
- **Where:** migration policy block. `employees`, `documents`, `training_modules`, `training_questions`, `form_templates`, `regulatory_sources`, `osha_records`, `inventory`, `locations`, `emergency_drills`, `sds_records`, `tasks`, `policy_acks` grant ALL ops to any authenticated user.
- **Impact:** Any staff account can rewrite training answer keys, edit/delete official policies or regulatory-source content, or alter employee records. Some breadth is by design (the app's "broad" read tier), but write-open-to-all is a tamper risk; only `documents` has a version trigger.
- **Status:** Confirmed static; needs live verification.

#### M3 — Cross-user disclosure via `notifications` / `profiles` (Medium)
- **Where:** `notifications_select` and `profiles_select` = `USING (auth.uid() IS NOT NULL)`.
- **Impact:** Every authenticated user can read all notification rows (which embed per-person names + compliance statuses, e.g. "Credential expired: Dr. X") and the full staff directory (name/email/role/department). The directory is likely intended; the org-wide notification read is a softer PII leak. (Good adjacent control: `profiles_update` requires `is_privileged()` and `profiles_insert` forces `account_role='staff'` — role self-escalation is blocked.)
- **Status:** Confirmed static; needs live verification.

#### M4 — Per-page role authorization is client-side only (Medium)
- **Where:** `src/proxy.ts` enforces *authentication* at the edge (redirects unauthenticated users to `/auth/login`, exempts `/auth/*` and `/api/*`). But per-page **role** gating lives in `src/components/layout/app-shell.tsx` (`canAccessPath`) — a client component; disallowed pages `router.replace("/")` but the page code still runs and fetches in the browser.
- **Impact:** Page shells are not a security boundary; the confidentiality guarantee for data rests entirely on RLS (H1/M2/M3) and per-route API checks. Defense-in-depth gap, not a direct data hole (anon has no grants).
- **Status:** Confirmed.

#### M5 — Known-unfinished access control in `employee-vault` (Medium)
- **Where:** `src/app/employee-vault/page.tsx:579` renders UI text: row-level access "is a future server-side concern and is not yet enforced in this view."
- **Impact:** A self-documented gap on an HR document vault; RLS is the only backstop, which ties back to H1/M2.
- **Status:** Confirmed.

#### M6 — Performance / RLS at scale (Medium)
- **Where:** performance advisor: **80× `auth_rls_initplan`** (policies re-evaluate `auth.<fn>()`/`current_setting()` per row — wrap in `(select …)`), **8× unindexed foreign keys** (e.g. `credentials.employee_user_id`), **3× multiple permissive policies** (e.g. `ce_records` overlapping read+write SELECT), 15 unused indexes.
- **Impact:** Query cost grows with row count; not yet felt at current volumes (most tables < 200 rows) but untested at 1,000+ rows (deferred load test).
- **Status:** Confirmed (advisor).

#### M7 — Schema drift: live tables absent from migrations (Medium)
- **Where:** Only one migration exists (`0000_baseline_schema.sql`, ~48 `CREATE TABLE`s). The live DB has 66 tables; **14 are in no migration**: `supply_items`, `supply_movements`, `medical_supplies`, `medical_supply_logs`, `lifecycle_tasks`, `ce_records`, `emergency_plans`, `controlled_substance_items`, `controlled_substance_events`, `dea_records`, `payer_contracts`, `payer_enrollments`, `business_records`, `sop_regulation_links`. These were created out-of-band (project memory notes "no DB migration" for controlled-substance custody).
- **Impact:** The migration history will **not replay to the current production shape** on a fresh DB — which directly undermines the ability to stand up the isolated environment needed for C1, and means the RLS policies for those 14 tables are not in source review (their write-policy posture is unknown here). Also: removed-module tables (`time_clock_entries`, `time_off_requests`, `pto_balances`) linger with write-open policies.
- **Status:** Confirmed.

#### M8 — No app-level login rate-limiting/lockout (Medium)
- **Where:** login/reset flows delegate entirely to Supabase Auth (`signInWithPassword`, `resetPasswordForEmail`); no application-level lockout code exists.
- **Impact:** Brute-force resistance depends on Supabase's built-in limits, whose configuration is not in the repo and was not verified.
- **Status:** Partially confirmed (code absence confirmed; Supabase settings unverified — see §6).

#### M9 — Lint failures, not gated (Medium)
- **Where:** `eslint` → **44 problems (25 errors, 19 warnings)**. Dominant: `react-hooks/set-state-in-effect` (cascading renders) at `src/components/theme-provider.tsx:32`, `src/components/shared/signed-image.tsx:27`, `src/components/shared/camera-capture.tsx:62`, +22 more. Next 16 does not auto-lint on build, so these do not fail CI.
- **Impact:** Real render-performance smells shipping unchecked; no lint gate means regressions accrue silently.
- **Status:** Confirmed.

#### M10 — Duplicated privileged-role lists (Medium)
- **Where:** canonical `ADMIN_ROLES` in `src/lib/auth/roles.ts:10`, but re-hardcoded as local `PRIVILEGED` consts in `api/admin/deactivate-user/route.ts:6`, `api/admin/storage-audit/route.ts:5`, `api/admin/invite-user/route.ts:7`, `api/notifications/scan/route.ts:8`, and inline in `api/ai/inventory-chat/route.ts:91`; the valid-roles list is re-hardcoded in `compliance-concierge/page.tsx:259,292` and `assistant-widget.tsx:221`.
- **Impact:** Adding/renaming a role means editing ~10 disconnected sites; a missed site becomes an access-control bug. Elevated above pure hygiene because several sites are authorization checks.
- **Status:** Confirmed.

#### Low findings (condensed)
- **L1 — No security headers.** `next.config.ts` sets only `/sw.js` caching; no CSP/HSTS/X-Frame-Options/Referrer-Policy. Clickjacking + weaker XSS defense-in-depth.
- **L2 — `admin.ts` no `server-only` guard.** Service-role factory is currently imported only by the 4 server routes, but an accidental future client import wouldn't fail the build. Add `import "server-only"`.
- **L3 — `/api/monitoring/error` unauthenticated, no rate limit.** Intentional client-error sink (only `console.error` + optional Sentry forward), but an open log-write/DoS surface accepting arbitrary bodies.
- **L4 — Leaked-password protection off** (Supabase Auth HaveIBeenPwned check). Enable in dashboard.
- **L5 — Storage RLS not in VCS.** The `documents` bucket's `storage.objects` policies are not in the migration (dashboard-managed) — not reviewable in source and unverified (see §6).
- **L6 — Config drift.** Anthropic model id `claude-haiku-4-5-20251001` hardcoded in ~30 routes (`concierge` diverges to `claude-sonnet-4-6`), no `ANTHROPIC_MODEL` env; currency formatting reimplemented 5+ times with divergent rounding ($1,235 vs $1,234.56 for the same value across pages); date formatting bypasses `src/lib/dates.ts` in ~11 sites (reintroducing the invalid-date crash the lib prevents); `PROD_APP_URL` hardcoded in `api/admin/invite-user:54`.
- **L7 — Dead code / links / terminology.** `src/components/shared/coming-soon.tsx` (`ComingSoon`) never imported; `sidebar.tsx:336` links to `https://lpalert.example` (non-real `.example` TLD); "employee" vs "staff" vs "provider" used interchangeably; `ROLE_SHORT` (settings:19) vs `roleLabel()` render the same role differently.
- **L8 — Local workspace hygiene.** Stray `.next/types/*.d 2.ts`/`d 3.ts` duplicate files broke standalone `tsc` (Finder/iCloud copy cruft; a fresh build clears them); a broken local git ref `refs/heads/main 2` blocks `git log --all`; a stray `env.local.rtf` sits at repo root (gitignored, values not read).
- **L9 — Test/CI gaps.** No `typecheck` npm script; lint not wired into build; only a Playwright e2e suite exists and it was **not executed** (would hit prod). See §6.

---

## 4. What was verified working (with evidence)

An audit that only lists failures hides what you can trust. These passed in this pass:

- **Build succeeds.** `next build` completes and emits the full route table (58 pages + 36 API routes). Evidence: build log, exit 0.
- **Source typechecks clean.** After clearing stale `.next` cache duplicates, `tsc --noEmit` produces zero errors. (`next.config.ts` has no `typescript.ignoreBuildErrors`, so the successful build also type-checked.)
- **Secret handling is clean and well-architected.**
  - No secrets in the **client bundle**: grep of `.next/static` finds no `sk-ant-` and no `service_role`; the only JWTs present decode to `"role":"anon"` (the expected public key).
  - No secrets in **git history**: no `.env*` file was ever tracked; no `sk-ant-`/service-role JWT in any tracked blob (`eyJ` hits are `package-lock.json` integrity hashes). No rotation indicated.
  - `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are referenced **only in server route handlers**; `createAdminClient` (service-role) is imported only by the 3 `api/admin/*` routes + `notifications/scan`.
  - No sensitive value behind a `NEXT_PUBLIC_` prefix; no `VITE_` vars.
- **API admin authorization is strong.** All 3 `api/admin/*` routes authenticate via `getUser()` and enforce the privileged-role set before using service-role; `invite-user` requires owner-to-mint-owner; `deactivate-user` blocks self-deactivation and owner-by-non-owner. `api/audit/view` derives the actor from the session, not the request body (anti-spoofing). `notifications/scan` requires a `CRON_SECRET` bearer or a privileged user.
- **Injection surfaces are clean.** One `dangerouslySetInnerHTML` (`layout.tsx:36`) renders a static theme-init constant; one `.rpc()` call (`bump_ai_usage`, no args); no raw SQL interpolation, no `eval`/`new Function`; storage paths sanitize filenames and the bucket is private with short-lived signed URLs.
- **RLS baseline posture is good where it counts.** RLS is **force-enabled on all 66 tables** (advisor + `list_tables` confirm `rls_enabled: true` everywhere), `anon` is granted no table privileges, and role self-escalation via `profiles` is blocked. The weaknesses in H1–M3 are all *within* the authenticated tier, not anon exposure.
- **Authentication is enforced server-side** at the edge via `src/proxy.ts`.
- **Version history retention** works via `capture_record_version()` BEFORE-UPDATE/DELETE triggers on `credentials`, `documents`, `vendors`, `employee_documents`.

---

## 5. Inventory (enumeration backbone)

- **Pages:** 58 `page.tsx`, all flat single-segment routes (**no dynamic `[id]` routes**; selection via query params). Groupings: auth, dashboard/cross-cutting, credentialing/training, documents/policies, risk/audit, safety/clinical-ops, HR.
- **API routes:** 36 `route.ts` — 3 admin (`[privileged]`), ~28 AI (`[user]`), `audit/view` (`[user]`), `monitoring/error` (`[none]`), `notifications/scan` (`[privileged | CRON_SECRET]`), `sds/find-pdf` & `sds/pubchem` (`[user]`), `auth/callback`.
- **Roles:** `owner, admin, hr, clinical_leadership, manager, staff, contractor, read_only, inactive` (keyed off `profiles.account_role`). Admin set = `owner/admin/hr/clinical_leadership`.
- **Integrations:** Supabase (SSR + anon + service-role clients, all centralized), Anthropic (per-route), PubChem (SDS lookups), Vercel (host + 1 cron), Sentry (dependency-free forwarder when `SENTRY_DSN` set). **No email library** (invites/reset go through Supabase Auth; Resend paused per project memory).
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/APP_URL` (public, legitimate), `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `SENTRY_DSN`, `AI_DAILY_CAP` (server).
- **Storage:** single **private** `documents` bucket; signed-URL access; no public bucket.
- **Webhooks:** none (no payment/e-sign/email providers wired) — nothing to signature-verify.
- **Cron/jobs:** one Vercel cron → `/api/notifications/scan` daily 13:00 UTC, `CRON_SECRET`-authed. No edge functions, no queue workers.
- **Tables:** 66 live (see §3 M7 for the migration/live drift).

---

## 6. Coverage gaps (could NOT test — do not read as passes)

All of the following are **deferred because no non-production environment exists (C1)**. Silence here is not a pass:

- **Feature functionality** — happy/unhappy paths, empty/max-length/special-char input, double-submission, back-button mid-flow, expired-session mid-flow, concurrent edits, dead links/orphan routes clicked through.
- **Forms** — client-vs-server validation parity (bypassing client via direct API calls).
- **Time zones / DST** — any scheduling/expiry date logic across zones and a DST boundary.
- **Reliability** — network-kill mid-request, 500 handling, loading states, race conditions on rapid nav, optimistic-update rollback, `catch`-block swallowing, idempotency/duplicate-record creation.
- **Live access control** — RLS via anon key, storage-object cross-user fetch, IDOR write reproduction (H1), anon RPC effect (H2), SSRF reachability (H3). **These are the highest-value deferred items.**
- **Data integrity** — cascade behavior on parent delete, 1,000+ row load/pagination (M6), and **whether the single migration replays cleanly** (M7 says it will not).
- **Live-vs-migration RLS parity** — every RLS finding above is a migration-text read; prod may differ (schema drift).
- **Storage `storage.objects` policies** — not in the migration (L5); must be checked in the Supabase dashboard.
- **Supabase Auth settings** — JWT expiry, refresh rotation, password policy, rate limits (M8), leaked-password toggle (L4) — dashboard config, not in repo.
- **Backups/restore** — the `backups` table has 2 rows, but whether a **restore** has ever been tested is unknown (untested backup ≠ backup).
- **E2E suite** — a Playwright config + tests exist but were **not run** (would execute against prod).
- **Usability / a11y / performance / mobile-PWA** — keyboard + axe passes, offline/stale-service-worker behavior, bundle-size budgets — not run.
- **Monitoring** — whether error alerting actually fires in prod is unverified.

---

## 7. Proposed fix order (awaiting approval — no changes made)

Fixes are a **separate, approved phase**. Nothing below has been applied. Suggested sequence, with dependencies:

1. **Stand up an isolated environment (unblocks C1 and everything deferred).** Create a Supabase branch (or throwaway project) + synthetic seed; authorize it for testing. **Blocker:** M7 must be partly addressed first — author migrations for the 14 un-migrated tables so the branch reflects prod, or the branch will be missing tables.
2. **H1 — RLS write policies.** Add owner/privileged scoping to INSERT/UPDATE/DELETE on the affected personal tables (mirror the `employee_documents` pattern); add version-capture triggers where missing. *Verify on the branch, and hand-spot-check first.*
3. **H2 — Anon `SECURITY DEFINER` RPCs.** `REVOKE EXECUTE` from `anon`/`authenticated` or switch to `SECURITY INVOKER` — prioritize `purge_expired_audit_logs`, `audit_delete_labeled`.
4. **H4 — Dependencies.** Bump to `next@16.3.0` + patched postcss/sharp; re-run build.
5. **H3 — SSRF.** Add a host allowlist / block internal ranges on `find-pdf` `directUrl`.
6. **M1–M3 — AuthZ tightening.** Role-gate the AI routes and make the cap fail closed; narrow broad-CRUD write policies (M2); scope `notifications`/`profiles` reads (M3). (Depends on the branch from step 1 to verify safely.)
7. **M7 / L2 / L1 — Source-of-truth hygiene.** Reconcile schema drift into migrations; add `server-only` to `admin.ts`; add security headers.
8. **M4/M5/M8/M9/M10 — Hardening & consistency.** Client-authz backstop, rate-limit review, lint gate + fix `set-state-in-effect`, consolidate role constants.
9. **M6 — Perf.** Wrap RLS auth calls in `(select …)`, add FK indexes, dedupe permissive policies — after correctness fixes land.
10. **L3–L9 — Low/hygiene batch.**

**Recommended next session:** run the remaining dynamic dimensions against the staging environment now provisioned (§8), starting from the confirmed **M2** result.

---

## 8. Staging environment (provisioned 2026-08-04)

A dedicated, isolated **non-production** Supabase project was created and provisioned with a faithful copy of the schema so dynamic testing no longer risks production.

| | |
|---|---|
| **Project** | `Compliance Hub — Staging` (ref `noptrlztqiwpdhoxhcyo`, us-west-1, free tier — $0/mo) |
| **API URL** | `https://noptrlztqiwpdhoxhcyo.supabase.co` |
| **How it was built** | Applied the repo's authoritative `0000_baseline_schema.sql` (52 tables) + the 26 post-July-7 schema migrations replayed from prod's migration history + 4 out-of-band tables introspected from prod. **No production data was copied.** |
| **Fidelity vs prod** | 66 tables (match), 0 tables with RLS off (match), 119 policies (exact match), all 6 anon-executable SECURITY DEFINER functions reproduced (matches the H2 advisor set). |
| **Anon posture** | anon table grants revoked to the baseline's documented "no privileges" intent. (Note: prod actually retains **202** anon table grants — a latent discrepancy from that intent; not actively exploitable because policies gate on `auth.uid()`, but worth tightening.) |
| **Synthetic test users** | `owner@staging.test` (owner/privileged), `alice@staging.test` & `bob@staging.test` (staff), `carol@staging.test` (read_only). Password for all: a shared test value set at creation (rotate/remove before any real use). |
| **Wiring the app to it** | Point a Vercel **Preview** env (or a local `.env`) at the URL above with staging's own anon + service-role keys from the Supabase dashboard → Project Settings → API. Do **not** reuse production keys. |
| **Cleanup** | Delete the project from the dashboard (or ask me) when finished; it's free but idle. |

## 9. Live verification results (against staging)

Method: signed in as each synthetic user via the anon key (`/auth/v1/token`), then exercised PostgREST (`/rest/v1/…`) with that user's JWT; confirmed actual row state via an admin query. Evidence scripts: `verify_h1.mjs`, `verify_h1b.mjs`, `verify_m2.mjs` (scratchpad).

| Test | Actor | Expected (per static finding) | Actual | Verdict |
|---|---|---|---|---|
| Read another user's credential | staff (Alice) | blocked | 0 rows (blocked) ✓ | SELECT RLS works |
| **Update** another user's credential | staff (Alice) | H1: succeeds | **0 rows affected** (204, no change) | **H1 refuted** |
| **Delete** another user's insurance policy | staff (Alice) | H1: succeeds | **0 rows affected** (row still exists) | **H1 refuted** |
| Read + **Update** another user's `employees` row | staff (Alice) | M2: succeeds | **succeeded** (`last_name`→"TAMPERED", verified, then restored) | **M2 confirmed (High)** |

**Takeaways:** (1) The restrictive SELECT policy (own-or-privileged) also constrains UPDATE/DELETE on `credentials`/`insurance_policies`/etc., so H1's mass-tamper scenario is void — downgrade to the two narrow residuals (INSERT pollution; self-edit of own records). (2) On broad-tier tables whose SELECT is *also* flat (`employees`, `documents`, `training_questions`, `training_modules`, `form_templates`, `regulatory_sources`, `osha_records`, `inventory`, `locations`, `sds_records`, `tasks`, `policy_acks`), cross-user read+write+delete by any authenticated account is real (M2, now High). (3) H2 confirmed: an **unauthenticated** call to `purge_expired_audit_logs` returned HTTP 200 (it *is* invokable without login); `audit_delete_labeled` is 404 (trigger fn, not RPC-callable — that part of H2 was over-stated). (4) **New finding — the `read_only` role is not enforced by RLS**: a read_only account inserted a task (201). (5) **New finding — INSERT-for-others**: a staff user inserted a credential attributed to another user (201, without `return=representation`). (6) **New finding S1 (High) — storage cross-user access** (see below). (7) **Privileged tier holds**: staff `INSERT` into 11 sensitive tables (`risk_cases`, `breach_assessments`, `audits`, `exclusion_screenings`, `controlled_substance_logs/items`, `dea_records`, `backups`, `sra_assessments`, `corrective_actions`, `disciplinary_actions`) all returned **403** — no gaps.

### S1 (High) — `documents` storage bucket has no per-user access control
- **What/where:** prod's only `storage.objects` policy is `documents_authenticated_all` = `FOR ALL TO authenticated USING (bucket_id = 'documents')` — no owner/path scoping. `src/lib/storage.ts` is a **client** module: uploads and `createSignedUrl` run in the browser with the user's own token, so this flat policy is the *only* gate.
- **Live test (staging, replicated bucket+policy):** a `staff` user AND a `read_only` user both **listed** another user's private file (`credentials/owner-private-secret.txt`), and the staff user **minted a working signed download URL** for it. Filename unpredictability is not a mitigation — the list endpoint enumerates every object.
- **Impact:** any authenticated account (down to `read_only`) can enumerate and download every file in the bucket: credential/license scans, insurance cards, employee documents (I-9/W-4/disciplinary/termination), controlled-substance evidence.
- **Status:** **FIXED (option A) — verified on staging** (migration `0004_*.sql` + route `src/app/api/storage/sign/route.ts` + `src/lib/storage.ts`).
- **Fix applied:** (Layer 1) direct client access to the bucket is now **owner-or-privileged** (`documents_owner_or_privileged` policy). (Layer 2) signed-URL minting moved to a **server route** that calls `can_view_object(path)` — a `SECURITY INVOKER` function re-applying the caller's RLS (true only if they can see the object directly or a record they may read references it) — then mints with the service-role key. Uploads stay client-side (users upload as owner).
- **Verification (staging):** staff/read_only can no longer list or reach another user's private file; a user's *own*-record files and *broad-read* SOPs still resolve; owner/privileged unchanged. ⚠️ The full route round-trip needs a runtime smoke test once wired to staging with the service-role key (the RLS + authz function are verified; the route's mint step uses the standard admin client).
- **Promotion note:** on prod the storage policy is dashboard-managed and named `documents_authenticated_all` — drop that exact name; also set `SUPABASE_SERVICE_ROLE_KEY` for the route.

---

## 10. Fixes applied (2026-08-04)

All DB fixes were applied to **staging** and verified by re-running the exploit tests (before → blocked/after). App-code fixes are in the repo (not deployed). **Production is unchanged** — promote the two migrations after review.

### Database (staging; repo migrations `0001_*.sql`, `0002_*.sql`)
| Finding | Fix | Verified |
|---|---|---|
| **H2** | Revoked RPC `EXECUTE` from anon/authenticated on `purge_expired_audit_logs`, `audit_delete_labeled`, `propagate_*`, `hr_admin_or_owner` (they still fire as triggers). | anon call → **401** (was 200) |
| **M2** (High) | Content/PII tables (`employees`, `documents`, `training_modules`, `training_questions`, `form_templates`, `regulatory_sources`, `locations`): read stays broad, **writes restricted to `is_privileged()`**. | staff tamper of `employees` → **blocked**; owner still writes ✓ |
| **read_only not enforced** (new) | Added `is_writer()` (excludes read_only/inactive); broad staff-workflow tables (`tasks`, `inventory`, `sds_records`, `osha_records`, `emergency_drills`, `policy_acks`) write-gated on it. | read_only insert → **403**; read still works; staff/owner write ✓ |
| **H1 residual** (INSERT) | `credentials`/`insurance_policies` INSERT scoped to own-or-privileged; `benefits`/`vendors` INSERT → privileged. | staff insert-for-other → **403**; staff insert-own → **201** ✓ |

### App code (repo; not deployed)
| Finding | Fix | Verified |
|---|---|---|
| **H4** | `next@16.3.0` (minor bump) + `npm audit fix` for postcss/sharp. | `npm audit` → **0 vulnerabilities**; build passes |
| **L1** | Added baseline security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) in `next.config.ts`. CSP intentionally deferred (needs per-directive testing). | build passes |
| **L2** | Added `import "server-only"` to `src/lib/supabase/admin.ts` (service-role client). | typecheck + build pass |

### M1 — partially fixed: role-based AI daily caps (repo migration `0003_*.sql` + `src/lib/ai/usage.ts`)
Replaced the single flat cap with **per-role tiers** (env-tunable): owner **unlimited**, admin/hr/clinical_leadership 500, manager 300, staff/contractor **50**, read_only 30. `bump_ai_usage()` now returns `{count, role}` so the limit is applied in one round-trip. Verified on staging (RPC returns the correct role per user; drop-in — all 28 routes unchanged). **Deploy the migration together with `usage.ts` (RPC return type changed).** Still open by design: the cap fails **open** on a counter error (availability over cost-safety — owner's call to flip), and AI routes remain gated on authentication only (no per-route role block, consistent with "all staff use AI").

### Deliberately NOT changed (needs owner decision / larger work)
- **M3** — `notifications`/`profiles` readable by all authenticated (directory likely intended; notification exposure is a softer leak).
- **M10 — FIXED.** The 5 duplicated `PRIVILEGED = ["owner","admin","hr","clinical_leadership"]` arrays (3 admin routes, the cron scan, inventory-chat) now import the canonical `ADMIN_ROLES` from `src/lib/auth/roles.ts`. Build + typecheck clean.
- **M9 — partially fixed; remainder is a code-style decision.** 3 of 25 lint errors fixed (unescaped apostrophes → 22 left). The app was then **run against staging and smoke-tested in the real UI** (login, dashboard, credentials page — all render correctly with RLS-scoped data, **zero console errors**). Reading the flagged code confirms the remaining 22 are **legitimate, intentional React patterns** the strict React-Compiler rules dislike — e.g. `theme-provider` hydrates from `localStorage` in an effect *specifically* to avoid an SSR hydration mismatch (a lazy initializer would break it); `pwa-register` detects iOS-standalone on mount; `signed-image` resets on path change. Restructuring these risks *introducing* bugs. Correct resolution is one of: (a) justified `eslint-disable` per instance documenting intent, (b) downgrade `set-state-in-effect`/`purity` to warnings in `eslint.config.mjs`, or (c) targeted restructures (`key` props). A team code-style call — not a blind rewrite. `error.tsx`'s `no-html-link` is intentional (hard reload from an error boundary).

### Staging runtime validation (2026-08-04)
Ran `npm run dev` against the staging DB (`.env.development.local` override; public anon key; service-role left empty). Confirmed in the browser across **both privilege levels**:
- **Owner (privileged):** dashboard + Credentials render; sees **both** providers' credentials. Theme toggle works. No console errors.
- **Staff (Alice):** reduced nav (no admin sections — client role-gating works); Credentials shows **only her own** (Bob's correctly hidden = RLS read-scoping enforced in the real app); and she **successfully created her own credential** via the UI ("Credential added" → 2 on file) — so the tightened `credentials_ins` policy enforces *and* doesn't break the legitimate staff workflow.
- **MFA:** the app enforces **TOTP 2FA enrollment** on login for every user (positive; relevant to M8).

So the tightened RLS is validated against the real UI for a non-privileged user — **rollout gap #2 (staff-flow regressions) is closed.**

**S1 storage route — validated end-to-end (rollout gap #1 closed).** With the staging service-role key in the dev env, uploaded real files linked to Alice's and Bob's credentials and exercised `/api/storage/sign` as the staff user Alice: signing her **own** file → 200 + working signed URL (downloaded the real content); signing **Bob's** file → **403 "Not authorized for this file."** The route authorizes against the owning record, mints via service-role, and blocks cross-user access — the S1 design, confirmed in the running app. *(Still not exercised: the M3 scan-route generation and M1 AI-cap path — lower risk; the M3 RLS scoping and the code changes are already verified.)*

---

## 11. Full-audit completion — remaining dimensions (2026-08-04)

The initial pass was risk-sequenced (security/data-integrity deep; functionality/reliability/usability/perf/ops shallow). This section completes dimensions **1, 2, 3, 5, 6, 7, 8** against the **staging** environment (isolated) + the running app. Read-only dimensions ran as parallel subagents; dynamic tests ran against the staging-backed dev server. **Production untouched.**

### New HIGH findings
- **R-H1 (Reliability) — AI assistant executes creates with no in-flight guard → duplicate records.** `src/components/ai/assistant-widget.tsx` (executeAction ~L151, render L319-321): the action button is gated only by `a.done`, which is set *after* `mutateAsync` resolves. A double-click or slow network fires the create twice — across **13+ create paths** (task, credential, document, employee (+double `provisionLogin`), vendor, risk_case…), none with idempotency keys. Same class as M11 but far broader blast radius. Confirmed (static).
- **R-H2 (Reliability) — audit-log write failures are swallowed (console-only).** `src/lib/data/audit.ts:41`: `writeAudit` logs to console and lets the action succeed. In a compliance product the audit trail is a regulated artifact — a failed write leaves a silent gap with no user/admin feedback, no retry. Confirmed.
- **O-H1 (Ops) — the daily reminder cron silently 401s if `CRON_SECRET` is unset (and it's undocumented).** `src/app/api/notifications/scan/route.ts:25-35`, `vercel.json`, `.env.local.example`. If `CRON_SECRET` isn't set, `authorize()` falls through to 401 and the **entire expiry-reminder engine (credentials/insurance/training/BAA/re-cred) never fires** — no error, no alert. `CRON_SECRET` is in neither `.env.local.example` nor README. Confirmed.
- **O-H2 (Ops) — scan failures are invisible; per-query read errors swallowed.** Same file, 13 reads destructure only `{ data }` and ignore `error` → a failing query yields `null` → that category silently produces zero reminders while the scan **reports success** (`{created:N}`). The GET catch returns 500 but never logs or forwards to monitoring. Worst failure mode for a reminder system. Confirmed.
- **O-H3 (Ops) — client error monitoring only covers React render-boundary errors.** `src/lib/report-error.ts` is called only from `error.tsx`/`global-error.tsx`. **No `window.onerror`, no `unhandledrejection` handler**, no server-route forwarding. The dominant error class in a CRUD app — an RLS-rejected `create()` in a submit handler, a failed `fetch` — never reaches monitoring. Most prod errors are invisible. Confirmed.

### New MEDIUM findings
- **Session — logout does not invalidate the access token.** Live test: after `POST /auth/v1/logout` (204), the **access token still worked** (200) until natural ~1h expiry; the refresh token *was* revoked (400). A leaked/stolen token stays valid up to an hour post-logout. Standard Supabase stateless-JWT behavior; mitigated by short TTL, but a real finding (dim 5).
- **V-M (Functionality) — no server-side *shape* validation; Zod schemas are types-only.** `src/lib/data/schema.ts` Zod objects are used only via `z.infer`; **zero `.parse()` at any write**. All CRUD is client→Supabase via the anon key — only Postgres `NOT NULL`/`CHECK`/FK constraints enforce server-side. Email format, numeric ranges, and cross-field rules (e.g. `startDate ≤ endDate`, CS quantity vs balance) are **client-only → bypassable** via a direct API call with a valid session. Confirmed (dim 2).
- **T-M (Functionality) — timezone off-by-one.** Multiple sites use `new Date().toISOString().slice(0,10)` = **UTC "today,"** which is already *tomorrow* on evenings in Mountain Time (the practice's zone): `osha/recordkeeping-guide.tsx:248` (a legally-attested cert date), `activity-log:70`, `competency-tracker:88`, `security-risk-assessment:96`, AI-prompt "today" sites. Also the notification `daysUntil` (scan route, UTC) disagrees by a day with the UI's local-day logic (`dates.ts`). `dates.ts` itself is correct — the bug is code that bypasses it. Confirmed (dim 2, DST/timezone).
- **Perf (dim 7):** `jspdf` (~412KB) and `jszip` statically imported into route entry bundles (not code-split) — `reports`, `fillable-documents`, `sop-library`, `document-intake`, `backup`; **N+1 signed-URL waterfall** — each `<SignedImage>` fires its own `/api/storage/sign` call (now a *server* round-trip each after the S1 fix) with no batching/cache, inside inventory/supply list `.map()`s; **unbounded whole-table fetches** — `list()` does `select("*")` all rows, so `/audit-trail` renders up to 5,000 `<tr>`, chat pages pull all `chat_messages` to show one user's, `/` fans out 19 full-collection fetches. Structural root: no scoped/paged query hook exists.
- **A11y (dim 6) — 2 serious axe violations** on `/credentials`: `color-contrast` (3 nodes) and `aria-hidden-focus`. Automated only; a manual keyboard pass would likely find more.
- **R-M1 (Reliability) — batch creates via `Promise.all(mutateAsync)` have no partial-failure rollback.** `controlled-substances.tsx:773/805` (mints N ketamine bottles + events), `sop-library`, `training`, `audits`, `sra`. A mid-batch failure leaves partial inserts; retry re-creates the successful ones (no idempotency) → duplicate controlled-substance custody records. Confirmed.
- **Env (dim 8) — inconsistent missing-env behavior + undocumented vars.** `NEXT_PUBLIC_*` read with `!` (crashes whole app in `proxy.ts` on every request if missing, cryptic message); `admin.ts` fail-soft to null; AI routes throw at module load. No central boot validation. `CRON_SECRET` and `SENTRY_DSN` undocumented.

### New LOW findings
- **e2e authenticated smoke is flaky** (dim 1): `tests/e2e/pages.spec.ts` login helper times out at the TOTP step (MFA now enforced) — the 20s `waitForURL` + TOTP timing is fragile; the 16-page authenticated sweep effectively doesn't run in CI. (Public tests pass.)
- **R-M2** base mutation hooks (`hooks.ts:28-64`) define no `onError` backstop; **R-M3** chat pages render no error state for their backing collection.
- **Perf:** unused `recharts` dependency (~400KB latent, never imported); no `next/image` anywhere (raw `<img>`, no resize/lazy/srcset).
- **No documented deploy/rollback** (README is create-next-app boilerplate).
- Confirms earlier: `lpalert.example` dead sidebar link.

### What was verified WORKING (dimensions 1/2/6)
- **Build:** `npm ci` clean, source typechecks, prod build succeeds, `npm audit` 0 vulns (post-fix). **Public e2e tests pass** (login renders; anon→login redirect).
- **Functional smoke (staff role, live):** home, executive-dashboard(redirect), credentials, insurance-vault, training, employee-vault, settings, reports, continuing-education, business-records — **all render, zero console errors**. Owner sees all data; staff sees only own (RLS). Staff **self-write works** (added own credential via UI). **Role-gating works** (reduced staff nav; admin routes redirect). **MFA (TOTP) enforced** on every login; **tampered JWT → 401**.
- **Mobile (375px):** `/credentials` renders cleanly — sidebar → hamburger, cards stack, no horizontal overflow.

### Remaining coverage gaps (could NOT / did NOT test — silence ≠ pass)
- **Full 58-page click-through** (exercised ~10 key pages as staff + a few as owner) and **per-form unhappy-paths** (empty/max-length/special-char, back-button mid-flow).
- **Keyboard-only a11y** manual pass; broader axe coverage beyond `/credentials`.
- **PWA:** install prompt, offline behavior, stale-service-worker after deploy.
- **Password-reset flow** (can't read the email); **backup/restore actually tested** (backups table has rows; restore unverified — untested backup ≠ backup).
- **Network-kill/500 UI handling** and loading-state behavior on slow responses (dim 3 dynamic).
- **Repo migration clean-replay** on a fresh DB (repo has the incomplete baseline — that's M7).
- **M6 — FIXED.** Wrapped every RLS auth call (`auth.uid()`/`is_privileged()`/`is_writer()`) in a scalar subselect (migration `0007_*.sql`, applied via a programmatic `ALTER POLICY` sweep + 3 explicit for the subquery policies). **Verified: the `auth_rls_initplan` advisor dropped 80 → 0**, and the privileged tier / read_only / M2 enforcement are all unchanged (re-ran the exploits). The ~18 `multiple_permissive_policies` (SELECT) warnings are an accepted minor tradeoff of the read/write split.
- **M8** rate-limiting (config-level: Supabase Auth rate-limit/CAPTCHA), concurrent-edit locking, **L6/L7** hygiene — deferred.
- **Personal-table read_only writes** — `training_attempts`/`pto_balances`/etc. UPDATE branches still allow a read_only user to edit their *own* rows (lower stakes; noted in `0002_*.sql`).

### Reliability / data-integrity dynamic results (tested on staging, 1,000+ rows)
- **M11 (Medium) — no idempotency / duplicate records → FIXED.** Two concurrent identical `policy_acks` inserts previously both returned 201 → **2 duplicate rows**. Fix (migration `0005_*.sql`): dedupe + **partial unique index** on `(user_id, document_id) WHERE status='acknowledged'` (blocks duplicate active acks; still allows re-ack after expiry). **Verified:** double-submit now returns `[201, 409]`, 1 row. *(Similar shape on `training_assignments`/`payer_enrollments` — apply the same pattern if those flows show dupes.)*
- **M12 (Medium) — lists silently truncate at 1,000 rows → FIXED.** PostgREST caps responses at 1,000; the shared `list()` in `src/lib/data/supabase-client.ts` had no pagination, so rows beyond 1,000 were invisible as tables grow. Fix: `list()` now auto-pages in 1,000-row batches (stable `created_date,id` order). **Verified:** paging fetched 1,201/1,201 rows. Build passes.
- **M3 (Medium) — cross-user read of notifications → FIXED.** A `read_only` account previously read others' person-specific compliance notifications ("Credential expired: Dr. X"). Fix (migration `0006_*.sql` + scan-route change): added a nullable `user_id` recipient; RLS scopes reads to `user_id IS NULL (org-wide) OR user_id = auth.uid() OR is_privileged()`, and the scan job now tags credential/training/insurance/paneling alerts with the affected user. **Verified:** read_only sees only org-wide alerts; staff see org-wide + their own; privileged see all; the bell still works for everyone. Build passes. *(profiles-as-directory left as-is — intended.)*
- **M8 (Medium) — weak brute-force protection → CONFIRMED.** 10 rapid failed logins all returned `400`, **no `429` throttle**; there's no app-level lockout and Supabase's default didn't trip at that volume. Fix: enable Supabase Auth rate-limiting/CAPTCHA (Turnstile) and/or app-level lockout. *(Auth integrity is otherwise sound: a tampered JWT → 401 on data access.)*
- **Concurrent edits — last-write-wins (Medium, not fixed).** Two parallel updates to one credential both succeeded (204/204); no optimistic-concurrency check → silent lost update. Mitigated by the version-capture trigger (prior states retained), but no conflict detection. Fix if desired: add an `updated_at`/version check (e.g. `If-Match`-style guard).
- **M6 — per-row RLS eval confirmed (deferred).** Own-scoped list of 1,001 rows ~370ms vs ~240ms privileged. Not urgent at current volumes; the fix is Supabase's `(select is_privileged())` wrapping across ~119 policies — a mechanical batch job best done as its own migration.

### Remaining to test (dynamic, on staging)
Full functionality happy/unhappy paths (needs the app running), time-zone/DST scheduling, network-failure UX, and the storage route end-to-end round-trip.
