"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { cn } from "@/lib/cn";

/**
 * Consolidation tabs: sibling routes presented as one destination. Each page in
 * a cluster renders the same tab set above its header, so the cluster feels
 * like a single page with tabs while every route (and its role gating) stays
 * intact. Admin-only tabs hide for non-admins; a single visible tab renders
 * nothing at all.
 */
export interface PageTab {
  label: string;
  href: string;
  adminOnly?: boolean;
}

export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const visible = tabs.filter((t) => !t.adminOnly || isAdmin);
  if (visible.length < 2) return null;
  return (
    <div className="mb-4 flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-secondary/60 p-0.5" role="tablist" aria-label="Section">
      {visible.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/* Shared tab sets so every page in a cluster stays in sync. */

export const OVERVIEW_TABS: PageTab[] = [
  { label: "Home", href: "/" },
  { label: "Executive", href: "/executive-dashboard", adminOnly: true },
  { label: "Scorecard", href: "/program-effectiveness", adminOnly: true },
  { label: "Reports", href: "/reports", adminOnly: true },
];

export const INCIDENT_TABS: PageTab[] = [
  { label: "Incidents", href: "/incidents" },
  { label: "Risk Cases", href: "/risk-management", adminOnly: true },
  { label: "Breach Assessments", href: "/breach-assessment", adminOnly: true },
];

export const TRAINING_TABS: PageTab[] = [
  { label: "Assignments", href: "/training" },
  { label: "Modules & Quizzes", href: "/training-academy", adminOnly: true },
];

export const SOURCES_TABS: PageTab[] = [
  { label: "Regulatory Register", href: "/regulatory-sources" },
  { label: "Official Reference", href: "/official-sources" },
];
