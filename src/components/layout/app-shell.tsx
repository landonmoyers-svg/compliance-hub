"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, Lock } from "lucide-react";
import { JaneTopBar } from "./jane-topbar";
import { JaneSidebar } from "./jane-sidebar";
import { AssistantWidget } from "@/components/ai/assistant-widget";
import { GuideProvider } from "@/lib/guide/context";
import { GuideDock } from "@/components/guide/guide-dock";
import { useAuth } from "@/lib/auth/context";
import { useCollection } from "@/lib/data/hooks";
import { canAccessPath, findNavItem } from "@/lib/nav";
import { industryHiddenModules } from "@/lib/industries";
import { logAccess } from "@/lib/audit-client";
import { cn } from "@/lib/cn";

/**
 * Authenticated app frame, Jane-style: a teal section bar across the top, the
 * chosen section's pages in a left rail, and content in a white column. Mobile
 * collapses the rail into a slide-over drawer.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { profile, logout } = useAuth();
  const orgSettingsQ = useCollection("organizationSettings");
  const org = orgSettingsQ.data?.[0];

  // Enforce the org's idle session timeout: sign the user out after N minutes of
  // no interaction. (The setting was saved but never enforced before.)
  const timeoutMin = org?.sessionTimeoutMinutes ?? 30;
  useEffect(() => {
    if (!profile || !timeoutMin || timeoutMin <= 0) return;
    // setTimeout stores the delay as a signed 32-bit int; a delay above
    // 2,147,483,647 ms (~24.8 days) overflows and fires IMMEDIATELY — which would
    // log the user out the instant the shell mounts. Clamp to the safe maximum so
    // a very large idle-timeout setting behaves as "effectively never".
    const ms = Math.min(timeoutMin * 60_000, 2_147_483_647);
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => { void logout(); }, ms); };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [profile, timeoutMin, logout]);

  // Enforce page access once settings have loaded: a user who navigates to a
  // page their role/org doesn't permit is redirected home (defense beyond nav hiding).
  const loaded = !orgSettingsQ.isLoading;
  const allowed = canAccessPath(pathname, profile?.accountRole, org?.pageRoles ?? {}, org?.disabledPages ?? [], industryHiddenModules(org?.industry));
  useEffect(() => {
    if (loaded && profile && !allowed) router.replace("/");
  }, [loaded, allowed, profile, router]);
  const blocked = loaded && !!profile && !allowed;

  // Access audit trail: log every page the user actually views (deduped per
  // path, only pages they were allowed to open). Read-only, fire-and-forget.
  const lastLogged = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || !loaded || !allowed) return;
    if (lastLogged.current === pathname) return;
    lastLogged.current = pathname;
    logAccess({
      action: "view",
      entityType: "page",
      entityId: pathname,
      entityLabel: findNavItem(pathname)?.label ?? pathname,
      details: `Viewed ${pathname}`,
      riskLevel: "low",
    });
  }, [pathname, profile, loaded, allowed]);

  return (
    <GuideProvider>
    <div className="min-h-screen bg-background">
      {/* Skip link — first focusable element, lets keyboard users jump past the
          ~15 sidebar items straight to page content (WCAG 2.4.1). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      <JaneTopBar onToggleMobileNav={() => setMobileOpen(true)} />

      <div className="flex">
        {/* Section rail (desktop) */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-72 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
          <JaneSidebar />
        </aside>

        {/* Section rail (mobile drawer) */}
        <div
          className={cn("fixed inset-0 z-40 lg:hidden", mobileOpen ? "pointer-events-auto" : "pointer-events-none")}
          inert={!mobileOpen}
        >
          <div
            className={cn("absolute inset-0 bg-black/50 transition-opacity", mobileOpen ? "opacity-100" : "opacity-0")}
            onClick={() => setMobileOpen(false)}
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar shadow-xl transition-transform",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
            >
              <X className="size-5" />
            </button>
            <JaneSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>

        {/* Content */}
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <div className="mx-auto max-w-[1400px] px-5 py-6 sm:px-7 lg:px-9">
            {blocked ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <Lock className="size-10 text-muted-foreground" />
                <p className="text-lg font-medium">You don’t have access to this page</p>
                <p className="text-sm text-muted-foreground">Your role doesn’t include this page, or your organization has turned it off. Redirecting…</p>
              </div>
            ) : children}
          </div>
        </main>
      </div>

      {/* Site-wide, page-aware AI assistant */}
      <AssistantWidget />

      {/* The Guide's walkthrough dock (panel / tour / chat) */}
      <GuideDock />
    </div>
    </GuideProvider>
  );
}
