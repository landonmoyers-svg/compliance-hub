import {
  Activity,
  AlertTriangle,
  Award,
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DatabaseBackup,
  DollarSign,
  FileText,
  FlaskConical,
  GraduationCap,
  Heart,
  Inbox,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Network,
  Package,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Umbrella,
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
  {
    label: "My Workspace",
    items: [
      { label: "My Portal", href: "/staff-portal", icon: UserCircle },
      { label: "SOP Assistant", href: "/policy-assistant", icon: MessageSquare },
      { label: "Time Clock", href: "/hr/timeclock", icon: Clock },
      { label: "Time Off", href: "/hr/time-off", icon: Umbrella },
    ],
  },
  {
    label: "Overview",
    items: [
      { label: "Command Center", href: "/", icon: LayoutDashboard },
      { label: "Chief of Staff", href: "/chief-of-staff", icon: Sparkles, adminOnly: true, highlight: true },
      {
        label: "Setup Concierge",
        href: "/compliance-concierge",
        icon: Sparkles,
        adminOnly: true,
        highlight: true,
      },
      { label: "Executive Dashboard", href: "/executive-dashboard", icon: TrendingUp, adminOnly: true },
      { label: "Program Effectiveness", href: "/program-effectiveness", icon: ShieldCheck, adminOnly: true },
      { label: "Compliance Calendar", href: "/compliance-calendar", icon: CalendarDays, adminOnly: true },
      { label: "Reports", href: "/reports", icon: TrendingUp, adminOnly: true },
    ],
  },
  {
    label: "Documents & Forms",
    items: [
      { label: "SOP Library", href: "/sop-library", icon: FileText, adminOnly: true },
      { label: "Fillable Forms", href: "/fillable-documents", icon: Layers, adminOnly: true },
      { label: "Form Gap Matrix", href: "/form-gap-matrix", icon: ClipboardCheck, adminOnly: true },
      { label: "Doc Intake & Migration", href: "/document-intake", icon: Inbox, adminOnly: true },
      { label: "Policy Attestation", href: "/policy-attestation", icon: CheckCircle2, adminOnly: true },
    ],
  },
  {
    label: "Training & Credentials",
    items: [
      { label: "Training Academy", href: "/training-academy", icon: GraduationCap, adminOnly: true },
      { label: "Training Center", href: "/training", icon: GraduationCap },
      { label: "Credentials", href: "/credentials", icon: BadgeCheck },
      { label: "Competency Tracker", href: "/competency-tracker", icon: Award, adminOnly: true },
    ],
  },
  {
    label: "Compliance & Safety",
    items: [
      { label: "OSHA Tracker", href: "/osha-tracker", icon: ClipboardCheck, adminOnly: true },
      { label: "Controlled Substances", href: "/controlled-substances", icon: FlaskConical, adminOnly: true },
      { label: "Inventory", href: "/inventory", icon: Package },
      { label: "HIPAA & Risk", href: "/risk-management", icon: ShieldAlert, adminOnly: true },
      { label: "Breach Assessment", href: "/breach-assessment", icon: ShieldAlert, adminOnly: true },
      { label: "Security Risk Assessment", href: "/security-risk-assessment", icon: Shield, adminOnly: true },
      { label: "Audits & Mock Surveys", href: "/audits", icon: ClipboardCheck, adminOnly: true },
      { label: "Incidents & CAPA", href: "/incidents", icon: Inbox },
      { label: "SDS Library", href: "/sds-library", icon: FlaskConical },
      { label: "Emergency Prep", href: "/emergency-preparedness", icon: AlertTriangle, adminOnly: true },
      { label: "Insurance Vault", href: "/insurance-vault", icon: Shield, adminOnly: true },
      { label: "Vendor Management", href: "/vendor-management", icon: Building2, adminOnly: true },
    ],
  },
  {
    label: "Admin & Resources",
    items: [
      { label: "Official Sources", href: "/official-sources", icon: BookOpen, adminOnly: true },
      { label: "Regulatory Sources", href: "/regulatory-sources", icon: BookOpen, adminOnly: true },
      { label: "Exclusion Screening", href: "/exclusion-screening", icon: CheckCircle2, adminOnly: true },
      { label: "Daily Activity Log", href: "/activity-log", icon: Activity, adminOnly: true },
      { label: "Data Backup", href: "/backup", icon: DatabaseBackup, adminOnly: true },
      { label: "Audit Trail", href: "/audit-trail", icon: Shield, adminOnly: true },
      { label: "Access Matrix", href: "/access-matrix", icon: Shield, adminOnly: true },
      { label: "User Management", href: "/user-management", icon: Users, adminOnly: true },
      { label: "Settings", href: "/settings", icon: Building2, adminOnly: true },
    ],
  },
  {
    label: "HR & Payroll",
    items: [
      { label: "HR Hub", href: "/hr-hub", icon: Users, adminOnly: true },
      { label: "Employees", href: "/hr/employees", icon: Users, adminOnly: true },
      { label: "Org Chart & Roles", href: "/org-chart", icon: Network, adminOnly: true },
      { label: "Payroll", href: "/hr/payroll", icon: DollarSign, adminOnly: true },
      { label: "Time Clock", href: "/hr/timeclock", icon: Clock },
      { label: "Time Off", href: "/hr/time-off", icon: CalendarDays },
      { label: "Performance", href: "/hr/performance", icon: Star, adminOnly: true },
      { label: "Benefits", href: "/hr/benefits", icon: Heart, adminOnly: true },
      { label: "Disciplinary", href: "/hr/disciplinary", icon: AlertTriangle, adminOnly: true },
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
export const EXTRA_PRIVILEGED_PATHS = ["/employee-vault", "/document-migration"];

/** Enforcement: can this role open this path? (Command Center is always allowed.) */
export function canAccessPath(pathname: string, role: AccountRole | null | undefined, pageRoles: Record<string, string[]>, disabledPages: string[]): boolean {
  if (pathname === "/") return true;
  if (!role || role === "inactive") return false;
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
  const accessible = (item: NavItem) =>
    !!role && role !== "inactive" &&
    !ctx.disabledPages.includes(item.href) &&
    allowedRolesFor(item.href, !!item.adminOnly, ctx.pageRoles).includes(role) &&
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
