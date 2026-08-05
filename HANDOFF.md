# Handoff — Next.js Compliance App: rollout + audit completion

Self-contained continuation brief. Full detail in `AUDIT_REPORT.md`. Repo: `compliance-hub` (Next.js 16, Supabase). **Production project `gkrhxfthvqprmnztoxxw` is UNCHANGED.**

## Current state
- Full audit complete across all 9 dimensions → `AUDIT_REPORT.md` (§11 = the completion pass).
- All fixes validated on the **isolated staging** project `noptrlztqiwpdhoxhcyo` ("Compliance Hub — Staging"), a faithful 66-table clone (no real data). Captured as reviewed migrations `supabase/migrations/0001–0007`.
- App code fixes in-repo (not deployed): tiered AI caps (`src/lib/ai/usage.ts`), S1 storage route (`src/app/api/storage/sign/route.ts` + `src/lib/storage.ts`), M3 scan-route recipient tagging, security headers (`next.config.ts`), `server-only` guard, M10 role-const dedup, `next@16.3.0` (0 vulns).
- Staging dev server may be running on http://localhost:3000 (env: `.env.development.local`, has staging service-role key, gitignored). Launch config: session-root `.claude/launch.json` name `staging-dev`.

## Task 1 — Production rollout (BLOCKED here)
Applying migrations to the **prod** Supabase project via MCP `apply_migration`/`execute_sql` was **denied twice by the Claude Code safety classifier** (production DB write). Do not bypass with another tool. Options:
- If the user grants prod-write permission → retry `apply_migration` on `gkrhxfthvqprmnztoxxw`.
- Else the user runs the two prepared copy-paste files in the Supabase SQL Editor:
  - `supabase/migrations/ROLLOUT_PHASE_A.sql` — everything except the storage-policy swap. **Backward-compatible with the currently-deployed app.** Run FIRST.
  - **Deploy the app** (confirm `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel prod — existing admin routes already need it). User's action.
  - `supabase/migrations/ROLLOUT_PHASE_B.sql` — storage tightening. Run AFTER the deploy (zero-downtime; running it before the deploy breaks document viewing).
- On prod, the storage policy to drop is named `documents_authenticated_all` (confirmed via read-only pre-flight).
- After the user applies Phase A, verify read-only (policies present, advisors clean); after deploy, confirm the storage route.

## Task 2 — Finish the audit (staging ONLY — never prod)
Remaining coverage gaps to close and append to `AUDIT_REPORT.md`:
- Full 58-page functional click-through (only ~10 key pages exercised) — via the running dev server. Log in as `owner@staging.test` or `alice@staging.test`, password `StagingTest1!`. **MFA is enforced** — compute TOTP; Alice's enrolled secret is `RYUWNSDVNVDGKMW6CJOJBERKMB7GLKE7`. The 2FA/login MCP flow: fill inputs via `javascript_tool` (the accessibility tree returns empty for this app; screenshots + JS work).
- Keyboard-only a11y + broader axe (only `/credentials` scanned → 2 serious: color-contrast, aria-hidden-focus). Inject axe-core from CDN via `javascript_tool` (no CSP).
- PWA offline/stale-service-worker; password-reset flow; network-kill/500 UI handling.
- Backup/restore actually tested (needs user confirmation — untested backup ≠ backup).
- **Gotcha:** Supabase `signOut` defaults to GLOBAL scope — running the logout test kills the live browser session; don't repeat it mid-sweep.
- **Audit discipline:** do NOT modify application code (audit-only) unless the user approves fixes.

## New HIGH findings from §11 (pre-existing, NOT in migrations 0001–0007, NOT yet fixed)
R-H1 assistant-widget creates have no in-flight guard (double-insert, 13+ paths); R-H2 audit-log write failures swallowed; O-H1 cron scan silently 401s if `CRON_SECRET` unset (undocumented → reminder engine dead); O-H2 scan query errors swallowed (silent dropped reminders, reports success); O-H3 client error monitoring only covers React boundaries.
