import {
  AlertTriangle,
  Award,
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DollarSign,
  FileText,
  FlaskConical,
  GraduationCap,
  Heart,
  Inbox,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Package,
  Shield,
  ShieldAlert,
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
      {
        label: "Setup Concierge",
        href: "/compliance-concierge",
        icon: Sparkles,
        adminOnly: true,
        highlight: true,
      },
      { label: "Executive Dashboard", href: "/executive-dashboard", icon: TrendingUp, adminOnly: true },
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
      { label: "Audit Trail", href: "/audit-trail", icon: Shield, adminOnly: true },
      { label: "User Management", href: "/user-management", icon: Users, adminOnly: true },
      { label: "Settings", href: "/settings", icon: Building2, adminOnly: true },
    ],
  },
  {
    label: "HR & Payroll",
    items: [
      { label: "HR Hub", href: "/hr-hub", icon: Users, adminOnly: true },
      { label: "Employees", href: "/hr/employees", icon: Users, adminOnly: true },
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
