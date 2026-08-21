# HomeVault — Security & Encryption Model

> HomeVault stores the data an attacker most wants: SSNs, passwords, account
> numbers, and the location of physical valuables. The design goal is that a
> **full breach of HomeVault's servers yields no usable secrets** — only
> ciphertext and wrapped keys that are worthless without material the servers
> never hold.

This document is the contract the implementation must meet. Where the scaffold
code and this document disagree, this document wins and the code is the bug.

## 1. Principles

1. **Zero-knowledge.** The server stores ciphertext, wrapped keys, and
   non-secret metadata. Plaintext and unwrapped keys exist only in the client,
   only while unlocked, and are zeroized on lock/close.
2. **Defense in depth.** Client-side encryption is the *primary* confidentiality
   control. Supabase RLS, TLS, at-rest disk encryption, and least-privilege
   tokens are additional fences, never the only one.
3. **No single point of unilateral access** — including HomeVault itself. No
   employee, no support tool, and no database dump can decrypt a vault. This is
   what makes the estate-handover trustworthy.
4. **Phishing-resistant auth.** Passkeys/WebAuthn first; TOTP as fallback;
   passwords never sufficient alone for a full unlock.
5. **Tamper-evident, not just access-controlled.** Every access and every
   handover step writes to an append-only, hash-chained log the owner and
   recipients can audit.
6. **Recoverable by design, not by backdoor.** Recovery flows (lost passphrase,
   death, incapacity) run through the *handover/escrow* machinery — the same
   no-single-party mechanism — never through a HomeVault master key.

## 2. Key hierarchy

```
Passphrase ──Argon2id──► Passphrase Key (PK) ─┐
                                              ├─► unwrap ──► Vault Key (VK)
WebAuthn PRF / device secret ─────────────────┘            (per household)
                                                                │ wraps
                                              ┌─────────────────┴───────────────┐
                                        Data Key (DK)      Data Key (DK)   … one per record
                                          │ AES-GCM           │
                                    record ciphertext   record ciphertext
```

- **Passphrase Key (PK)** — derived in-browser from the owner's passphrase with
  **Argon2id** (memory-hard; parameters in `crypto/params.ts`). Never leaves the
  client. Salt is stored server-side (a salt is not a secret).
- **Second factor into the key, not just the session.** Unlocking VK requires
  *both* PK **and** a device factor: the WebAuthn **PRF extension** output (or,
  where PRF is unavailable, a device-stored key protected by the platform
  authenticator). So a stolen passphrase alone cannot unwrap VK.
- **Vault Key (VK)** — a random 256-bit AES key, the root of a household's
  vault. Stored only as *wrapped* copies: `wrap(VK, PK⊕PRF)` for the owner, plus
  the **escrow shares** for handover (§ HANDOVER.md). VK is what a recipient
  ultimately receives — never the passphrase.
- **Data Key (DK)** — a fresh random key per record (envelope encryption). The
  record payload is `AES-256-GCM(DK, plaintext)`; DK is stored as
  `wrap(DK, VK)`. Per-record keys mean granular sharing and cheap rotation:
  re-wrap DKs under a new VK without re-encrypting every payload.

### Why envelope encryption

- **Granular handover.** A recipient can be granted a *subset* of records (e.g.
  "medical + insurance, not financial") by handing over only those DKs.
- **Rotation without re-upload.** Rotating VK re-wraps N small DKs, not N large
  ciphertext blobs.
- **Blast-radius containment.** Compromise of one DK exposes one record.

## 3. What the server sees (and never sees)

