"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, LogOut, ShieldCheck, SlidersHorizontal, ChevronUp, ChevronDown, Eye, EyeOff, X } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { roleLabel } from "@/lib/auth/roles";
import { resolveNav, type NavItem } from "@/lib/nav";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { APP_NAME, DEFAULT_ORG_NAME } from "@/lib/org";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

function initials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => p[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile, user, logout } = useAuth();
  const myUserId = profile?.userId ?? user?.id ?? "";
  const orgSettingsQ = useCollection("organizationSettings");
  const navPrefsQ = useCollection("navPreferences");
  const [customizing, setCustomizing] = useState(false);

  const org = orgSettingsQ.data?.[0];
  const orgName = org?.orgName ?? DEFAULT_ORG_NAME;
  const pref = useMemo(() => (navPrefsQ.data ?? []).find((p) => p.userId === myUserId), [navPrefsQ.data, myUserId]);

  const ctx = useMemo(() => ({
    role: profile?.accountRole,
    pageRoles: org?.pageRoles ?? {},
    disabledPages: org?.disabledPages ?? [],
    hiddenPages: pref?.hiddenPages ?? [],
    pageOrder: pref?.pageOrder ?? [],
  }), [profile?.accountRole, org?.pageRoles, org?.disabledPages, pref?.hiddenPages, pref?.pageOrder]);

  const groups = useMemo(() => resolveNav(ctx), [ctx]);
  // Everything the user is *allowed* to see (ignoring personal hide/order) — for the customizer.
  const accessible = useMemo(() => resolveNav({ ...ctx, hiddenPages: [], pageOrder: [] }).flatMap((g) => g.items), [ctx]);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {customizing && (
        <NavCustomizer
          accessible={accessible}
          initialHidden={pref?.hiddenPages ?? []}
          initialOrder={pref?.pageOrder ?? []}
          prefId={pref?.id}
          userId={myUserId}
          onClose={() => setCustomizing(false)}
        />
      )}

      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15">
          <ShieldCheck className="size-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{APP_NAME}</p>
          <p className="truncate text-xs text-muted-foreground">{orgName}</p>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-5 py-3">
        <Badge variant="success">Ready</Badge>
        <span className="truncate text-xs text-primary">{roleLabel(profile?.accountRole)}</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Primary">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
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
                    active ? "bg-primary/15 font-medium text-primary" : "text-sidebar-foreground hover:bg-secondary hover:text-foreground",
                    item.highlight && !active && "bg-gradient-to-r from-primary/10 to-transparent text-foreground ring-1 ring-inset ring-primary/30",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
        <button onClick={() => setCustomizing(true)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <SlidersHorizontal className="size-3.5 shrink-0" /> Customize navigation
        </button>
      </nav>

      {/* Footer: user + logout */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initials(user?.fullName)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.fullName ?? "—"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
          </div>
          <button onClick={logout} aria-label="Sign out" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <LogOut className="size-4" />
          </button>
        </div>
        <a href="https://lpalert.example" target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <ExternalLink className="size-4 shrink-0" aria-hidden />
          <span>Open LP Alert</span>
        </a>
      </div>
    </div>
  );
}

/* --------------------- personal nav customizer --------------------- */

function NavCustomizer({ accessible, initialHidden, initialOrder, prefId, userId, onClose }: {
  accessible: NavItem[];
  initialHidden: string[];
  initialOrder: string[];
  prefId?: string;
  userId: string;
  onClose: () => void;
}) {
  const createPref = useCreate("navPreferences");
  const updatePref = useUpdate("navPreferences");
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [saving, setSaving] = useState(false);

  // Ordered list: custom order first, then remaining accessible pages in default order.
  const [order, setOrder] = useState<string[]>(() => {
    const hrefs = accessible.map((a) => a.href);
    const inOrder = initialOrder.filter((h) => hrefs.includes(h));
    return [...inOrder, ...hrefs.filter((h) => !inOrder.includes(h))];
  });
  const byHref = useMemo(() => new Map(accessible.map((a) => [a.href, a])), [accessible]);

  function move(i: number, dir: -1 | 1) {
    setOrder((o) => {
      const j = i + dir;
      if (j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }
  function toggle(href: string) {
    setHidden((h) => { const n = new Set(h); n.has(href) ? n.delete(href) : n.add(href); return n; });
  }

  async function save() {
    setSaving(true);
    try {
      const patch = { hiddenPages: [...hidden], pageOrder: order };
      if (prefId) await updatePref.mutateAsync({ id: prefId, patch });
      else await createPref.mutateAsync({ userId, ...patch });
      toast.success("Navigation updated");
      onClose();
    } catch { toast.error("Couldn't save your navigation."); }
    finally { setSaving(false); }
  }

  async function reset() {
    setSaving(true);
    try {
      if (prefId) await updatePref.mutateAsync({ id: prefId, patch: { hiddenPages: [], pageOrder: [] } });
      toast.success("Navigation reset to default");
      onClose();
    } catch { toast.error("Couldn't reset."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-border bg-card text-foreground shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Customize navigation</h2>
            <p className="text-xs text-muted-foreground">Reorder or hide pages in your own sidebar. This only affects your view.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-3">
          {order.map((href, i) => {
            const item = byHref.get(href);
            if (!item) return null;
            const isHidden = hidden.has(href);
            return (
              <div key={href} className={cn("flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-sm", isHidden && "opacity-50")}>
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="size-3.5" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="size-3.5" /></button>
                </div>
                <item.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{item.label}</span>
                <button onClick={() => toggle(href)} title={isHidden ? "Show" : "Hide"} className="text-muted-foreground hover:text-foreground">
                  {isHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={reset} disabled={saving}>Reset</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
