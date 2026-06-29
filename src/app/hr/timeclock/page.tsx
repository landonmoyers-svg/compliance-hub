"use client";

import { useState, useMemo } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface TimeEntry {
  id: string;
  employeeName: string;
  clockIn: string;
  clockOut?: string;
  totalMinutes?: number;
}

function minutesToHours(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${min}m`;
}

function offsetHours(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours, Math.floor(Math.random() * 30));
  return d.toISOString();
}

const SEED: TimeEntry[] = [
  { id: "t1", employeeName: "Sarah Mitchell", clockIn: offsetHours(6), clockOut: offsetHours(0), totalMinutes: 360 },
  { id: "t2", employeeName: "Mike Carter", clockIn: offsetHours(8), clockOut: offsetHours(0.5), totalMinutes: 450 },
  { id: "t3", employeeName: "Emily Torres", clockIn: offsetHours(5), totalMinutes: undefined },
  { id: "t4", employeeName: "David Lee", clockIn: offsetHours(7.5), clockOut: offsetHours(1), totalMinutes: 390 },
];

export default function TimeClockPage() {
  const { profile } = useAuth();
  const myName = profile?.fullName ?? "Jane Doe";

  const [entries, setEntries] = useState<TimeEntry[]>(SEED);
  const [filterEmployee, setFilterEmployee] = useState("all");

  const isClockedIn = entries.some((e) => e.employeeName === myName && !e.clockOut);

  function clockIn() {
    const now = new Date().toISOString();
    setEntries((prev) => [
      { id: `t-${Date.now()}`, employeeName: myName, clockIn: now },
      ...prev,
    ]);
    toast.success("Clocked in at " + new Date().toLocaleTimeString());
  }

  function clockOut() {
    const now = new Date().toISOString();
    setEntries((prev) =>
      prev.map((e) => {
        if (e.employeeName !== myName || e.clockOut) return e;
        const inMs = new Date(e.clockIn).getTime();
        const outMs = new Date(now).getTime();
        return { ...e, clockOut: now, totalMinutes: Math.round((outMs - inMs) / 60_000) };
      }),
    );
    toast.success("Clocked out at " + new Date().toLocaleTimeString());
  }

  const filtered = useMemo(
    () => (filterEmployee === "all" ? entries : entries.filter((e) => e.employeeName === filterEmployee)),
    [entries, filterEmployee],
  );

  const stats = useMemo(() => {
    const activeNow = entries.filter((e) => !e.clockOut).length;
    const todayMinutes = entries
      .filter((e) => e.totalMinutes)
      .reduce((s, e) => s + (e.totalMinutes ?? 0), 0);
    return { activeNow, todayMinutes };
  }, [entries]);

  const names = [...new Set(SEED.map((e) => e.employeeName))].sort();

  function fmt(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time Clock"
        description="Employee clock in/out and daily timesheet. In production this records real timestamps with IP and location data."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Currently clocked in" value={stats.activeNow} icon={Clock} tone={stats.activeNow > 0 ? "success" : "default"} />
        <StatCard label="Total hours today (completed shifts)" value={minutesToHours(stats.todayMinutes)} icon={Clock} />
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-6 gap-3">
          <p className="text-sm font-medium text-muted-foreground">My clock status</p>
          <Badge variant={isClockedIn ? "success" : "secondary"} className="text-sm px-3">
            {isClockedIn ? "Clocked in" : "Clocked out"}
          </Badge>
          <Button
            onClick={isClockedIn ? clockOut : clockIn}
            variant={isClockedIn ? "outline" : "default"}
            className="w-full"
          >
            {isClockedIn ? <><LogOut className="size-4" /> Clock out</> : <><LogIn className="size-4" /> Clock in</>}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Today&apos;s timesheet</CardTitle>
            <select className="input w-48" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
              <option value="all">All employees</option>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Employee</th>
                  <th className="pb-2 pr-4 font-medium">Clock in</th>
                  <th className="pb-2 pr-4 font-medium">Clock out</th>
                  <th className="pb-2 pr-4 font-medium">Total</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="py-3 pr-4 font-medium">{e.employeeName}</td>
                    <td className="py-3 pr-4">{fmt(e.clockIn)}</td>
                    <td className="py-3 pr-4">{e.clockOut ? fmt(e.clockOut) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-3 pr-4">{e.totalMinutes ? minutesToHours(e.totalMinutes) : <span className="text-muted-foreground">Active</span>}</td>
                    <td className="py-3">
                      <Badge variant={e.clockOut ? "secondary" : "success"}>
                        {e.clockOut ? "Completed" : "Active"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