| Stored server-side | Never stored server-side |
| --- | --- |
| Record ciphertext (AES-GCM) | Plaintext of any field |
| Wrapped data keys `wrap(DK, VK)` | Vault Key (VK) in usable form |
| Wrapped vault key `wrap(VK, …)` | Passphrase or Passphrase Key (PK) |
| Argon2id salt, KDF params | WebAuthn PRF output |
| Non-secret metadata (category, label, expiry, location *hint*) | Secret metadata (the actual location, the actual account #) |
| Hash-chained audit log | Anything that decrypts the above |

**Metadata discipline.** Labels and reminders are the leak risk in every
"encrypted" vault. HomeVault treats *category + coarse label + dates* as
non-secret (needed for reminders and the completeness score) and everything
identifying as secret. "Safe-deposit box" is a fine non-secret label; the bank,
box number, and key location are inside the encrypted payload.

## 4. Token-based access

The user's instinct ("maybe it comes token based since it would be an obvious
target") is right. HomeVault uses **short-lived, narrowly-scoped tokens** at
every layer:

- **Session tokens** are short-lived and bound to the device (WebAuthn). They
  authenticate *requests*, but hold no decryption power — a stolen session token
  still cannot decrypt anything without the client-side keys.
- **Capability tokens** gate individual sensitive reads. Viewing a
  high-sensitivity record (SSN, financial) mints a one-time, expiring capability
  after a step-up auth (re-tap passkey), and the view is logged. This is how
  "re-authenticate to reveal" is enforced server-observably without the server
  seeing plaintext.
- **Handover tokens** are issued to recipients during a handover ceremony,
  scoped to exactly the shares/records they are entitled to, single-use, and
  revocable until the point of no return.

## 5. Threat model

| Threat | Mitigation |
| --- | --- |
| Server/database breach | Zero-knowledge: attacker gets ciphertext + wrapped keys only |
| HomeVault insider / rogue support | No master key exists; escrow needs ≥ threshold parties |
| Stolen password | VK unwrap also requires device WebAuthn PRF factor |
| Stolen/mirrored device | Passkey is hardware-bound; passphrase still required; auto-lock + zeroize |
| Phishing | WebAuthn origin binding; no shared-secret to phish for the key |
| Coerced owner ("rubber-hose") | Optional duress passphrase → decoy vault + silent alert (Phase 3) |
| Premature/forged handover | Grace period + multi-party verification + owner veto window (HANDOVER.md) |
| Tampered audit trail | Append-only, hash-chained, anchored (Phase 3: periodic external anchor) |
| Malicious/compromised client code | SRI + strict CSP + reproducible builds; documented as Phase 2 hardening |
| AI exfiltration of secrets | AI boundary § 6 — redaction + explicit-consent-per-secret |

### Residual risks we are honest about

- **The client is trusted.** A zero-knowledge web app still ships code from the
  server; a malicious build could exfiltrate keys. Mitigations (CSP, SRI,
  reproducible builds, and ultimately a signed desktop/mobile client) reduce but
  do not eliminate this. It is the central hard problem of browser-based E2EE and
  must be stated plainly to users, not hidden.
- **Metadata is partially exposed** by necessity (for reminders). We minimize,
  we don't eliminate.

## 6. The AI boundary

AI search and coaching are core features, and the naive implementation ("send
the vault to the model") would destroy the security model. Rules:

1. AI runs over content the **client has already decrypted**, or over explicitly
   non-secret metadata. The server-side AI proxy never receives keys.
2. Before any secret leaves the device for the model, it passes a **redaction**
   pass (`lib/ai/redact.ts`): account numbers, SSNs, and passwords are replaced
   with typed placeholders (`«ACCOUNT_1»`) unless the user explicitly consents to
   send that specific value for that specific task.
3. Semantic search is **local-first**: embeddings are computed over decrypted
   content in the client and matched locally; only the user's natural-language
   *question* and non-secret snippets go to the model.
4. Every AI call that touched decrypted content is logged like any other access.

## 7. Recovery without a backdoor

Losing a passphrase must not mean losing the vault, but recovery must not become
the backdoor. HomeVault has exactly one recovery path, and it is the same
machinery as death/incapacity handover: the **escrow shares**. To recover, the
owner runs a reduced handover ceremony against *themselves* (identity re-proof +
threshold of trusted parties or a stored recovery share). There is deliberately
no "email us to reset" — that would reintroduce a single point of unilateral
access.
