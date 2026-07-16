"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatName } from "@/lib/format";
import { ExternalLink, LogOut, ShieldCheck, SlidersHorizontal, ChevronRight, ChevronDown, GripVertical, Eye, EyeOff, X, Monitor, Sun, Moon } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useTheme, type Theme } from "@/components/theme-provider";
import { roleLabel } from "@/lib/auth/roles";
import { resolveNav, type NavItem } from "@/lib/nav";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import type { NavPreference } from "@/lib/data/schema";
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

type Drag = { kind: "group"; id: string } | { kind: "item"; id: string; group: string };

/**
 * Pointer-based drag reordering that works with both mouse and touch (native
 * HTML5 DnD doesn't fire on touch). A drag starts from a grip handle; while the
 * pointer is captured we hit-test the element under the finger via
 * `elementFromPoint` (reading data-* attrs on rows) to find the drop target,
 * and auto-scroll the nav when the pointer nears an edge.
 */
function useReorder(navRef: React.RefObject<HTMLElement | null>, commit: (src: Drag, target: string | null) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const overRef = useRef<string | null>(null);
  const setOverBoth = (v: string | null) => { overRef.current = v; setOver(v); };
  const reset = () => { dragRef.current = null; setDrag(null); setOverBoth(null); };

  function handleProps(d: Drag) {
    return {
      style: { touchAction: "none" as const },
      onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); },
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        e.preventDefault();
        e.stopPropagation();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
        dragRef.current = d;
        setDrag(d);
        setOverBoth(null);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const cur = dragRef.current;
        if (!cur) return;
        e.preventDefault();
        const nav = navRef.current;
        if (nav) {
          const r = nav.getBoundingClientRect();
          if (e.clientY < r.top + 44) nav.scrollTop -= 10;
          else if (e.clientY > r.bottom - 44) nav.scrollTop += 10;
        }
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        if (!el) { setOverBoth(null); return; }
        if (cur.kind === "group") {
          const head = el.closest<HTMLElement>("[data-group-label]");
          setOverBoth(head ? `g:${head.dataset.groupLabel}` : null);
        } else {
          const it = el.closest<HTMLElement>("[data-item-href]");
          if (it && it.dataset.itemGroup === cur.group) { setOverBoth(`i:${it.dataset.itemHref}`); return; }
          const head = el.closest<HTMLElement>("[data-group-label]");
          if (head && head.dataset.groupLabel === cur.group) { setOverBoth(`g:${head.dataset.groupLabel}`); return; }
          setOverBoth(null);
        }
      },
      onPointerUp: (e: React.PointerEvent) => {
        const cur = dragRef.current;
        const target = overRef.current;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
        reset();
        if (cur) commit(cur, target);
      },
      onPointerCancel: reset,
    };
  }

  return { drag, over, handleProps };
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile, user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const myUserId = profile?.userId ?? user?.id ?? "";
  const orgSettingsQ = useCollection("organizationSettings");
  const navPrefsQ = useCollection("navPreferences");
  const createPref = useCreate("navPreferences");
  const updatePref = useUpdate("navPreferences");
  const [customizing, setCustomizing] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const savingRef = useRef(false);

  const org = orgSettingsQ.data?.[0];
  const orgName = org?.orgName ?? DEFAULT_ORG_NAME;
  const pref = useMemo(() => (navPrefsQ.data ?? []).find((p) => p.userId === myUserId), [navPrefsQ.data, myUserId]);

  const ctx = useMemo(() => ({
    role: profile?.accountRole,
    pageRoles: org?.pageRoles ?? {},
    disabledPages: org?.disabledPages ?? [],
    hiddenPages: pref?.hiddenPages ?? [],
    pageOrder: pref?.pageOrder ?? [],
    groupOrder: pref?.groupOrder ?? [],
  }), [profile?.accountRole, org?.pageRoles, org?.disabledPages, pref?.hiddenPages, pref?.pageOrder, pref?.groupOrder]);

  const groups = useMemo(() => resolveNav(ctx), [ctx]);
  // Everything the user is *allowed* to see (ignoring personal hide/order) — for the customizer.
  const accessible = useMemo(() => resolveNav({ ...ctx, hiddenPages: [], pageOrder: [], groupOrder: [] }).flatMap((g) => g.items), [ctx]);
  const collapsed = useMemo(() => new Set(pref?.collapsedGroups ?? []), [pref?.collapsedGroups]);

  async function savePref(patch: Partial<NavPreference>) {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      if (pref?.id) {
        await updatePref.mutateAsync({ id: pref.id, patch });
      } else {
        await createPref.mutateAsync({
          userId: myUserId,
          hiddenPages: pref?.hiddenPages ?? [],
          pageOrder: pref?.pageOrder ?? [],
          groupOrder: pref?.groupOrder ?? [],
          collapsedGroups: pref?.collapsedGroups ?? [],
          ...patch,
        });
      }
    } catch {
      toast.error("Couldn't save your navigation.");
    } finally {
      savingRef.current = false;
    }
  }

  function toggleCollapse(label: string) {
    const set = new Set(pref?.collapsedGroups ?? []);
    set.has(label) ? set.delete(label) : set.add(label);
    savePref({ collapsedGroups: [...set] });
  }

  // Reorder groups: place the dragged group immediately before `targetLabel`.
  function reorderGroups(sourceLabel: string, targetLabel: string) {
    if (sourceLabel === targetLabel) return;
    const labels = groups.map((g) => g.label).filter((l) => l !== sourceLabel);
    const ti = labels.indexOf(targetLabel);
    if (ti < 0) return;
    labels.splice(ti, 0, sourceLabel);
    savePref({ groupOrder: labels });
  }

  // Reorder within a group: place the dragged item before `targetHref`, or at the
  // end when `targetHref` is null (dropped on the heading). pageOrder stores the
  // full flattened order so resolveNav can rank items within each group.
  function moveItem(groupLabel: string, sourceHref: string, targetHref: string | null) {
    if (sourceHref === targetHref) return;
    const g = groups.find((x) => x.label === groupLabel);
    if (!g) return;
    const hrefs = g.items.map((i) => i.href).filter((h) => h !== sourceHref);
    if (targetHref == null) {
      hrefs.push(sourceHref);
    } else {
      const ti = hrefs.indexOf(targetHref);
      if (ti < 0) return;
      hrefs.splice(ti, 0, sourceHref);
    }
    const flat = groups.flatMap((x) => (x.label === groupLabel ? hrefs : x.items.map((i) => i.href)));
    savePref({ pageOrder: flat });
  }

  function commitDrag(src: Drag, target: string | null) {
    if (!target) return;
    if (src.kind === "group" && target.startsWith("g:")) reorderGroups(src.id, target.slice(2));
    else if (src.kind === "item" && target.startsWith("i:")) moveItem(src.group, src.id, target.slice(2));
    else if (src.kind === "item" && target.startsWith("g:")) moveItem(src.group, src.id, null);
  }

  const { drag, over, handleProps } = useReorder(navRef, commitDrag);

  const gripClass = "flex shrink-0 cursor-grab touch-none items-center text-muted-foreground/40 active:cursor-grabbing";

  return (
    <div className="flex h-full flex-col bg-sidebar/70 backdrop-blur-2xl backdrop-saturate-150">
      {customizing && (
        <NavCustomizer
          accessible={accessible}
          initialHidden={pref?.hiddenPages ?? []}
          pref={pref}
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
      <nav ref={navRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Primary">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.label);
          const groupDragging = drag?.kind === "group" && drag.id === group.label;
          const groupOver = over === `g:${group.label}`;
          return (
            <div key={group.label} className="space-y-1">
              {/* Group heading: click to collapse, drag the grip to reorder */}
              <div
                data-group-label={group.label}
                className={cn(
                  "group/head flex items-center gap-1 rounded-md px-1.5 py-1 select-none",
                  groupOver && drag?.kind === "group" && "ring-1 ring-primary/60",
                  groupOver && drag?.kind === "item" && "bg-primary/5",
                  groupDragging && "opacity-40",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleCollapse(group.label)}
                  aria-expanded={!isCollapsed}
                  className="flex flex-1 items-center gap-1 text-left"
                >
                  {isCollapsed
                    ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    : <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</span>
                </button>
                <span
                  {...handleProps({ kind: "group", id: group.label })}
                  role="button"
                  aria-label={`Reorder ${group.label} section`}
                  title="Drag to reorder section"
                  className={cn(gripClass, "p-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100")}
                >
                  <GripVertical className="size-3.5" aria-hidden />
                </span>
              </div>

              {!isCollapsed && group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                const itemDragging = drag?.kind === "item" && drag.id === item.href;
                const itemOver = over === `i:${item.href}` && drag?.kind === "item";
                return (
                  <Link
                    key={`${group.label}-${item.href}-${item.label}`}
                    href={item.href}
                    data-item-href={item.href}
                    data-item-group={group.label}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group/item flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                      active ? "bg-primary/15 font-medium text-primary" : "text-sidebar-foreground hover:bg-secondary hover:text-foreground",
                      item.highlight && !active && "bg-gradient-to-r from-primary/10 to-transparent text-foreground ring-1 ring-inset ring-primary/30",
                      itemDragging && "opacity-40",
                      itemOver && "ring-1 ring-primary/60",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    <span
                      {...handleProps({ kind: "item", id: item.href, group: group.label })}
                      role="button"
                      aria-label={`Reorder ${item.label}`}
                      title="Drag to reorder"
                      className={cn(gripClass, "-mr-1 p-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/item:opacity-100")}
                    >
                      <GripVertical className="size-3.5" aria-hidden />
                    </span>
                  </Link>
                );
              })}
            </div>
          );
        })}
        <button onClick={() => setCustomizing(true)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <SlidersHorizontal className="size-3.5 shrink-0" /> Customize navigation
        </button>
      </nav>

      {/* Footer: appearance + user + logout */}
      <div className="border-t border-sidebar-border p-3">
        {/* Appearance: System / Light / Dark */}
        <div className="mb-1 flex items-center gap-0.5 rounded-lg bg-secondary/60 p-0.5">
          {([["system", Monitor, "System"], ["light", Sun, "Light"], ["dark", Moon, "Dark"]] as const).map(([val, Icon, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setTheme(val as Theme)}
              aria-label={`${label} appearance`}
              aria-pressed={theme === val}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                theme === val ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initials(user?.fullName)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{formatName(user?.fullName) || "—"}</p>
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

function NavCustomizer({ accessible, initialHidden, pref, userId, onClose }: {
  accessible: NavItem[];
  initialHidden: string[];
  pref: NavPreference | undefined;
  userId: string;
  onClose: () => void;
}) {
  const createPref = useCreate("navPreferences");
  const updatePref = useUpdate("navPreferences");
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [saving, setSaving] = useState(false);
  const prefId = pref?.id;

  function toggle(href: string) {
    setHidden((h) => { const n = new Set(h); n.has(href) ? n.delete(href) : n.add(href); return n; });
  }

  async function save() {
    setSaving(true);
    try {
      const hiddenPages = [...hidden];
      if (prefId) await updatePref.mutateAsync({ id: prefId, patch: { hiddenPages } });
      else await createPref.mutateAsync({ userId, hiddenPages, pageOrder: [], groupOrder: [], collapsedGroups: [] });
      toast.success("Navigation updated");
      onClose();
    } catch { toast.error("Couldn't save your navigation."); }
    finally { setSaving(false); }
  }

  async function reset() {
    setSaving(true);
    try {
      if (prefId) await updatePref.mutateAsync({ id: prefId, patch: { hiddenPages: [], pageOrder: [], groupOrder: [], collapsedGroups: [] } });
      toast.success("Navigation reset to default");
      onClose();
    } catch { toast.error("Couldn't reset."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-border bg-card text-foreground shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Show / hide pages</h2>
            <p className="text-xs text-muted-foreground">Hide pages you don&apos;t use. Drag the grip on headings and items in the sidebar to reorder, or tap a heading to collapse it. This only affects your view.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-3">
          {accessible.map((item) => {
            const isHidden = hidden.has(item.href);
            return (
              <div key={item.href} className={cn("flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-sm", isHidden && "opacity-50")}>
                <item.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{item.label}</span>
                <button onClick={() => toggle(item.href)} title={isHidden ? "Show" : "Hide"} className="text-muted-foreground hover:text-foreground">
                  {isHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={reset} disabled={saving}>Reset layout</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
