import type { MemberRole } from "./members";

/**
 * Who can get in, and what happens when they can't.
 *
 * The single most important thing about this product's access model, and the
 * thing the handover machinery makes easy to lose sight of:
 *
 *   **The people who own the vault can open it. Always. Without ceremony.**
 *
 * Every threshold, trustee, grace window and dual-key rule exists for exactly
 * one situation — when the people who could grant access are no longer able to.
 * None of it applies to an owner opening their own vault on a Tuesday. If a
 * household ever has to satisfy a quorum to read their own insurance policy,
 * the design has failed.
 *
 * ## The failsafe ladder
 *
 * These are ordered by how much has gone wrong, and the first rungs matter far
 * more than the last ones because they cover the situations that actually
 * happen. The elaborate machinery at the bottom is for the rare case, and
 * describing it first — as the docs previously did — makes the product sound
 * like a legal instrument rather than a filing cabinet.
 */

export type FailsafeKey = "co-owner" | "recovery-code" | "escrow" | "inactivity" | "legal-proof";

export interface Failsafe {
  key: FailsafeKey;
  /** The situation this exists for, in the household's words. */
  situation: string;
  /** What actually happens. */
  mechanism: string;
  /** Ceremony required: none, some, or full. Lower is better. */
  friction: "none" | "some" | "full";
  /** Whether this one is available today or is still to be built. */
  status: "built" | "planned";
}

export const FAILSAFES: Failsafe[] = [
  {
    key: "co-owner",
    situation: "One of us is ill, travelling, or simply not around.",
    mechanism:
      "The other owner already has their own key and opens the vault normally. Nothing is triggered, nobody is notified, and no process starts — because nothing has gone wrong that needs one.",
    friction: "none",
    status: "built",
  },
  {
    key: "recovery-code",
    situation: "I've forgotten my passphrase, or I cleared this browser.",
    mechanism:
      "The printed recovery code opens a second wrapped copy of the vault key, and you set a new passphrase. Your records are never re-encrypted — only the key that opens them is re-wrapped.",
    friction: "none",
    status: "built",
  },
  {
    key: "escrow",
    situation: "Nobody who can grant access is able to.",
    mechanism:
      "The vault key was split at setup into shares held by people you chose. A threshold of them — never one person alone, including us — reconstructs it.",
    friction: "full",
    status: "planned",
  },
  {
    key: "inactivity",
    situation: "Something happened and nobody knows to start the process.",
    mechanism:
      "If you stop checking in for a period you set, an escalating series of reminders runs, and only then does a long grace window begin. You can stop it at any point.",
    friction: "full",
    status: "planned",
  },
  {
    key: "legal-proof",
    situation: "There is a death certificate or a court appointment.",
    mechanism:
      "A recipient files the evidence; a trustee you named reviews it. The grace window and your veto still apply until the moment of release.",
    friction: "full",
    status: "planned",
  },
];

export const FAILSAFE_BY_KEY: Record<FailsafeKey, Failsafe> = Object.fromEntries(
  FAILSAFES.map((f) => [f.key, f]),
) as Record<FailsafeKey, Failsafe>;

/**
 * Failsafes that cover the everyday cases without any process at all.
 *
 * A household should be able to see that the two situations they are actually
 * likely to hit — a partner being unavailable, and forgetting a passphrase —
 * need no ceremony whatsoever.
 */
export function everydayFailsafes(): Failsafe[] {
  return FAILSAFES.filter((f) => f.friction === "none");
}

/** The handover machinery proper, for when nobody can grant access. */
export function handoverFailsafes(): Failsafe[] {
  return FAILSAFES.filter((f) => f.friction === "full");
}

// ---------------------------------------------------------------------------
// What a member may do
// ---------------------------------------------------------------------------

export type Capability = "read" | "write" | "invite" | "configure-handover" | "remove-member";

/**
 * Capabilities by role.
 *
 * Owners and co-owners are deliberately equal on reading and writing: this is a
 * household, not an org chart, and a design where one partner can read
 * something the other cannot would defeat the point of keeping it here.
 *
 * They differ only on the actions that change who else has access, which is
 * where a mistake is hard to undo.
 */
const CAPABILITIES: Record<MemberRole, Capability[]> = {
  owner: ["read", "write", "invite", "configure-handover", "remove-member"],
  co_owner: ["read", "write", "invite", "configure-handover"],
  // Read-only. Intended for someone who should be able to FIND things — an
  // adult child, a helper — without being able to change or delete them.
  viewer: ["read"],
};

export function can(role: MemberRole, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}

/**
 * Whether this role may open the vault at all.
 *
 * True for every role, and stated as its own function so the answer is
 * impossible to miss: membership *is* access. Restrictions in this file are
 * about changing things, never about reading your own household's records.
 */
export function canOpenVault(role: MemberRole): boolean {
  return can(role, "read");
}
