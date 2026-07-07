"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { roleLabel } from "@/lib/auth/roles";
import { visibleNav } from "@/lib/nav";
import { useCollection } from "@/lib/data/hooks";
import { APP_NAME, DEFAULT_ORG_NAME } from "@/lib/org";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

function initials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => p[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile, user, isAdmin, logout } = useAuth();
  const groups = visibleNav(isAdmin);
  const orgSettings = useCollection("organizationSettings");
  const orgName = orgSettings.data?.[0]?.orgName ?? DEFAULT_ORG_NAME;

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15">
          <ShieldCheck className="size-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {APP_NAME}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {orgName}
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-5 py-3">
        <Badge variant="success">Ready</Badge>
        <span className="truncate text-xs text-primary">
          {roleLabel(profile?.accountRole)}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Primary">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={`${group.label}-${item.href}-${item.label}`}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary/15 font-medium text-primary"
                      : "text-sidebar-foreground hover:bg-secondary hover:text-foreground",
                    item.highlight &&
                      !active &&
                      "bg-gradient-to-r from-primary/10 to-transparent text-foreground ring-1 ring-inset ring-primary/30",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: user + logout */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {initials(user?.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.fullName ?? "—"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email ?? ""}
            </p>
          </div>
          <button
            onClick={logout}
            aria-label="Sign out"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <a
          href="https://lpalert.example"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden />
          <span>Open LP Alert</span>
        </a>
      </div>
    </div>
  );
}
