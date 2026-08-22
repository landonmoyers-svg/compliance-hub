import type { SensitivityTier } from "./categories";

/**
 * The estate-handover engine. One finite state machine drives all three trigger
 * models; they differ only in what advances ARMED → PENDING. See docs/HANDOVER.md.
 *
 * This module is pure and I/O-free so it can be unit-tested and reasoned about.
 * Persistence (Supabase tables) and cryptography (Shamir shares) live elsewhere.
 */

export type HandoverState =
  | "DRAFT" // being configured
  | "CONFIGURED" // valid plan, not yet armed
  | "ARMED" // live; watching for the trigger
  | "PENDING" // trigger fired; grace/verification window running
  | "VERIFIED" // conditions satisfied; ready to release
  | "RELEASED" // shares released to recipients (point of no return)
  | "COMPLETED" // recipients confirmed; owner access optionally revoked
  | "CANCELLED"; // owner vetoed / false alarm → returns to ARMED

// ---------------------------------------------------------------------------
// Trigger models (discriminated union) — a plan composes one or more.
// ---------------------------------------------------------------------------

/** Model A — two or more key-holders must combine shares; a trustee may be mandatory. */
export interface DualKeyTrigger {
  kind: "dual_key";
  /** Total shares distributed. */
  shareCount: number;
  /** Shares required to reconstruct (t-of-n). Must be ≥ 2 for critical tiers. */
  threshold: number;
  /** Holder ids that MUST participate regardless of threshold (e.g. the trustee). */
  requiredHolders: string[];
}

/** Model B — dead-man's switch: advances if the owner stops checking in. */
export interface InactivityTrigger {
  kind: "inactivity";
  inactivityDays: number;
  /** Require a human contact to confirm before release (mitigates weak verification). */
  requireContactConfirmation: boolean;
}

/** Model C — legal proof (death certificate / court appointment) reviewed by a trustee. */
export interface LegalProofTrigger {
  kind: "legal_proof";
  /** Holder ids who may approve the filed evidence (the reviewer(s)). */
  reviewerHolders: string[];
  /** Also run a third-party identity/document-verification vendor. */
  requireVendorVerification: boolean;
}

export type HandoverTrigger = DualKeyTrigger | InactivityTrigger | LegalProofTrigger;

/** Triggers compose: satisfy ANY one, or require ALL, before PENDING → VERIFIED. */
export type TriggerCombine = "any" | "all";

export interface HandoverPlan {
  id: string;
  householdId: string;
  /** Which sensitivity tiers this plan governs (a household may run different plans per tier). */
  tiers: SensitivityTier[];
  triggers: HandoverTrigger[];
  combine: TriggerCombine;
  /** Grace/veto window (days) between PENDING and VERIFIED. Never zero. */
  graceDays: number;
  recipientIds: string[];
  state: HandoverState;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface PlanIssue {
  level: "error" | "warning";
  message: string;
}

const CRITICAL_TIERS: SensitivityTier[] = ["critical"];

/** Static validation of a plan before it can be armed. Returns issues; empty errors = armable. */
export function validatePlan(plan: HandoverPlan): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const governsCritical = plan.tiers.some((t) => CRITICAL_TIERS.includes(t));

  if (plan.triggers.length === 0) {
    issues.push({ level: "error", message: "A plan needs at least one trigger." });
  }
  if (plan.recipientIds.length === 0) {
    issues.push({ level: "error", message: "A plan needs at least one designated recipient." });
  }
  if (plan.graceDays <= 0) {
    issues.push({ level: "error", message: "The grace/veto window must be greater than zero." });
  }

  for (const t of plan.triggers) {
    if (t.kind === "dual_key") {
      if (t.threshold < 1 || t.threshold > t.shareCount) {
        issues.push({ level: "error", message: "Dual-key threshold must be between 1 and the share count." });
      }
      if (governsCritical && t.threshold < 2) {
        issues.push({
          level: "error",
          message: "Critical-tier plans require a dual-key threshold of at least 2 (no single party).",
        });
      }
      if (t.requiredHolders.length > t.threshold) {
        issues.push({
          level: "warning",
          message: "More mandatory holders than the threshold — effectively raises the real threshold.",
        });
      }
    }
    if (t.kind === "inactivity") {
      if (t.inactivityDays < 7) {
        issues.push({ level: "warning", message: "A very short inactivity window risks false triggers." });
      }
      if (governsCritical && !t.requireContactConfirmation) {
        issues.push({
          level: "warning",
          message: "Critical-tier inactivity handover without human confirmation is high-risk.",
        });
      }
    }
    if (t.kind === "legal_proof" && t.reviewerHolders.length === 0) {
      issues.push({ level: "error", message: "Legal-proof handover needs at least one reviewer." });
    }
  }

  if (governsCritical && plan.graceDays < 7) {
    issues.push({ level: "warning", message: "Consider a grace window of at least 7 days for critical tiers." });
  }
  return issues;
}

export function isArmable(plan: HandoverPlan): boolean {
  return validatePlan(plan).every((i) => i.level !== "error");
}

