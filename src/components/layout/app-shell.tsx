"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, ShieldCheck, X, Lock } from "lucide-react";
import { Sidebar } from "./sidebar";
import { NotificationBell } from "./notification-bell";
import { AssistantWidget } from "@/components/ai/assistant-widget";
import { useAuth } from "@/lib/auth/context";
import { useCollection } from "@/lib/data/hooks";
import { canAccessPath } from "@/lib/nav";
import { cn } from "@/lib/cn";

/** Authenticated app frame: fixed sidebar on desktop, slide-over drawer on mobile. */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuth();
  const orgSettingsQ = useCollection("organizationSettings");
  const org = orgSettingsQ.data?.[0];

  // Enforce page access once settings have loaded: a user who navigates to a
  // page their role/org doesn't permit is redirected home (defense beyond nav hiding).
  const loaded = !orgSettingsQ.isLoading;
  const allowed = canAccessPath(pathname, profile?.accountRole, org?.pageRoles ?? {}, org?.disabledPages ?? []);
  useEffect(() => {
    if (loaded && profile && !allowed) router.replace("/");
  }, [loaded, allowed, profile, router]);
  const blocked = loaded && !!profile && !allowed;

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-sidebar-border lg:block">
        <Sidebar />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/70 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-1.5 hover:bg-secondary"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <span className="text-sm font-semibold">Compliance Hub</span>
        </div>
        <div className="ml-auto">
          <NotificationBell />
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-72 border-r border-sidebar-border shadow-xl transition-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-5" />
          </button>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      {/* Main content */}
      <main className="lg:pl-72">
        {/* Desktop top bar with notifications — Liquid Glass functional layer */}
        <div className="sticky top-0 z-20 hidden items-center justify-end border-b border-border bg-card/70 px-8 py-2 backdrop-blur-xl backdrop-saturate-150 lg:flex">
          <NotificationBell />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {blocked ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <Lock className="size-10 text-muted-foreground" />
              <p className="text-lg font-medium">You don’t have access to this page</p>
              <p className="text-sm text-muted-foreground">Your role doesn’t include this page, or your organization has turned it off. Redirecting…</p>
            </div>
          ) : children}
        </div>
      </main>

      {/* Site-wide, page-aware AI assistant */}
      <AssistantWidget />
    </div>
  );
}
