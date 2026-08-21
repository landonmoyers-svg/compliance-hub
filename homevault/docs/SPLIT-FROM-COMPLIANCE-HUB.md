# Why HomeVault is a separate app

The user asked whether HomeVault should live inside the existing business
Compliance Hub or be its own app. The decision: **standalone**, sharing patterns
and tooling but not runtime, data, or trust model.

## The deciding reason: incompatible trust models

Compliance Hub's server is *designed to read tenant data*. Its confidentiality
rests on Postgres Row-Level Security: the server holds the data in plaintext and
enforces who may read which rows. That is correct for a business audit tool — an
admin, an auditor, and the AI assistant all legitimately need server-side access
to records.

HomeVault's entire value proposition is the **opposite**: the server must be
*unable* to read the data, so that a breach, a rogue insider, or a subpoena
yields nothing, and so that estate handover can be trusted to have "no single
party — including us — can open this." You cannot layer a zero-knowledge product
on a server-trusted foundation; the foundation is the thing you're removing.

Trying to host both in one app would mean one codebase where some tables are
server-readable and some are never-server-readable, one AI proxy that must
somehow be both "reads your compliance data" and "never sees your secrets," and
one auth system spanning org-RBAC and household-escrow. Every shared line
becomes a place to accidentally leak the zero-knowledge data through the
server-trusted path. Separation removes an entire class of bug.

## Other differences that reinforce the split

| | Compliance Hub | HomeVault |
| --- | --- | --- |
| Tenancy | Org + roles + RBAC matrix | Household + designated outsiders (trustee, executor) |
| Primary user goal | Pass an audit | Make sure family can access everything, safely |
| Data lifetime | While employed / regulated | Multi-decade, spans the owner's death |
| Signature feature | Reminders, attestations, audit packets | Estate handover ceremony |
| Compliance regime | OSHA/HIPAA-for-a-business | Personal data protection, estate/probate law |
| Monetization | B2B SaaS seat | B2C/household + optional identity-protection insurance |

## What IS safe to share (and how)

Rather than fork blindly, HomeVault reuses **patterns and libraries**, copied and
adapted, never a shared runtime:

- **The `DataClient` seam** (`lib/data/{client,mock,supabase}`) — same shape, so
  the demo-store-then-swap-Supabase approach and its testing story transfer.
- **UI kit** — the Tailwind primitives, `PageHeader`, `StatCard`, card/badge/
  button components. Copied into `homevault/src/components`, not imported across
  app boundaries.
- **The "guide/coach" concept** — Compliance Hub's playbook/guide system
  (`lib/guide/*`) is the direct ancestor of HomeVault's completeness coach.
- **Reminder/expiry engine** — document-expiry logic (passports, licenses) is
  nearly identical to credential-expiry in the business app.
- **Toolchain** — Next 16, React 19, Tailwind v4, Supabase, Playwright, the CI
  shape, so ops and contributors move between the two with no relearning.

## What must NOT be shared

- **No shared database or Supabase project.** Separate project, separate keys,
  separate RLS. HomeVault's project is configured as an encrypted-blob store.
- **No shared AI proxy.** HomeVault's AI path enforces client-side redaction and
  never receives keys (SECURITY.md § 6); the business proxy has no such rule.
- **No shared auth session.** Different factors (passkey-first), different token
  scopes, different recovery (escrow, not email reset).

## Practical placement

The scaffold lives in `homevault/` inside this repo for review convenience (one
PR, shared history). At productization it graduates to its own repository and
its own Supabase project and deploy target. Running side-by-side locally is why
it binds port **3100** while Compliance Hub uses **3000**.
