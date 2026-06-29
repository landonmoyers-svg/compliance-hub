"use client";

import { useState, useMemo } from "react";
import { Umbrella, Plus, Check, X } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";

interface PtoBalance {
  employeeName: string;
  ptoHoursAccrued: number;
  ptoHoursUsed: number;
  sickHoursAccrued: number;
  sickHoursUsed: number;
}

interface TimeOffRequest {
  id: string;
  employeeName: string;
  type: "pto" | "sick" | "bereavement" | "unpaid";
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: "pending" | "approved" | "denied";
  requestedAt: string;
}

const BALANCES: PtoBalance[] = [
  { employeeName: "Jane Doe", ptoHoursAccrued: 120, ptoHoursUsed: 40, sickHoursAccrued: 40, sickHoursUsed: 8 },
  { employeeName: "Sarah Mitchell", ptoHoursAccrued: 80, ptoHoursUsed: 16, sickHoursAccrued: 40, sickHoursUsed: 0 },
  { employeeName: "Mike Carter", ptoHoursAccrued: 96, ptoHoursUsed: 32, sickHoursAccrued: 40, sickHoursUsed: 16 },
  { employeeName: "Emily Torres", ptoHoursAccrued: 64, ptoHoursUsed: 0, sickHoursAccrued: 40, sickHoursUsed: 0 },
  { employeeName: "David Lee", ptoHoursAccrued: 40, ptoHoursUsed: 8, sickHoursAccrued: 40, sickHoursUsed: 24 },
];

