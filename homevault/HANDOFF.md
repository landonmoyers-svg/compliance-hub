# HomeVault — Handoff to local Claude Code

Continuation brief for picking this up in the **native Claude Code app** on your
machine (where `gh`, git auth, the Vercel CLI, and your logged-in browser are
all available — none of which the remote web session could reach).

## What HomeVault is

A standalone, zero-knowledge household vault + estate-handover coach — the
personal counterpart to the business Compliance Hub. Full design in
[`README.md`](README.md) and [`docs/`](docs/). Rollout plan in
[`DEPLOY.md`](DEPLOY.md).

## Where it lives right now

- All code is on branch **`claude/household-document-management-qtsk5t`** of
  `landonmoyers-svg/compliance-hub`, in the **`homevault/`** subfolder.
- Open **PR #1** (draft) against `main`. CI (Vercel) is green.
- It's a self-contained Next.js 16 app: own `package.json`, `tsconfig`,
  `next.config.ts`, `supabase/` migration, tests. Runs in demo mode (no backend).

## State

- ✅ Builds (`next build`), lints, typechecks; 18/18 unit tests pass
  (`npm test` — envelope encryption, Shamir secret-sharing, handover FSM).
- ✅ Demo runs fully in-browser, no Supabase/secrets needed.
- ⏳ Not wired to a real backend; not for real data until the Phase-1 crypto
  review (see `docs/ROADMAP.md`).

## What got blocked in the remote web session (and works locally)

1. **Creating the standalone GitHub repo** — the web session's GitHub
   integration is scoped to `compliance-hub` only, so `create_repository`
   returned 403. Locally, `gh` with your account does it in one command.
2. **Driving your browser** — the remote container has no access to your
   connected Chrome / Computer Use; those belong to the claude.ai app runtime,
   not Claude Code. Locally this is moot.
3. **Leftover to clean up:** a Vercel project named **`homevault`** was created
   in the `lone-peak` team from an *incomplete* file set (only config files, no
   `src/`), so its build fails. Delete that project (or redeploy it properly)
   when you set up the real one — see below.

## Do this locally to get productive

```bash
# 1. Get the code
git fetch origin
git checkout claude/household-document-management-qtsk5t
cd homevault
npm install
npm run dev            # http://localhost:3100 — the demo

# 2. (Stage 1) Give it its own repo — split the subfolder to a new repo root
gh repo create homevault --private --source=. --disable-wiki=false || true
# ^ or, to keep git history of just this folder:
#   git subtree split --prefix=homevault -b homevault-root
#   gh repo create homevault --private
#   git push git@github.com:landonmoyers-svg/homevault.git homevault-root:main

# 3. (Stage 0/1) Deploy the preview from the new repo
#    Vercel dashboard → New Project → import homevault  (no env vars needed)
#    or:  npx vercel --cwd homevault
```

Full, ordered rollout (preview → own repo → Supabase → domain) is in
[`DEPLOY.md`](DEPLOY.md). Short version: **new projects, not new accounts** —
same GitHub/Vercel/Supabase logins throughout.

## Good first tasks for local Claude Code (Phase 1)

- Wire the `SupabaseClient` behind the `DataClient` seam against a new,
  dedicated Supabase project; apply `supabase/migrations/0000_homevault_baseline.sql`.
- Passkey/WebAuthn enrollment + Argon2id passphrase stretching (unlock VK from
  PK ⊕ PRF) — see `docs/SECURITY.md § 2`.
- The handover ceremony runner over the pure FSM in `src/lib/domain/handover.ts`.
