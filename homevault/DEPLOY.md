# HomeVault — Rollout Runbook

How to stand HomeVault up as its **own** app, separate from the business
Compliance Hub. The guiding rule: **new projects, not new accounts.** Keep your
existing GitHub, Vercel, and Supabase logins — create isolated projects under
them. New *accounts* are only needed later, for legal/billing separation.

The steps are ordered by what unblocks what. Do them top to bottom.

---

## Stage 0 — Preview it live (no backend, ~15 min)

The scaffold runs entirely in the browser in demo mode: **no Supabase, no env
vars, no secrets.** So the fastest path to a shareable link touches Vercel only.

**You can do this without moving any code**, because HomeVault already lives in
its own self-contained folder with its own `package.json` and config.

1. **Vercel → Add New → Project** → import the `compliance-hub` repo.
2. In the project settings, set **Root Directory = `homevault`**.
   - Vercel now builds *only* that folder as an independent deployment with its
     own URL — separate from the business app's project, same repo.
3. Framework preset: **Next.js** (auto-detected). No env vars needed.
4. Deploy. You get a private preview URL to share.

> Result: a live, shareable HomeVault demo. Still **not for real data** — it's
> the in-memory demo store. Real data waits for Stage 2.

Accounts touched: **Vercel only** (your existing team). GitHub: unchanged.
Supabase: not yet.

---

## Stage 1 — Give it its own repo (recommended before real users)

A distinct product deserves its own repo — clean history, issues, access, and
CI. HomeVault is already structured to become a repo root with no code changes.

1. **GitHub → New repository** (same account), e.g. `homevault`, private.
2. Copy the **contents** of the `homevault/` folder to the new repo's root
   (everything here becomes the top level; drop the `homevault/` nesting).
   - It's fully self-contained: `package.json`, `tsconfig.json`,
     `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `src/`,
     `supabase/`, `docs/`, tests.
   - Once at repo root, the `turbopack.root` pin in `next.config.ts` is
     redundant (it only mattered while nested inside compliance-hub) — harmless
     to leave, fine to remove.
3. **Vercel → the HomeVault project → Settings → Git** → point it at the new
   `homevault` repo and clear the Root Directory override (it's the root now).
4. Push. Vercel redeploys from the new repo.

Accounts touched: **GitHub + Vercel** (existing). Supabase: still not yet.

---

## Stage 2 — Real backend (the first step of going beyond a demo)

This is where a **dedicated Supabase project** comes in — a separate database
and separate keys, never shared with the business app. This is required by the
security model (`docs/SECURITY.md`), not just tidiness.

1. **Supabase → New project** (same org is fine), e.g. `homevault-prod`.
   Pick a region near your users; save the DB password.
2. Apply the schema: run `supabase/migrations/0000_homevault_baseline.sql` in
   the SQL Editor (or via the Supabase CLI / MCP `apply_migration`).
3. Copy `.env.example` → set the values in **Vercel → Project → Environment
   Variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY` (only when AI search/coach is wired)
4. Build the auth + data layer that these env vars feed (passkeys/Argon2id, the
   `SupabaseClient` behind the existing `DataClient` seam). This is Phase 1 in
   `docs/ROADMAP.md` — it is real work, not a config toggle.

> ⚠️ **Do not put real household data in until the Phase-1 cryptographic review
> passes** (`docs/ROADMAP.md`). Stage 2 makes the app *capable* of real storage;
> the review makes it *safe* for it.

Accounts touched: **Supabase** (new project) + Vercel (env vars).

---

## Stage 3 — Domain, and later, separate accounts

- **Domain:** add a custom domain to the Vercel project (e.g. `homevault.app`).
  Keep it distinct from the business app's domain.
- **Separate accounts / org / billing:** only when HomeVault becomes its own
  business entity, or you want its Supabase data-processing agreements and bill
  fully separated from the medical/business side. For a product holding SSNs and
  estate data this is worth doing *eventually* — but it is a migration
  (transfer the repo, the Vercel project, and the Supabase project to the new
  org), not a launch blocker.

---

## Cheat sheet

| Question | Answer |
| --- | --- |
| New GitHub account? | No. New **repo** (Stage 1). |
| New Vercel account? | No. New **Project** (Stage 0). |
| New Supabase account? | No. New **project** (Stage 2) — required for isolation. |
| When do I need real *accounts*? | Only for legal/billing separation (Stage 3). |
| Fastest shareable demo? | Stage 0 — Vercel only, ~15 min, no backend. |
| Can I skip straight to real data? | No — Stage 2 + the Phase-1 review gate first. |