// ---------------------------------------------------------------------------
// Trigger evaluation — is each model's precondition met right now?
// ---------------------------------------------------------------------------

/** Live signals the FSM evaluates against (supplied by the persistence layer). */
export interface HandoverSignals {
  now: number;
  /** Last owner check-in (ms epoch) — for the inactivity model. */
  lastOwnerCheckInAt: number;
  /** Distinct holder ids who have contributed a valid share in the open ceremony. */
  contributingHolders: string[];
  /** Whether the filed legal evidence has been approved (reviewer + optional vendor). */
  legalEvidenceApproved: boolean;
  /** Whether a required human contact has confirmed the event. */
  contactConfirmed: boolean;
}

export function triggerMet(t: HandoverTrigger, s: HandoverSignals): boolean {
  switch (t.kind) {
    case "dual_key": {
      const holders = new Set(s.contributingHolders);
      const enough = holders.size >= t.threshold;
      const mandatory = t.requiredHolders.every((h) => holders.has(h));
      return enough && mandatory;
    }
    case "inactivity": {
      const idleMs = s.now - s.lastOwnerCheckInAt;
      const elapsed = idleMs >= t.inactivityDays * 24 * 60 * 60 * 1000;
      return elapsed && (!t.requireContactConfirmation || s.contactConfirmed);
    }
    case "legal_proof":
      return s.legalEvidenceApproved;
  }
}

/** Whether the plan's composed triggers are satisfied (any/all). */
export function triggersSatisfied(plan: HandoverPlan, s: HandoverSignals): boolean {
  if (plan.triggers.length === 0) return false;
  return plan.combine === "all"
    ? plan.triggers.every((t) => triggerMet(t, s))
    : plan.triggers.some((t) => triggerMet(t, s));
}

// ---------------------------------------------------------------------------
// State transitions — the only legal way to move the machine.
// ---------------------------------------------------------------------------

export type HandoverAction =
  | { type: "configure" }
  | { type: "arm" }
  | { type: "trigger" } // trigger precondition detected → PENDING
  | { type: "owner_veto" } // owner says "I'm alive / stop" during PENDING
  | { type: "verify" } // grace elapsed + triggers satisfied → VERIFIED
  | { type: "release" } // shares handed to recipients (point of no return)
  | { type: "confirm_receipt" }; // recipients confirmed → COMPLETED

export interface TransitionContext {
  plan: HandoverPlan;
  signals: HandoverSignals;
  /** When PENDING started, for grace accounting. */
  pendingSince?: number;
}

export interface TransitionResult {
  ok: boolean;
  state: HandoverState;
  reason?: string;
}

function reject(state: HandoverState, reason: string): TransitionResult {
  return { ok: false, state, reason };
}

/**
 * Pure transition function. Enforces the invariants that make handover safe:
 * no arming an invalid plan, no instant verification (grace must elapse), and
 * no verification unless the triggers are actually satisfied.
 */
export function transition(ctx: TransitionContext, action: HandoverAction): TransitionResult {
  const { plan, signals, pendingSince } = ctx;
  const s = plan.state;

  switch (action.type) {
    case "configure":
      return s === "DRAFT" || s === "CONFIGURED"
        ? { ok: true, state: "CONFIGURED" }
        : reject(s, "Can only (re)configure from DRAFT/CONFIGURED.");

    case "arm":
      if (s !== "CONFIGURED" && s !== "CANCELLED") return reject(s, "Arm only from CONFIGURED or CANCELLED.");
      if (!isArmable(plan)) return reject(s, "Plan has blocking validation errors.");
      return { ok: true, state: "ARMED" };

    case "trigger":
      if (s !== "ARMED") return reject(s, "Trigger only from ARMED.");
      if (!triggersSatisfied(plan, signals)) return reject(s, "Trigger preconditions not met.");
      return { ok: true, state: "PENDING" };

    case "owner_veto":
      // The safety catch: a living owner can always cancel during PENDING.
      return s === "PENDING" ? { ok: true, state: "CANCELLED" } : reject(s, "Veto only during PENDING.");

    case "verify": {
      if (s !== "PENDING") return reject(s, "Verify only from PENDING.");
      if (pendingSince == null) return reject(s, "Missing pendingSince for grace accounting.");
      const graceMs = plan.graceDays * 24 * 60 * 60 * 1000;
      if (signals.now - pendingSince < graceMs) return reject(s, "Grace/veto window has not elapsed.");
      if (!triggersSatisfied(plan, signals)) return reject(s, "Triggers no longer satisfied.");
      return { ok: true, state: "VERIFIED" };
    }

    case "release":
      // Point of no return — recipients receive real key material.
      return s === "VERIFIED" ? { ok: true, state: "RELEASED" } : reject(s, "Release only from VERIFIED.");

    case "confirm_receipt":
      return s === "RELEASED" ? { ok: true, state: "COMPLETED" } : reject(s, "Confirm only from RELEASED.");
  }
}
