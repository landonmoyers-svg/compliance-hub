# HomeVault — Roadmap

Phased plan from the current **scaffold** to a product that may responsibly hold
a family's SSNs and estate documents. Each phase has an explicit exit bar.

## Phase 0 — Scaffold (this PR)

- ✅ Architecture, security, handover, data-model docs (the contract).
- ✅ Standalone Next.js app shell: landing, dashboard, vault, handover, people.
- ✅ Domain layer: categories, record lifecycle, handover state machine (pure,
  testable), sensitivity tiers.
- ✅ Crypto core: real WebCrypto envelope encryption + a Shamir secret-sharing
  implementation, running in demo mode in the browser.
- ✅ Supabase migration for the encrypted-blob schema + RLS.
- **Exit bar:** it runs, the crypto round-trips, the handover FSM has unit
  tests, and the design is reviewable. **Not** for real data.

## Phase 1 — Real backend, real auth

- Wire the `SupabaseClient` adapter to a dedicated Supabase project.
- WebAuthn/passkey enrollment + unlock; Argon2id (WASM) passphrase stretching
  with tuned parameters; VK unwrap requiring PK ⊕ PRF.
- Capability-token step-up for `critical`-tier reveals.
- Reminder engine (passport/policy expiry) over non-secret metadata.
- **Exit bar:** an external cryptography review of the key hierarchy and the
  escrow/SSS implementation. No real-user launch before this passes.

## Phase 2 — Handover, end to end

- Ceremony runner for all three trigger models + AND/OR composition.
- Recipient onboarding (including non-member trustees) and scoped re-wrap on
  release.
- Dead-man's-switch check-in ladder (email/SMS/push) + document-verification
  vendor integration for `legal_proof`.
- Hash-chained audit trail with periodic external anchoring.
- Fire-drill / dry-run mode.
- **Exit bar:** a full estate-handover simulation with a real attorney in the
  loop; legal review per target jurisdiction; a red-team of the "premature
  handover" and "forged death certificate" paths.

## Phase 3 — Hardening & trust

- Strict CSP + SRI; move toward reproducible builds and a signed desktop/mobile
  client to shrink the "trust the delivered code" residual risk.
- Duress passphrase → decoy vault + silent alert.
- Local-first semantic AI search with client-side redaction (SECURITY.md § 6).
- SOC 2 / independent pen-test; bug bounty.
- **Exit bar:** third-party pen-test with no criticals; published security
  whitepaper matching SECURITY.md.

## Phase 4 — Ecosystem

- Identity-protection / cyber-insurance subscription (the user's idea): partner
  underwriting; the vault's completeness score can inform coverage.
- Wealth-transfer coaching: guided workflows for trusts, **Crummey letters**,
  beneficiary reviews, and gifting — as *education + document organization*,
  explicitly **not** legal advice, always routing to the household's attorney.
- Professional (attorney/executor/financial-advisor) shared workspace.
- Mobile apps as first-class signed clients.

## Explicit non-commitments

HomeVault organizes and hands over estate documents; it does **not** draft legal
instruments or give legal/financial advice. Every wealth-transfer feature is a
coach that produces organized inputs for a licensed professional. This boundary
is a product principle, not a limitation to be "fixed."
