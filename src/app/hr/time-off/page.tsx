"use client";

import { useState, useMemo } from "react";
import { Umbrella, Plus, Check, X } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { TimeOffRequest, TimeOffType, PTOBalance } from "@/lib/data/schema";
import { timeOffTypes } from "@/lib/data/schema";
import { toast } from "sonner";

const HOURS_PER_DAY = 8;

const TYPE_LABEL: Record<TimeOffType, string> = {
  pto: "PTO",
  sick: "Sick",
  fmla: "FMLA",
  maternity: "Maternity",
  paternity: "Paternity",
  bereavement: "Bereavement",
  jury_duty: "Jury duty",
  unpaid: "Unpaid",
  holiday: "Holiday",
  other: "Other",
};

const STATUS_VARIANT: Record<TimeOffRequest["status"], "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  approved: "success",
  denied: "destructive",
  cancelled: "secondary",
};

/** Inclusive calendar-day count between two date-only strings, TZ-safe (UTC). */
function inclusiveDays(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86_400_000) + 1;
}

function ptoAvailable(b: PTOBalance | undefined): number {
  if (!b) return 0;
  return b.ptoAccruedHours + b.carryOverHours - b.ptoUsedHours;
}
function sickAvailable(b: PTOBalance | undefined): number {
  if (!b) return 0;
  return b.sickAccruedHours - b.sickUsedHours;
}

