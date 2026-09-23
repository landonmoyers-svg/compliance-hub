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
  // and has already read the chart numbers on it, while everyone else only
  // needs the de-identified entries the Hub keeps. Opening a filed record
  // means fetching a document that identifies patients.
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
  return humanizeLabel(role); // "hr" → "HR", "clinical_leadership" → "Clinical Leadership"
}
