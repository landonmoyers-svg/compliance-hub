import {
  Activity,
  AlertTriangle,
  ListChecks,
  Award,
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  DatabaseBackup,
  Handshake,
  DollarSign,
  FileText,
  FlaskConical,
  FolderLock,
  GraduationCap,
  Heart,
  Inbox,
  Landmark,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Network,
  Package,
  Shield,
  Sparkles,
  Star,
  Upload,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden from non-admins. */
  adminOnly?: boolean;
  /** Emphasized (e.g. Setup Concierge) with a gradient highlight. */
  highlight?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Grouped sidebar nav, ported verbatim from the source. A group renders only
 * when at least one of its items is visible to the current user (matches the
 * source app's HR-section behavior, applied consistently to every group).
 */
export const NAV_GROUPS: NavGroup[] = [
  // 1. Command center + daily entry points — what a user lands on first.
  {
    label: "Overview",
    items: [
      { label: "Home", href: "/", icon: LayoutDashboard },
      { label: "Daily Priorities", href: "/chief-of-staff", icon: Sparkles, adminOnly: true, highlight: true },
      { label: "Compliance Calendar", href: "/compliance-calendar", icon: CalendarDays, adminOnly: true },
      { label: "Setup Guide", href: "/compliance-concierge", icon: Sparkles, adminOnly: true, highlight: true },
    ],
  },
  // 2. Personal, daily-use tools every signed-in user has.
  {
    label: "My Workspace",
    items: [
      { label: "My Portal", href: "/staff-portal", icon: UserCircle },
      { label: "Policy Q&A", href: "/policy-assistant", icon: MessageSquare },
    ],
  },
  // 3. Core compliance every employee touches.
  {
    label: "Training & Credentials",
    items: [
      { label: "Training", href: "/training", icon: GraduationCap },
      { label: "Credentials", href: "/credentials", icon: BadgeCheck },
      { label: "Continuing Education", href: "/continuing-education", icon: GraduationCap, adminOnly: true },
      { label: "Payer Enrollment", href: "/payer-enrollment", icon: Handshake, adminOnly: true },
      { label: "Competency Tracker", href: "/competency-tracker", icon: Award, adminOnly: true },
    ],
  },
  {
    label: "Documents & Forms",
    items: [
      { label: "SOP Library", href: "/sop-library", icon: FileText, adminOnly: true },
      { label: "Regulatory Sources", href: "/regulatory-sources", icon: BookOpen, adminOnly: true },
      { label: "Forms", href: "/fillable-documents", icon: Layers, adminOnly: true },
      { label: "Missing Forms", href: "/form-gap-matrix", icon: ClipboardCheck, adminOnly: true },
      { label: "Policy Attestation", href: "/policy-attestation", icon: CheckCircle2, adminOnly: true },
      { label: "Document Intake", href: "/document-intake", icon: Inbox, adminOnly: true },
      { label: "Bulk Upload", href: "/bulk-upload", icon: Upload, adminOnly: true },
    ],
  },
  // 5. Compliance-officer risk functions: incidents, assessments, audits, third-party.
  {
    label: "Risk & Compliance",
    items: [
      { label: "Incidents & Corrective Actions", href: "/incidents", icon: Inbox },
      { label: "Security Risk Assessment", href: "/security-risk-assessment", icon: Shield, adminOnly: true },
      { label: "Audits & Mock Surveys", href: "/audits", icon: ClipboardCheck, adminOnly: true },
      { label: "Exclusion Screening", href: "/exclusion-screening", icon: CheckCircle2, adminOnly: true },
      { label: "Vendor Management", href: "/vendor-management", icon: Building2, adminOnly: true },
      { label: "Insurance Vault", href: "/insurance-vault", icon: Shield, adminOnly: true },
      { label: "Business Records", href: "/business-records", icon: Landmark, adminOnly: true },
    ],
  },
  // 6. Physical / clinical safety and assets.
  {
    label: "Safety & Environment",
    items: [
      { label: "OSHA Tracker", href: "/osha-tracker", icon: ClipboardCheck, adminOnly: true },
      { label: "SDS Library", href: "/sds-library", icon: FlaskConical },
      { label: "Controlled Substances", href: "/controlled-substances", icon: FlaskConical, adminOnly: true },
      { label: "Emergency Prep", href: "/emergency-preparedness", icon: AlertTriangle, adminOnly: true },
      { label: "Inventory", href: "/inventory", icon: Package },
    ],
  },
  {
    label: "HR & Payroll",
    items: [
      { label: "Employees", href: "/hr/employees", icon: Users, adminOnly: true },
      { label: "Onboarding & Offboarding", href: "/employee-lifecycle", icon: ListChecks, adminOnly: true },
      { label: "Employee Vault", href: "/employee-vault", icon: FolderLock, adminOnly: true },
      { label: "Org Chart & Roles", href: "/org-chart", icon: Network, adminOnly: true },
      { label: "Payroll", href: "/hr/payroll", icon: DollarSign, adminOnly: true },
      { label: "Performance", href: "/hr/performance", icon: Star, adminOnly: true },
      { label: "Benefits", href: "/hr/benefits", icon: Heart, adminOnly: true },
      { label: "Disciplinary", href: "/hr/disciplinary", icon: AlertTriangle, adminOnly: true },
    ],
  },
  // 8. System administration + reference — least-frequent, so last.
  {
    label: "Admin & Resources",
    items: [
      { label: "User Management", href: "/user-management", icon: Users, adminOnly: true },
      { label: "Role Permissions", href: "/access-matrix", icon: Shield, adminOnly: true },
      { label: "Settings", href: "/settings", icon: Building2, adminOnly: true },
      { label: "Audit Trail", href: "/audit-trail", icon: Shield, adminOnly: true },
      { label: "Daily Activity Log", href: "/activity-log", icon: Activity, adminOnly: true },
      { label: "Data Backup", href: "/backup", icon: DatabaseBackup, adminOnly: true },
    ],
  },
];

/** Visible groups/items for a user, dropping admin-only entries and empty groups. */
export function visibleNav(isAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isAdmin || !item.adminOnly),
  })).filter((group) => group.items.length > 0);
}

