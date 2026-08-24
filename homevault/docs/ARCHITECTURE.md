# HomeVault — Architecture

## One-paragraph summary

HomeVault is a **zero-knowledge** household vault. Every sensitive value is
encrypted **in the browser** with keys derived from the owner's passphrase and
hardware authenticator; the server (Supabase) stores only ciphertext, wrapped
key material, and non-secret metadata needed for reminders and handover
orchestration. On top of the vault sits a **coach** that walks a household
through completeness ("do your heirs know where the safe-deposit key is?") and a
**handover engine** that transfers access to designated people when the owner
dies or is incapacitated — verified, auditable, and configurable.

## Stack

- **Next.js 16** (App Router) — matches the sibling Compliance Hub toolchain so
  ops, CI, and hiring transfer. Runs on port **3100** to coexist in the repo.
- **React 19** + **Tailwind v4**.
- **Supabase** — Postgres + Auth + Storage, used as an *encrypted-blob store*,
  not a plaintext database. Row-Level Security is a second fence, not the
  primary confidentiality control (the crypto is).
- **WebCrypto** (SubtleCrypto) for all cryptography — AES-GCM, ECDH/HKDF,
  PBKDF2/Argon2id (via WASM) for passphrase stretching.
- **WebAuthn / passkeys** for phishing-resistant auth and as a second factor in
  the key hierarchy.
- **Anthropic API** for AI search/coaching — but only ever over *decrypted-on-
  the-client* content or explicitly non-secret metadata. The model never
  receives a bare secret it doesn't need (see SECURITY.md § "AI boundary").

## Module map

```
homevault/
├── docs/                        # design (this folder)
├── supabase/migrations/         # encrypted-blob schema + RLS + handover tables
└── src/
    ├── app/
    │   ├── page.tsx             # marketing / landing + "what is this"
    │   ├── (auth)/…             # sign-in, passkey enrollment, unlock
    │   └── (app)/               # authenticated shell
    │       ├── dashboard/       # completeness score + coach next-steps
    │       ├── vault/           # the categories + records
    │       ├── handover/        # configure the estate-handover plan
    │       ├── people/          # household members + designated recipients
    │       └── activity/        # tamper-evident access log
    ├── lib/
    │   ├── crypto/              # the zero-knowledge core (envelope, keys, sss)
    │   ├── domain/              # categories, records, handover state machine
    │   ├── data/                # demo in-memory store + Supabase adapter seam
    │   └── ai/                  # client-side redaction + prompt assembly
    └── components/              # UI primitives + shared pieces
```

## Layered view

```
┌─────────────────────────────────────────────────────────────┐
│  UI (React)   dashboard · vault · handover · people · log     │
├─────────────────────────────────────────────────────────────┤
│  Domain       categories · record lifecycle · handover FSM    │
├─────────────────────────────────────────────────────────────┤
│  Crypto       envelope encrypt/decrypt · key hierarchy ·      │
│  (client)     Shamir secret-sharing · WebAuthn binding        │
├─────────────────────────────────────────────────────────────┤
│  Data seam    DataClient interface                            │
│               ├── DemoClient   (in-memory, ships in scaffold) │
│               └── SupabaseClient (ciphertext blobs + RLS)     │
└─────────────────────────────────────────────────────────────┘
        server sees ── ciphertext · wrapped keys · metadata only
```

The **data seam** mirrors the pattern the Compliance Hub already uses
(`src/lib/data/{client,mock-client,supabase-client}.ts`): the UI talks to a
`DataClient` interface, so the scaffold ships a `DemoClient` and production
swaps in `SupabaseClient` with no UI changes.

## Request/data flow — writing a secret

1. User enters a value (e.g. a password) in the browser.
2. Domain layer builds a `RecordDraft` and calls `crypto.sealRecord(draft)`.
3. Crypto layer generates a fresh **data key (DK)**, AES-GCM-encrypts the field
   payload, then **wraps** the DK under the household's **vault key (VK)**.
4. The `SealedRecord` (ciphertext + wrapped DK + non-secret metadata: category,
   label, expiry, physical-location hint) goes to the `DataClient`.
5. Server stores it. Server never had VK, DK, or plaintext.

## Request/data flow — handover

See [`HANDOVER.md`](HANDOVER.md). In short: the vault key is *escrowed* at
enrollment as encrypted shares such that no single party (including HomeVault)
can reconstruct it, and a state machine — triggered by a dead-man's-switch
timer, a dual-key ceremony, and/or a verified legal event — releases the shares
to designated recipients only after the configured conditions and grace period
are satisfied.

## Non-goals for the scaffold

- No live Supabase project, no real auth provider wired.
- No mobile apps (the roadmap treats the web app as the reference client).
- No payment/insurance-subscription integration (documented as a Phase 4 idea,
  not built).