export default function TimeOffPage() {
  const { profile, user, isAdmin } = useAuth();
  const myUserId = profile?.userId ?? user?.id ?? "";
  const myName = profile?.fullName ?? user?.fullName ?? "Me";
  const year = new Date().getFullYear();

  const reqQ = useCollection("timeOffRequests");
  const balQ = useCollection("ptoBalances");
  const createReq = useCreate("timeOffRequests");
  const updateReq = useUpdate("timeOffRequests");
  const updateBal = useUpdate("ptoBalances");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ type: TimeOffType; startDate: string; endDate: string; reason: string }>(
    { type: "pto", startDate: "", endDate: "", reason: "" },
  );
  const [busy, setBusy] = useState(false);

  const requests = useMemo(() => reqQ.data ?? [], [reqQ.data]);
  const balances = useMemo(() => balQ.data ?? [], [balQ.data]);

  const myBalance = useMemo(
    () => balances.find((b) => b.userId === myUserId && b.year === year),
    [balances, myUserId, year],
  );

  const visibleRequests = useMemo(
    () => (isAdmin ? requests : requests.filter((r) => r.userId === myUserId)),
    [requests, isAdmin, myUserId],
  );
  const pendingRequests = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);

  const days = useMemo(
    () => (form.startDate && form.endDate ? inclusiveDays(form.startDate, form.endDate) : 0),
    [form.startDate, form.endDate],
  );
  const requestHours = days * HOURS_PER_DAY;

  // Balance-aware validation
  const balanceError = useMemo(() => {
    if (requestHours <= 0) return null;
    if (form.type === "pto" && requestHours > ptoAvailable(myBalance)) {
      return `Exceeds your available PTO (${ptoAvailable(myBalance)}h).`;
    }
    if (form.type === "sick" && requestHours > sickAvailable(myBalance)) {
      return `Exceeds your available sick leave (${sickAvailable(myBalance)}h).`;
    }
    return null;
  }, [form.type, requestHours, myBalance]);

  async function submitRequest() {
    if (days <= 0) { toast.error("Choose a valid date range."); return; }
    if (balanceError) { toast.error(balanceError); return; }
    setBusy(true);
    try {
      await createReq.mutateAsync({
        userId: myUserId,
        userName: myName,
        requestType: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        hours: requestHours,
        reason: form.reason.trim() || undefined,
        status: "pending",
        reviewerName: null,
        reviewNote: null,
        reviewedAt: null,
      });
      setShowForm(false);
      setForm({ type: "pto", startDate: "", endDate: "", reason: "" });
      toast.success("Time-off request submitted");
    } catch {
      toast.error("Failed to submit request.");
    } finally {
      setBusy(false);
    }
  }

  /** On approve, deduct PTO/sick hours from the requester's balance for the year. */
  async function applyBalanceDeduction(r: TimeOffRequest) {
    const bal = balances.find((b) => b.userId === r.userId && b.year === year);
    if (!bal) return; // no balance row tracked; nothing to deduct
    if (r.requestType === "pto") {
      await updateBal.mutateAsync({ id: bal.id, patch: { ptoUsedHours: bal.ptoUsedHours + r.hours } });
    } else if (r.requestType === "sick") {
      await updateBal.mutateAsync({ id: bal.id, patch: { sickUsedHours: bal.sickUsedHours + r.hours } });
    } else if (r.requestType === "holiday") {
      await updateBal.mutateAsync({ id: bal.id, patch: { holidayUsedHours: bal.holidayUsedHours + r.hours } });
    }
  }

  async function review(r: TimeOffRequest, decision: "approved" | "denied") {
    setBusy(true);
    try {
      await updateReq.mutateAsync({
        id: r.id,
        patch: { status: decision, reviewerName: myName, reviewedAt: new Date().toISOString() },
      });
      if (decision === "approved") await applyBalanceDeduction(r);
      toast.success(`Request ${decision}`);
    } catch {
      toast.error("Failed to update request.");
    } finally {
      setBusy(false);
    }
  }

  if (reqQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Time Off" />
        <ErrorState message="We couldn't load time-off data." onRetry={() => void reqQ.refetch()} />
      </div>
    );
  }

  const loading = reqQ.isLoading || balQ.isLoading;

  return (
    <div className="space-y-6">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">Request time off</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="grid gap-4 p-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <select className="input w-full" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as TimeOffType }))}>
                  {timeOffTypes.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
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
              {days > 0 && (
                <p className="text-sm text-muted-foreground">
                  {days} calendar day{days > 1 ? "s" : ""} · {requestHours}h
                  {(form.type === "pto" || form.type === "sick") && (
                    <> · {form.type === "pto" ? ptoAvailable(myBalance) : sickAvailable(myBalance)}h available</>
                  )}
                </p>
              )}
              {balanceError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{balanceError}</p>}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Reason (optional)</label>
                <input className="input w-full" placeholder="Brief reason…" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submitRequest} disabled={days <= 0 || !!balanceError || busy}>Submit request</Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Time Off"
        description="PTO requests, sick leave, and balances."
        actions={<Button onClick={() => setShowForm(true)}><Plus className="size-4" /> Request time off</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="PTO available (hrs)" value={ptoAvailable(myBalance)} icon={Umbrella} tone="success" loading={loading} />
        <StatCard label="PTO used (hrs)" value={myBalance?.ptoUsedHours ?? 0} icon={Umbrella} loading={loading} />
        <StatCard label="Sick available (hrs)" value={sickAvailable(myBalance)} icon={Umbrella} tone="success" loading={loading} />
        <StatCard label="My pending requests" value={visibleRequests.filter((r) => r.userId === myUserId && r.status === "pending").length} icon={Umbrella} tone="warning" loading={loading} />
      </div>

      {isAdmin && pendingRequests.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Pending approvals</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/20 p-4">
                  <div>
                    <p className="font-medium">{r.userName} — {TYPE_LABEL[r.requestType]}</p>
                    <p className="text-sm text-muted-foreground">{r.startDate} to {r.endDate} ({r.hours}h)</p>
                    {r.reason && <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => review(r, "approved")} disabled={busy}><Check className="size-3" /> Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => review(r, "denied")} disabled={busy}><X className="size-3" /> Deny</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{isAdmin ? "All requests" : "My requests"}</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : visibleRequests.length === 0 ? (
            <EmptyState icon={Umbrella} title="No requests yet" description="Submit a time-off request to get started." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    {isAdmin && <th className="pb-2 pr-4 font-medium">Employee</th>}
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Dates</th>
                    <th className="pb-2 pr-4 font-medium text-right">Hours</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Reviewed by</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRequests.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                      {isAdmin && <td data-label="Employee" className="py-3 pr-4 font-medium">{r.userName}</td>}
                      <td data-label="Type" className="py-3 pr-4">{TYPE_LABEL[r.requestType]}</td>
                      <td data-label="Dates" className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{r.startDate} – {r.endDate}</td>
                      <td data-label="Hours" className="py-3 pr-4 text-right tabular-nums">{r.hours}h</td>
                      <td data-label="Status" className="py-3 pr-4"><Badge variant={STATUS_VARIANT[r.status]} className="capitalize">{r.status}</Badge></td>
                      <td data-label="Reviewed by" className="py-3 text-muted-foreground">{r.reviewerName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle>PTO balances — {year}</CardTitle></CardHeader>
          <CardContent>
            {balances.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No balances tracked yet. Add balance records to enforce PTO limits.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm rtable">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Employee</th>
                      <th className="pb-2 pr-4 text-right font-medium">PTO accrued</th>
                      <th className="pb-2 pr-4 text-right font-medium">Carryover</th>
                      <th className="pb-2 pr-4 text-right font-medium">PTO used</th>
                      <th className="pb-2 pr-4 text-right font-medium">PTO remaining</th>
                      <th className="pb-2 text-right font-medium">Sick remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.filter((b) => b.year === year).map((b) => (
                      <tr key={b.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Employee" className="py-3 pr-4 font-medium">{b.userName}</td>
                        <td data-label="PTO accrued" className="py-3 pr-4 text-right tabular-nums">{b.ptoAccruedHours}h</td>
                        <td data-label="Carryover" className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{b.carryOverHours}h</td>
                        <td data-label="PTO used" className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{b.ptoUsedHours}h</td>
                        <td data-label="PTO remaining" className="py-3 pr-4 text-right font-medium tabular-nums">{ptoAvailable(b)}h</td>
                        <td data-label="Sick remaining" className="py-3 text-right tabular-nums">{sickAvailable(b)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
