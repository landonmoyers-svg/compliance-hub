import type { AccountRole } from "@/lib/data/schema";

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
    "canViewCredentialing",
    "canManageCredentialing",
    "canViewAllSOPs",
    "canViewSDS",
    "canViewOSHA",
    "canUseChatbot",
  ],
  manager: ["canViewAllSOPs", "canViewCredentialing", "canViewSDS", "canUseChatbot"],
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
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
