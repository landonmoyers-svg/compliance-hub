"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, ChevronDown, LogOut, Monitor, Sun, Moon, Menu } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useTheme, type Theme } from "@/components/theme-provider";
import { roleLabel } from "@/lib/auth/roles";
import { useCollection } from "@/lib/data/hooks";
import { DEFAULT_ORG_NAME } from "@/lib/org";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useResolvedNav } from "@/lib/use-resolved-nav";
import { formatName } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Jane-style primary navigation: a saturated teal band across the top of every
 * page. Top-level sections are the nav GROUPS; the pages inside a group appear
 * in the section sidebar beneath. Mirrors the layout our staff already know
 * from Jane.app (section tabs up top, sub-navigation down the left).
 */
export function JaneTopBar({ onToggleMobileNav }: { onToggleMobileNav?: () => void }) {
  const pathname = usePathname();
  const { profile, user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const orgQ = useCollection("organizationSettings");
  const org = orgQ.data?.[0];
  const orgName = org?.orgName ?? DEFAULT_ORG_NAME;

  const { groups, activeGroup } = useResolvedNav();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const initials = (profile?.fullName ?? user?.fullName ?? "?")
    .trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-topbar text-topbar-foreground">
      <div className="flex h-14 items-stretch">
        {/* mobile: open section nav */}
        <button
          onClick={onToggleMobileNav}
          className="flex items-center px-4 hover:bg-topbar-hover lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>

        {/* section tabs */}
        <nav className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {groups.map((g) => {
            const first = g.items[0]?.href ?? "/";
            const isActive = activeGroup?.label === g.label;
            return (
              <Link
                key={g.shortLabel ?? g.label}
                href={first}
                className={cn(
                  "flex shrink-0 items-center whitespace-nowrap px-4 text-[15px] transition-colors",
                  isActive ? "bg-topbar-active font-semibold" : "hover:bg-topbar-hover",
                )}
              >
                {g.label}
              </Link>
            );
          })}
        </nav>

        {/* brand */}
        <Link href="/" className="hidden shrink-0 items-center gap-2 px-4 2xl:flex" title={orgName}>
          <ShieldCheck className="size-5 shrink-0" />
          <span className="max-w-[14rem] truncate text-[15px] font-semibold">{orgName}</span>
        </Link>

        {/* right cluster */}
        <div className="flex items-center gap-1 pr-2">
          <div className="[&_button]:text-topbar-foreground">
            <NotificationBell />
          </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-topbar-hover"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-white/25 text-xs font-bold">
                {initials}
              </span>
              <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">
                {formatName(profile?.fullName ?? user?.fullName ?? "")}
              </span>
              <ChevronDown className="hidden size-4 sm:inline" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg">
                <div className="border-b border-border px-3 py-2.5">
                  <p className="truncate text-sm font-semibold">{formatName(profile?.fullName ?? user?.fullName ?? "")}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {profile?.accountRole ? roleLabel(profile.accountRole) : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 border-b border-border px-2 py-2">
                  {([
                    { v: "system" as Theme, icon: Monitor, label: "System" },
                    { v: "light" as Theme, icon: Sun, label: "Light" },
                    { v: "dark" as Theme, icon: Moon, label: "Dark" },
                  ]).map(({ v, icon: Icon, label }) => (
                    <button
                      key={v}
                      onClick={() => setTheme(v)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                        theme === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      <Icon className="size-3.5" /> {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary"
                >
                  <LogOut className="size-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
