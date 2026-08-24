/**
 * Household roles.
 *
 * Extracted so the access rules in `access.ts` and the data seam can share one
 * definition rather than each restating the union.
 */
export type MemberRole = "owner" | "co_owner" | "viewer";

export const MEMBER_ROLES: MemberRole[] = ["owner", "co_owner", "viewer"];

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Owner",
  co_owner: "Co-owner",
  viewer: "Viewer",
};

/**
 * What each role means, in the household's terms rather than ours.
 *
 * The viewer description is deliberately explicit about being read-only,
 * because the role previously claimed to be restricted while granting full
 * write access — a label that lies about permissions is worse than no label.
 */
export const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  owner: "Full access, and can add or remove people.",
  co_owner: "Full access to everything, and can invite others.",
  viewer: "Can find and read records, but cannot change or delete anything.",
};

/**
 * The sensible default when someone joins a household.
 *
 * `co_owner`, not `viewer`: an invited adult partner is the whole point of a
 * shared household vault, and the everyday failsafe — the other owner already
 * has their own key — only works if they actually have full access.
 */
export const DEFAULT_INVITE_ROLE: MemberRole = "co_owner";
