"use client";

import { useState, useMemo } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { useSort, SortHeader } from "@/components/shared/sortable";
import type { TimeClockEntry } from "@/lib/data/schema";
import { toast } from "sonner";

function minutesToHours(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${min}m`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function TimeClockPage() {
  const { profile, user, isAdmin } = useAuth();
  const myUserId = profile?.userId ?? user?.id ?? "";
  const myName = profile?.fullName ?? user?.fullName ?? "Me";

  const { data, isLoading, isError, refetch } = useCollection("timeClockEntries");
  const createMut = useCreate("timeClockEntries");
  const updateMut = useUpdate("timeClockEntries");

  const [filterScope, setFilterScope] = useState<"today" | "week" | "all">("today");
  const [busy, setBusy] = useState(false);

  const entries = useMemo(() => data ?? [], [data]);

  // My open (active) shift, if any
  const myActive = useMemo(
    () => entries.find((e) => e.userId === myUserId && e.status === "active"),
    [entries, myUserId],
  );

  // What this user is allowed to see: admins see everyone, staff see only themselves
  const visible = useMemo(() => {
    let rows = isAdmin ? entries : entries.filter((e) => e.userId === myUserId);
    if (filterScope === "today") rows = rows.filter((e) => isToday(e.clockInAt));
    else if (filterScope === "week") {
      const weekAgo = Date.now() - 7 * 86_400_000;
      rows = rows.filter((e) => new Date(e.clockInAt).getTime() >= weekAgo);
    }
    return rows;
  }, [entries, isAdmin, myUserId, filterScope]);

  const { sorted, sort, toggle } = useSort(visible, {
    employee: (e) => e.userName,
    date: (e) => e.clockInAt,
    clockIn: (e) => e.clockInAt,
    clockOut: (e) => e.clockOutAt,
    total: (e) => e.totalMinutes,
    status: (e) => e.status,
  });

  const stats = useMemo(() => {
    const scope = isAdmin ? entries : entries.filter((e) => e.userId === myUserId);
    const activeNow = scope.filter((e) => e.status === "active").length;
    const todayMinutes = scope
      .filter((e) => isToday(e.clockInAt) && e.totalMinutes)
      .reduce((s, e) => s + (e.totalMinutes ?? 0), 0);
    return { activeNow, todayMinutes };
  }, [entries, isAdmin, myUserId]);

  async function clockIn() {
    if (myActive) {
      toast.error("You're already clocked in.");
      return;
    }
    setBusy(true);
    try {
      await createMut.mutateAsync({
        userId: myUserId,
        userName: myName,
        clockInAt: new Date().toISOString(),
        clockOutAt: null,
        totalMinutes: null,
        status: "active",
        editNote: null,
        editedByName: null,
      });
      toast.success("Clocked in at " + new Date().toLocaleTimeString());
    } catch {
      toast.error("Failed to clock in.");
    } finally {
      setBusy(false);
    }
  }

  async function clockOut() {
    if (!myActive) return;
    setBusy(true);
    try {
      const out = new Date();
      const totalMinutes = Math.max(
        0,
        Math.round((out.getTime() - new Date(myActive.clockInAt).getTime()) / 60_000),
      );
      await updateMut.mutateAsync({
        id: myActive.id,
        patch: { clockOutAt: out.toISOString(), totalMinutes, status: "completed" },
      });
      toast.success("Clocked out — " + minutesToHours(totalMinutes) + " logged");
    } catch {
      toast.error("Failed to clock out.");
    } finally {
      setBusy(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Time Clock" />
        <ErrorState message="We couldn't load time entries." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time Clock"
        description="Clock in and out; entries are saved to your timesheet. Admins can review all staff hours."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Currently clocked in" value={stats.activeNow} icon={Clock} tone={stats.activeNow > 0 ? "success" : "default"} loading={isLoading} />
        <StatCard label="Hours today (completed)" value={minutesToHours(stats.todayMinutes)} icon={Clock} loading={isLoading} />
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-6">
          <p className="text-sm font-medium text-muted-foreground">My clock status</p>
          <Badge variant={myActive ? "success" : "secondary"} className="px-3 text-sm">
            {myActive ? `Clocked in since ${fmt(myActive.clockInAt)}` : "Clocked out"}
          </Badge>
          <Button
            onClick={myActive ? clockOut : clockIn}
            variant={myActive ? "outline" : "default"}
            className="w-full"
            disabled={busy || isLoading}
          >
            {myActive ? <><LogOut className="size-4" /> Clock out</> : <><LogIn className="size-4" /> Clock in</>}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{isAdmin ? "Timesheet" : "My timesheet"}</CardTitle>
            <div className="flex gap-1">
              {(["today", "week", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterScope(s)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    filterScope === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {s === "today" ? "Today" : s === "week" ? "This week" : "All"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState icon={Clock} title="No time entries" description="Clock in to start your first timesheet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    {isAdmin && <SortHeader label="Employee" sortKey="employee" sort={sort} onToggle={toggle} />}
                    <SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggle} />
                    <SortHeader label="Clock in" sortKey="clockIn" sort={sort} onToggle={toggle} />
                    <SortHeader label="Clock out" sortKey="clockOut" sort={sort} onToggle={toggle} />
                    <SortHeader label="Total" sortKey="total" sort={sort} onToggle={toggle} />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} className="pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e: TimeClockEntry) => (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
                      {isAdmin && <td data-label="Employee" className="py-3 pr-4 font-medium">{e.userName}</td>}
                      <td data-label="Date" className="py-3 pr-4 text-muted-foreground">{new Date(e.clockInAt).toLocaleDateString()}</td>
                      <td data-label="Clock in" className="py-3 pr-4">{fmt(e.clockInAt)}</td>
                      <td data-label="Clock out" className="py-3 pr-4">{e.clockOutAt ? fmt(e.clockOutAt) : <span className="text-muted-foreground">—</span>}</td>
                      <td data-label="Total" className="py-3 pr-4">{e.totalMinutes != null ? minutesToHours(e.totalMinutes) : <span className="text-muted-foreground">Active</span>}</td>
                      <td data-label="Status" className="py-3">
                        <Badge variant={e.status === "active" ? "success" : e.status === "edited" ? "warning" : "secondary"}>
                          {e.status === "active" ? "Active" : e.status === "edited" ? "Edited" : "Completed"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
