import type { AccountRole } from "@/lib/data/schema";
import { humanizeLabel } from "@/lib/format";

/**
 * Single source of truth for authorization. The original app mixed `user.role`
 * (auth) and `userProfile.accountRole` (compliance) inconsistently; here we key
 * everything off `accountRole`.
 */

export const ADMIN_ROLES: readonly AccountRole[] = [
  "owner",
  "admin",
  "hr",
  "clinical_leadership",
];

export function isAdminRole(role: AccountRole | null | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export const PERMISSIONS = [
  "canManageUsers",
  "canManageDocuments",
  "canViewAllSOPs",
  "canViewHRFiles",
  "canManageHRFiles",
  "canViewCredentialing",
  "canManageCredentialing",
  "canViewInsurance",
  "canManageInsurance",
  "canViewOSHA",
  "canManageOSHA",
  "canViewSDS",
  "canManageSDS",
  "canUseChatbot",
  "canViewAuditLogs",
  "canManageRisk",
  // Controlled-substance paper logs. Two permissions, because filing a log and
  // reading one back are different acts: the person filing is holding the page
  // and has already read the chart numbers on it, while retrieving a filed
  // record months later reaches for patient identifiers with no page in hand.
  // So filing is wide — medical staff, who keep the logs — while opening
  // stops at the people who supervise them: owner, admin, clinical leadership
  // and managers. Staff can file a page they are holding, not go back for
  // somebody else's months later.
  "canFileControlledSubstanceLogs",
  "canOpenIdentifiedLogs",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const ROLE_PERMISSIONS: Record<AccountRole, Permission[]> = {
  owner: ALL,
  admin: ALL.filter(
    (p) => !["canManageInsurance", "canManageHRFiles"].includes(p),
  ),
  hr: [
    "canViewHRFiles",
    "canManageHRFiles",
    "canViewCredentialing",
    "canManageCredentialing",
    "canViewAllSOPs",
    "canViewSDS",
    "canUseChatbot",
  ],
  clinical_leadership: [
    "canFileControlledSubstanceLogs",
    "canOpenIdentifiedLogs",
    "canViewCredentialing",
    "canManageCredentialing",
    "canViewAllSOPs",
    "canViewSDS",
    "canViewOSHA",
    "canUseChatbot",
  ],
  // MAs and nurses keep the controlled-substance logs, so they file them. They
  // are not given canOpenIdentifiedLogs: filing a page you are holding is not
  // the same as retrieving other people's pages months later.
  manager: ["canViewAllSOPs", "canViewCredentialing", "canViewSDS", "canUseChatbot", "canFileControlledSubstanceLogs", "canOpenIdentifiedLogs"],
  // Providers, MAs and nurses. They keep the controlled-substance logs, so they
  // file them — but filing a page you are holding is not the same as going back
  // for someone else's months later, so no canOpenIdentifiedLogs.
  medical_staff: ["canViewAllSOPs", "canViewSDS", "canUseChatbot", "canFileControlledSubstanceLogs"],
  // Everyone else at this level: reception, billing, operations.
  staff: ["canViewSDS", "canUseChatbot"],
  contractor: ["canViewSDS", "canUseChatbot"],
  read_only: [],
  inactive: [],
};

export function hasPermission(
  role: AccountRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function roleLabel(role: AccountRole | null | undefined): string {
  if (!role) return "—";
  return humanizeLabel(role); // "hr" → "HR", "clinical_leadership" → "Clinical Leadership"
}