/* --------------------- layered page visibility --------------------- */

import type { AccountRole } from "@/lib/data/schema";

// Roles that can be granted page access (inactive gets nothing).
export const PRIVILEGED_ROLES = ["owner", "admin", "hr", "clinical_leadership"] as const;
export const SELECTABLE_ROLES: AccountRole[] = ["owner", "admin", "hr", "clinical_leadership", "manager", "staff", "contractor", "read_only"];

export interface PageDef { href: string; label: string; group: string; adminOnly: boolean; }

/** Flat list of every nav page — used by the admin page-access matrix. */
export function allPages(): PageDef[] {
  return NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, group: g.label, adminOnly: !!i.adminOnly })));
}

/** The roles allowed to access a page: org override if set, else code default. */
export function allowedRolesFor(href: string, adminOnly: boolean, pageRoles: Record<string, string[]>): string[] {
  const cfg = pageRoles[href];
  if (cfg !== undefined) return cfg; // explicit override wins, incl. [] = locked to no roles
  return adminOnly ? [...PRIVILEGED_ROLES] : (SELECTABLE_ROLES as string[]);
}

/** Match a pathname to its nav item (exact, else longest href prefix; ignores "/"). */
export function findNavItem(pathname: string): NavItem | null {
  const items = NAV_GROUPS.flatMap((g) => g.items);
  const exact = items.find((i) => i.href === pathname);
  if (exact) return exact;
  return items
    .filter((i) => i.href !== "/" && pathname.startsWith(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

export interface VisibilityCtx {
  role: AccountRole | null | undefined;
  pageRoles: Record<string, string[]>;
  disabledPages: string[];
  hiddenPages: string[];
  pageOrder: string[];
  groupOrder?: string[];
}

/** Sensitive full-page modules that aren't in the sidebar nav but must still be
 *  gated to privileged roles by the route guard. */
export const EXTRA_PRIVILEGED_PATHS = [
  "/employee-vault",
  "/document-migration",
  // Consolidated into tabbed hubs (no sidebar entry, still admin-only routes):
  "/executive-dashboard",
  "/program-effectiveness",
  "/reports",
  "/risk-management",
  "/breach-assessment",
  "/training-academy",
  "/official-sources",
  "/hr-hub",
];

/** Pages the Owner uses to manage access itself. These can never be disabled or
 *  role-restricted in the UI, so there is always a way back in. */
export const RECOVERY_PATHS = ["/settings", "/access-matrix", "/user-management"];

/** Enforcement: can this role open this path? (Command Center is always allowed.) */
export function canAccessPath(pathname: string, role: AccountRole | null | undefined, pageRoles: Record<string, string[]>, disabledPages: string[]): boolean {
  if (pathname === "/") return true;
  if (!role || role === "inactive") return false;
  // The Owner can never be locked out — blocking the top role only creates
  // lock-out risk, so org-level page toggles never apply to the owner.
  if (role === "owner") return true;
  const item = findNavItem(pathname);
  if (!item) {
    // Pages absent from the nav map are open by default, except explicitly-gated modules.
    if (EXTRA_PRIVILEGED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return (PRIVILEGED_ROLES as readonly string[]).includes(role);
    }
    return true;
  }
  if (disabledPages.includes(item.href)) return false;
  return allowedRolesFor(item.href, !!item.adminOnly, pageRoles).includes(role);
}

/**
 * The sidebar a user actually sees: pages their ROLE allows ∩ pages the ORG
 * enabled, then their personal hide/reorder. The grouped structure is always
 * preserved; personal preferences reorder the groups (groupOrder) and the items
 * within each group (pageOrder), and hide individual items (hiddenPages).
 * Sorts are stable, so anything the user hasn't explicitly moved keeps its
 * default position.
 */
export function resolveNav(ctx: VisibilityCtx): NavGroup[] {
  const { role } = ctx;
  const isOwner = role === "owner";
  const accessible = (item: NavItem) =>
    !!role && role !== "inactive" &&
    // The Owner sees every page (minus their own personal hides) so a bad org
    // toggle can never empty their sidebar or hide the pages that fix it.
    (isOwner || (
      !ctx.disabledPages.includes(item.href) &&
      allowedRolesFor(item.href, !!item.adminOnly, ctx.pageRoles).includes(role)
    )) &&
    !ctx.hiddenPages.includes(item.href);

  let groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(accessible) }))
    .filter((g) => g.items.length > 0);

  // Personal item order within each group.
  if (ctx.pageOrder && ctx.pageOrder.length > 0) {
    const rank = new Map(ctx.pageOrder.map((h, i) => [h, i] as const));
    const at = (h: string) => (rank.has(h) ? (rank.get(h) as number) : Number.POSITIVE_INFINITY);
    groups = groups.map((g) => ({ ...g, items: [...g.items].sort((a, b) => at(a.href) - at(b.href)) }));
  }

  // Personal group order.
  if (ctx.groupOrder && ctx.groupOrder.length > 0) {
    const rank = new Map(ctx.groupOrder.map((l, i) => [l, i] as const));
    const at = (l: string) => (rank.has(l) ? (rank.get(l) as number) : Number.POSITIVE_INFINITY);
    groups = [...groups].sort((a, b) => at(a.label) - at(b.label));
  }

  return groups;
}