const SEED_REQUESTS: TimeOffRequest[] = [
  { id: "r1", employeeName: "Sarah Mitchell", type: "pto", startDate: "2026-07-04", endDate: "2026-07-07", days: 2, reason: "Family vacation", status: "pending", requestedAt: new Date().toISOString() },
  { id: "r2", employeeName: "Mike Carter", type: "sick", startDate: "2026-06-20", endDate: "2026-06-20", days: 1, reason: "Illness", status: "approved", requestedAt: new Date(Date.now() - 8 * 86400_000).toISOString() },
  { id: "r3", employeeName: "Emily Torres", type: "pto", startDate: "2026-08-01", endDate: "2026-08-05", days: 5, reason: "Vacation", status: "pending", requestedAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
  { id: "r4", employeeName: "David Lee", type: "sick", startDate: "2026-06-10", endDate: "2026-06-12", days: 3, reason: "Medical leave", status: "approved", requestedAt: new Date(Date.now() - 20 * 86400_000).toISOString() },
];

const STATUS_VARIANT: Record<TimeOffRequest["status"], "warning" | "success" | "destructive"> = {
  pending: "warning",
  approved: "success",
  denied: "destructive",
};

const TYPE_LABEL: Record<TimeOffRequest["type"], string> = {
  pto: "PTO",
  sick: "Sick",
  bereavement: "Bereavement",
  unpaid: "Unpaid",
};

interface NewRequest {
  type: TimeOffRequest["type"];
  startDate: string;
  endDate: string;
  reason: string;
}

export default function TimeOffPage() {
  const { profile } = useAuth();
  const myName = profile?.fullName ?? "Jane Doe";

  const [requests, setRequests] = useState<TimeOffRequest[]>(SEED_REQUESTS);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewRequest>({ type: "pto", startDate: "", endDate: "", reason: "" });

  const myBalance = BALANCES.find((b) => b.employeeName === myName);
  const pendingRequests = requests.filter((r) => r.status === "pending");

  const days = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    const d = differenceInCalendarDays(new Date(form.endDate), new Date(form.startDate)) + 1;
    return Math.max(0, d);
  }, [form.startDate, form.endDate]);

  function submitRequest() {
    if (!form.startDate || !form.endDate || days <= 0) {
      toast.error("Invalid date range");
      return;
    }
    setRequests((prev) => [
      {
        id: `r-${Date.now()}`,
        employeeName: myName,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        days,
        reason: form.reason.trim(),
        status: "pending",
        requestedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setShowForm(false);
    setForm({ type: "pto", startDate: "", endDate: "", reason: "" });
    toast.success("Time-off request submitted");
  }

  function approve(id: string) {
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "approved" } : r));
    toast.success("Request approved");
  }

  function deny(id: string) {
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "denied" } : r));
    toast.success("Request denied");
  }

  return (
    <div className="space-y-6">
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">Request time off</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="grid gap-4 p-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <select className="input w-full" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as NewRequest["type"] }))}>
                  <option value="pto">PTO</option>
                  <option value="sick">Sick</option>
                  <option value="bereavement">Bereavement</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Start date</label>
                  <input type="date" className="input w-full" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">End date</label>
                  <input type="date" className="input w-full" value={form.endDate} min={form.startDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
              </div>
              {days > 0 && <p className="text-sm text-muted-foreground">{days} working day{days > 1 ? "s" : ""}</p>}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Reason (optional)</label>
                <input className="input w-full" placeholder="Brief reason…" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={submitRequest} disabled={!form.startDate || !form.endDate || days <= 0}>Submit request</Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Time Off"
        description="PTO requests, sick leave, and balances."
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="size-4" /> Request time off
          </Button>
        }
      />

      {myBalance && (
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="PTO available (hrs)" value={myBalance.ptoHoursAccrued - myBalance.ptoHoursUsed} icon={Umbrella} tone="success" />
          <StatCard label="PTO used (hrs)" value={myBalance.ptoHoursUsed} icon={Umbrella} />
          <StatCard label="Sick available (hrs)" value={myBalance.sickHoursAccrued - myBalance.sickHoursUsed} icon={Umbrella} tone="success" />
          <StatCard label="Pending requests" value={pendingRequests.filter((r) => r.employeeName === myName).length} icon={Umbrella} tone="warning" />
        </div>
      )}

      {/* Pending approvals (manager view) */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Pending approvals</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/20 p-4">
                  <div>
                    <p className="font-medium">{r.employeeName} — {TYPE_LABEL[r.type]}</p>
                    <p className="text-sm text-muted-foreground">{r.startDate} to {r.endDate} ({r.days} day{r.days > 1 ? "s" : ""})</p>
                    {r.reason && <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => approve(r.id)}><Check className="size-3" /> Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => deny(r.id)}><X className="size-3" /> Deny</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All requests */}
      <Card>
        <CardHeader><CardTitle>All requests</CardTitle></CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <EmptyState icon={Umbrella} title="No requests yet" description="Submit a time-off request to get started." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Employee</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Dates</th>
                    <th className="pb-2 pr-4 font-medium">Days</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-3 pr-4 font-medium">{r.employeeName}</td>
                      <td className="py-3 pr-4">{TYPE_LABEL[r.type]}</td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{r.startDate} – {r.endDate}</td>
                      <td className="py-3 pr-4">{r.days}</td>
                      <td className="py-3">
                        <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">{r.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balance table */}
      <Card>
        <CardHeader><CardTitle>PTO balances — all staff</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Employee</th>
                  <th className="pb-2 pr-4 font-medium text-right">PTO accrued</th>
                  <th className="pb-2 pr-4 font-medium text-right">PTO used</th>
                  <th className="pb-2 pr-4 font-medium text-right">PTO remaining</th>
                  <th className="pb-2 pr-4 font-medium text-right">Sick accrued</th>
                  <th className="pb-2 font-medium text-right">Sick remaining</th>
                </tr>
              </thead>
              <tbody>
                {BALANCES.map((b) => (
                  <tr key={b.employeeName} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="py-3 pr-4 font-medium">{b.employeeName}</td>
                    <td className="py-3 pr-4 tabular-nums text-right">{b.ptoHoursAccrued}h</td>
                    <td className="py-3 pr-4 tabular-nums text-right text-muted-foreground">{b.ptoHoursUsed}h</td>
                    <td className="py-3 pr-4 tabular-nums text-right font-medium">{b.ptoHoursAccrued - b.ptoHoursUsed}h</td>
                    <td className="py-3 pr-4 tabular-nums text-right">{b.sickHoursAccrued}h</td>
                    <td className="py-3 tabular-nums text-right">{b.sickHoursAccrued - b.sickHoursUsed}h</td>
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
