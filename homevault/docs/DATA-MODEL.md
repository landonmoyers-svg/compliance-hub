# HomeVault — Data Model

## Category taxonomy

Every record belongs to a **category**, and every category carries a default
**sensitivity tier** that drives encryption strength messaging, step-up-auth
requirements, and which handover model applies. Categories map directly to the
things the user named.

| Category | Examples | Tier | Physical-location aware |
| --- | --- | --- | --- |
| `identity` | SSN cards, birth/marriage certificates, passports, driver's licenses | `critical` | ✓ (originals) |
| `accounts` | Passwords, logins, 2FA recovery codes, email/domain control | `critical` | — |
| `financial` | Bank/brokerage accounts, crypto seed phrases, tax records, safe-deposit | `critical` | ✓ |
| `estate` | Wills, trusts, powers of attorney, advance directives, beneficiary designations | `critical` | ✓ |
| `medical` | Medical history, allergies, medications, physicians, insurance cards, directives | `high` | — |
| `insurance` | Life, home, auto, umbrella policies; agent contacts | `high` | ✓ |
| `property` | Deeds, titles, vehicle registrations, appraisals, warranties | `high` | ✓ |
| `household` | Utilities, subscriptions, Wi-Fi, device PINs, service providers | `standard` | ✓ |
| `hazmat` | Chemical/hazardous-material locations & safety data (paint, pool, propane, firearms storage) | `high` | ✓ (location is the point) |
| `contacts` | Attorney, accountant, executor, doctors, next-of-kin | `standard` | — |
| `directives` | Funeral/end-of-life wishes, letters to family, "if I'm gone, read this" | `high` | ✓ |

Notes:
- **`hazmat`** is the household analog of the business app's SDS library: it
  records *where* dangerous substances are and how to handle them — the thing a
  first responder or a grieving family member needs and never has.
- **Physical-location awareness** is a first-class concept: a record can be a
  *digital backup*, a *physical-location reference* ("original birth certificate:
  fireproof safe, bedroom closet, combo in the `financial` record"), or both.

## Record shape

A record splits cleanly into **non-secret metadata** (server-visible, powers
reminders/coach) and the **encrypted payload** (never server-visible).

```ts
// Non-secret — stored plaintext server-side
interface RecordMeta {
  id: string;
  householdId: string;
  category: CategoryKey;
  tier: SensitivityTier;             // critical | high | standard
  label: string;                     // "Primary checking", "Mom's birth certificate"
  kind: "digital" | "physical" | "both";
  hasPhysicalLocation: boolean;      // there IS a location note (the note itself is encrypted)
  expiresOn: string | null;          // for reminders (passport expiry, policy renewal)
  updatedAt: string;
  createdAt: string;
  // NB: nothing here identifies the secret. "Primary checking" is fine;
  // the bank, number, and login live only in the sealed payload.
}

// Secret — AES-256-GCM(DK, JSON), only ever decrypted client-side
interface RecordPayload {
  fields: Array<{ key: string; value: string; secret: boolean }>;
  physicalLocation?: string;         // "Fireproof safe, master closet top shelf"
  notes?: string;
  attachments?: AttachmentRef[];     // ciphertext blobs in Storage, keyed by DK
}

// What actually lands in the DB
interface SealedRecord {
  meta: RecordMeta;
  ciphertext: string;                // base64 AES-GCM of RecordPayload
  iv: string;
  wrappedDataKey: string;            // wrap(DK, VK)
  aad: string;                       // meta bound as additional-authenticated-data
}
```

**AAD binding.** The record metadata is bound into the AES-GCM additional-
authenticated-data so the server can't swap a ciphertext under a different
label/category without detection.

## Handover-related tables

See `HANDOVER.md` for behavior; the schema is in
`supabase/migrations/0000_homevault_baseline.sql`:

- `households` — the tenant; owner + settings.
- `household_members` — people with app access (owner, co-owner, viewer).
- `handover_recipients` — designated people (may be non-members: a lawyer), each
  with a public key and an entitlement scope (which tiers/records).
- `handover_plans` — one active plan per tier group; the trigger config JSON.
- `handover_shares` — encrypted SSS shares, each encrypted to a holder's pubkey.
- `handover_events` — append-only, hash-chained ceremony/state-transition log.
- `records` — the `SealedRecord`s (ciphertext + metadata).
- `audit_log` — append-only, hash-chained access log across the whole app.

## RLS posture

RLS is the *second* fence (crypto is first), but it is still strict:

- A member sees only their household's rows.
- A `handover_recipient` who is not a member sees **only** their own
  `handover_shares` and the `handover_events`/`handover_plans` they're party to —
  never the `records` metadata — until a handover reaches `RELEASED`, at which
  point their entitlement scope opens the corresponding `records` rows (whose
  payloads they can now decrypt with the reconstructed key).
- `audit_log` and `handover_events` are insert-only to clients; no update/delete.
