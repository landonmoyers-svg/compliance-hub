"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { useCollection, useUpdate } from "@/lib/data/hooks";
import type { Notification } from "@/lib/data/schema";
import { cn } from "@/lib/cn";

const SEVERITY_DOT: Record<Notification["severity"], string> = {
  info: "bg-primary",
  warning: "bg-warning",
  critical: "bg-destructive",
};

export function NotificationBell() {
  const { data } = useCollection("notifications");
  const updateMut = useUpdate("notifications");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const notifications = useMemo(
    () => [...(data ?? [])].sort((a, b) => b.createdDate.localeCompare(a.createdDate)),
    [data],
  );
  const unread = useMemo(() => notifications.filter((n) => !n.read), [notifications]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markRead(n: Notification) {
    if (!n.read) await updateMut.mutateAsync({ id: n.id, patch: { read: true } });
  }
  async function markAllRead() {
    await Promise.all(unread.map((n) => updateMut.mutateAsync({ id: n.id, patch: { read: true } })));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ""}`}
      >
        <Bell className="size-5" />
        {unread.length > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread.length > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Check className="size-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
            ) : (
              notifications.slice(0, 30).map((n) => (
                <Link
                  key={n.id}
                  href={n.link ?? "#"}
                  onClick={() => { void markRead(n); setOpen(false); }}
                  className={cn(
                    "flex gap-2.5 border-b border-border/50 px-4 py-3 text-sm transition-colors hover:bg-secondary/40",
                    !n.read && "bg-primary/5",
                  )}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[n.severity])} />
                  <div className="min-w-0">
                    <p className={cn("truncate", !n.read && "font-medium")}>{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{new Date(n.createdDate).toLocaleDateString()}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
