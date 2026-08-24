# HomeVault — Estate Handover

> "It's a repository for and facilitates handing over the keys to the kingdom …
> especially useful for life planning, wills, estate planning. If someone passes
> away there could be a verification process for the handover."

Handover is HomeVault's reason to exist. This document defines the **handover
engine**: a single state machine that supports **three configurable trigger
models**, chosen per household (and per sensitivity tier within a household).

## 0. The cryptographic foundation: escrow, not a master key

None of the three models is allowed to work by HomeVault holding a copy of the
vault key. Instead, at enrollment the **Vault Key (VK)** is split with
**Shamir's Secret Sharing (SSS)** into `n` shares with threshold `t` (a `t`-of-
`n` scheme). Shares are distributed so that:

- No single party — including HomeVault — ever holds `t` shares.
- The **release conditions** of the chosen model are exactly the conditions
  under which enough shares become available to reconstruct VK (or a
  recipient-specific re-wrapped subset key).

Typical layout (`2-of-3`, dual-key + trustee flavor):

| Share | Holder | Released when |
| --- | --- | --- |
| Share A | Recipient 1 (e.g. spouse) | They complete their half of the ceremony |
| Share B | Recipient 2 (e.g. adult child / co-executor) | They complete their half |
| Share C | Trustee/lawyer **or** HomeVault escrow | Model-specific condition (legal proof, or timer) |

Because it's `2-of-3`, **any two** of the three unlock — resilient to one holder
being unavailable, while still requiring more than one party. Households pick
`n` and `t`; the UI defaults to `2-of-3` and warns about the trade-offs of `1-of-
n` (too easy) and `n-of-n` (too fragile).

Shares are themselves encrypted to each holder's public key, so "HomeVault holds
Share C" still means HomeVault cannot read it — only the designated holder can.

## 1. The state machine

All three models drive the **same** finite state machine; they differ only in
what advances the `ARMED → PENDING` transition.

```
        configure                arm plan
DRAFT ──────────► CONFIGURED ──────────────► ARMED
                                               │
              trigger condition met (model-specific)
                                               ▼
                                           PENDING ──────────────┐
                                               │                 │ owner "I'm alive" /
                                    grace + verification          │ veto within window
                                               │                 ▼
                                               ▼             CANCELLED ──► ARMED
                                          VERIFIED
                                               │
                                     shares released to recipients
                                               ▼
                                          RELEASED (access granted, scoped)
                                               │
                                       recipients confirm receipt
                                               ▼
                                         COMPLETED (owner access optionally revoked)
```

Guarantees baked into the machine:

- **Grace + veto window.** `PENDING → VERIFIED` never happens instantly. A
  configurable grace period (default 7 days) with escalating owner notifications
  lets a living owner cancel a false trigger. This is the safety catch against a
  premature or malicious handover.
- **Point of no return is explicit.** Until `RELEASED`, everything is
  reversible. After `RELEASED`, recipients hold real key material; the machine
  records it and cannot "un-share" a secret already revealed (it can only revoke
  future access and force rotation).
- **Every transition is logged** to the hash-chained audit trail and pushed to
  the owner and all named parties. Nothing about a handover is silent.

## 2. The three models

Configuration lives in `lib/domain/handover.ts` as a `HandoverPlan` with a
`trigger` discriminated union. A household may also set **different models per
sensitivity tier** (e.g. dead-man's-switch for "practical" docs like utilities,
but dual-key + legal proof for financial/estate).

### Model A — Dual-key + trustee (`trigger.kind = "dual_key"`)

Two (or more) designated parties must **combine their keys** to advance the
handover; optionally a lawyer/trustee is one of the required holders.

- `ARMED → PENDING`: any authorized initiator (a recipient, the trustee) opens a
  ceremony.
- `PENDING → VERIFIED`: **`t` of the `n` key-holders** each authenticate and
  contribute their share within the ceremony window. The trustee can be made a
  *mandatory* holder (`requiredHolders`) so no transfer happens without them.
