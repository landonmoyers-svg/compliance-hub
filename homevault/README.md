# HomeVault

**A secure vault and estate-handover coach for individuals and households.**

HomeVault does for a person or family what the Compliance Hub app does for a
business: it is a single, trustworthy repository for the "keys to the kingdom" —
the documents, credentials, accounts, and physical-location knowledge a
household needs to function, and that a family needs to *find* when a member is
incapacitated or passes away.

It is two products in one:

1. **A vault** — digital backups + physical-location references for the things
   that matter (identity documents, passwords, financial accounts, medical
   history, insurance, hazardous-material locations, wills and trusts), stored
   under client-side, zero-knowledge encryption.
2. **A coach** — a step-by-step guide that makes sure the household actually
   *has* access to everything it will need, and a controlled **handover**
   process so the right people get access at the right time, verified.

> ⚠️ **Status: design scaffold, not production.** This directory is a
> standalone application scaffold with the architecture, security model, data
> model, and a runnable UI shell. It is **not** wired to a live backend and has
> **not** undergone the security review that a product storing SSNs and estate
> documents must pass before touching real data. See
> [`docs/ROADMAP.md`](docs/ROADMAP.md) for what "production-ready" requires.

---

## Why a separate app

HomeVault is deliberately **not** a module inside the business Compliance Hub.
The two share DNA (a vault, a guide, an AI assistant, expiry reminders) but
differ on the axes that matter most:

| Axis | Compliance Hub (business) | HomeVault (household) |
| --- | --- | --- |
| Tenant | Organization with roles/RBAC | Household of a few people + designated outsiders |
| Threat model | Insider misuse, audit failure | Targeted external attacker after "keys to the kingdom" |
| Encryption | Server-trusted (RLS, at-rest) | **Zero-knowledge**: server never sees plaintext or keys |
| Auth | Email + org MFA | Hardware/passkey-first, per-record token gating |
| Killer feature | Audit readiness | **Estate handover** on death/incapacity |
| Data | Business records, PHI | The most sensitive personal data a family holds |

Bolting a zero-knowledge, estate-handover product onto an app whose server is
*designed* to read tenant data would compromise both. See
[`docs/SPLIT-FROM-COMPLIANCE-HUB.md`](docs/SPLIT-FROM-COMPLIANCE-HUB.md) for the
full rationale and what is safe to share.

## Documentation

| Doc | What it covers |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System overview, stack, module map, data flow |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Zero-knowledge encryption, key hierarchy, token gating, threat model |
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | The three configurable estate-handover models |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Categories, records, and the encrypted-blob schema |
| [`docs/SPLIT-FROM-COMPLIANCE-HUB.md`](docs/SPLIT-FROM-COMPLIANCE-HUB.md) | Why standalone; what's shared vs. forked |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phased plan from scaffold → production |
| [`DEPLOY.md`](DEPLOY.md) | Rollout runbook: preview → own repo → real backend |

## Running the scaffold

```bash
cd homevault
npm install
npm run dev      # http://localhost:3100
```

The scaffold runs entirely in the browser against an in-memory demo store; no
Supabase project or secrets are required to explore the UI. Crypto operations
use the real WebCrypto primitives described in `docs/SECURITY.md`, so the
encrypt/unlock flow is genuine even in demo mode.