- Strength: no time assumption, no single point of compromise, legally friendly
  (a named trustee gates it).
- Cost: requires the holders to actively coordinate — which is the point.

### Model B — Dead-man's switch (`trigger.kind = "inactivity"`)

Time-based. If the owner does not **check in** for `inactivityDays`, the plan
advances automatically.

- `ARMED → PENDING`: owner misses check-ins past `inactivityDays` (default 90),
  after a ladder of reminders (email, SMS, push, then named "alive?" pokes to
  emergency contacts).
- `PENDING → VERIFIED`: the **grace period** (default 30 days for this model,
  longer than the others precisely because the trigger is weaker) elapses with
  no owner response.
- Strength: works even if no one initiates; good for a solo owner.
- Weakness: weakest verification (absence ≠ death). Mitigated with a long grace,
  aggressive multi-channel nudges, and by pairing it with human confirmation
  (`requireContactConfirmation`) before release.

### Model C — Legal-verification handover (`trigger.kind = "legal_proof"`)

Handover requires **proof of the event** — a death certificate and/or identity
verification — reviewed by a trustee/executor before access is granted.

- `ARMED → PENDING`: a recipient/executor files a claim and uploads evidence
  (death certificate, court letter of appointment).
- `PENDING → VERIFIED`: a **reviewer** — the named trustee, and/or a HomeVault
  verification step, and/or a third-party ID-verification vendor — approves. The
  reviewer role is itself a key-holder, so approval and share-release are the
  same act (no "approve" that isn't cryptographically enforced).
- Strength: most legally grounded; maps to how executors actually operate.
- Cost: needs a reviewer and a document-verification integration; slowest.

### Configurable composition

Real plans combine these. The engine supports **AND/OR composition** of triggers
per tier, e.g.:

> *Financial + estate tier:* `legal_proof` **AND** `dual_key` (need both a death
> certificate **and** two key-holders) — belt and suspenders for the crown
> jewels.
>
> *Practical tier* (utilities, subscriptions, device PINs): `inactivity`
> (90 days) **OR** `dual_key` — so the family isn't locked out of the Wi-Fi
> password waiting on probate.

## 3. What a recipient receives

Recipients never receive the owner's passphrase. On `RELEASED`, a recipient
gets:

1. A **handover token** scoped to exactly the records/tiers they're entitled to.
2. The **reconstructed subset key** (VK, or a re-wrapped tier key) delivered to
   *their* client and immediately re-wrapped under *their* own PK⊕passkey — so
   from that moment the recipient holds the data under their own zero-knowledge
   keys, and HomeVault still can't read it.
3. A **guided handover packet**: the coach walks them through what they now have
   access to and the immediate next steps (notify institutions, file with the
   court, locate physical items via the stored location hints).

Scoping matters: an executor might get financial + legal; a spouse gets
everything; a specific child gets only the medical directives. This is exactly
why per-record DKs exist.

## 4. Safeguards summary

- **No instant handover** — grace + veto on every path.
- **No single party** — threshold `t ≥ 2` enforced for high tiers.
- **No silent handover** — every step notified and logged.
- **No HomeVault backdoor** — HomeVault's own share is never enough alone.
- **Owner override** until `RELEASED`; forced rotation available after.
- **Regular "fire-drill"** — the coach periodically nudges the owner to
  dry-run a handover (dual-key ceremony in test mode) so it actually works when
  needed, and so key-holders' contact info stays fresh.

## 5. Where this lives in code

- `lib/domain/handover.ts` — `HandoverPlan`, `HandoverTrigger` union, the
  `HandoverState` enum, and pure `evaluate()` / `advance()` transition
  functions (unit-testable, no I/O).
- `supabase/migrations/0000_homevault_baseline.sql` — `handover_plans`,
  `handover_shares`, `handover_events`, `handover_recipients` tables and the RLS
  that lets recipients see only their own share rows.
- `app/(app)/handover/` — the configuration UI and the ceremony runner.
