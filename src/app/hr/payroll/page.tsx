"use client";

import { useState, useMemo } from "react";
import { DollarSign, Download, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { logAudit } from "@/lib/data/audit";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/shared/states";
import type { PayrollRecord } from "@/lib/data/schema";
import { toast } from "sonner";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function toCents(dollars: string): number {
  const n = parseFloat(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function toDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

const STATUS_VARIANT: Record<PayrollRecord["status"], "success" | "warning" | "secondary" | "destructive"> = {
  paid: "success",
  approved: "warning",
  draft: "secondary",
  voided: "destructive",
};

const DEDUCTION_FIELDS = [
  ["federalTaxCents", "Federal tax"],
  ["stateTaxCents", "State tax"],
  ["socialSecurityCents", "Social Security"],
  ["medicareCents", "Medicare"],
  ["healthInsuranceCents", "Health insurance"],
  ["retirement401kCents", "401(k)"],
  ["otherDeductionsCents", "Other"],
] as const;

type DeductionKey = (typeof DEDUCTION_FIELDS)[number][0];

interface FormState {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  regularHours: string;
  otHours: string;
  ptoHours: string;
  grossPay: string;
  paymentMethod: PayrollRecord["paymentMethod"];
  deductions: Record<DeductionKey, string>;
}

const EMPTY_FORM: FormState = {
  employeeId: "",
  periodStart: "",
  periodEnd: "",
  regularHours: "0",
  otHours: "0",
  ptoHours: "0",
  grossPay: "",
  paymentMethod: "direct_deposit",
  deductions: {
    federalTaxCents: "",
    stateTaxCents: "",
    socialSecurityCents: "",
    medicareCents: "",
    healthInsuranceCents: "",
    retirement401kCents: "",
    otherDeductionsCents: "",
  },
};

export default function PayrollPage() {
  const { profile, user } = useAuth();
  const actorName = profile?.fullName ?? user?.fullName ?? "Unknown";
  const actorEmail = profile?.email ?? user?.email;

  const empQ = useCollection("employees");
  const payQ = useCollection("payrollRecords");
  const createMut = useCreate("payrollRecords");
  const updateMut = useUpdate("payrollRecords");

  const employees = useMemo(() => empQ.data ?? [], [empQ.data]);
  const records = useMemo(() => payQ.data ?? [], [payQ.data]);

  const [filterEmployee, setFilterEmployee] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | PayrollRecord["status"]>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const grossCents = toCents(form.grossPay);
  const totalDeductionCents = DEDUCTION_FIELDS.reduce((s, [k]) => s + toCents(form.deductions[k]), 0);
  const netCents = grossCents - totalDeductionCents;

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filterEmployee !== "all" && r.employeeId !== filterEmployee) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      return true;
    });
  }, [records, filterEmployee, filterStatus]);

  const stats = useMemo(() => {
    const paid = records.filter((r) => r.status === "paid");
    return {
      totalPaid: paid.reduce((s, r) => s + r.netPayCents, 0),
      pending: records.filter((r) => r.status === "draft" || r.status === "approved").length,
      draft: records.filter((r) => r.status === "draft").length,
    };
  }, [records]);

  async function saveRecord() {
    const emp = employees.find((e) => e.id === form.employeeId);
    if (!emp) { toast.error("Choose an employee."); return; }
    if (!form.periodStart || !form.periodEnd) { toast.error("Set the pay period dates."); return; }
    if (form.periodEnd < form.periodStart) { toast.error("Period end must be after start."); return; }
    if (grossCents <= 0) { toast.error("Gross pay must be greater than zero."); return; }
    if (netCents < 0) { toast.error("Deductions exceed gross pay — net would be negative."); return; }
    setBusy(true);
    try {
      await createMut.mutateAsync({
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        regularHours: parseFloat(form.regularHours) || 0,
        otHours: parseFloat(form.otHours) || 0,
        ptoHours: parseFloat(form.ptoHours) || 0,
        grossPayCents: grossCents,
        federalTaxCents: toCents(form.deductions.federalTaxCents),
        stateTaxCents: toCents(form.deductions.stateTaxCents),
        socialSecurityCents: toCents(form.deductions.socialSecurityCents),
        medicareCents: toCents(form.deductions.medicareCents),
        healthInsuranceCents: toCents(form.deductions.healthInsuranceCents),
        retirement401kCents: toCents(form.deductions.retirement401kCents),
        otherDeductionsCents: toCents(form.deductions.otherDeductionsCents),
        netPayCents: netCents,
        paymentMethod: form.paymentMethod,
        status: "draft",
      });
      // Audit is written server-side by a DB trigger on payroll_records.
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast.success("Payroll draft created");
    } catch {
      toast.error("Failed to create payroll record.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(r: PayrollRecord, status: PayrollRecord["status"], label: string) {
    setBusy(true);
    try {
      await updateMut.mutateAsync({ id: r.id, patch: { status } });
      // Audit is written server-side by a DB trigger on payroll_records.
      toast.success(`Payroll ${label}`);
    } catch {
      toast.error("Failed to update payroll record.");
    } finally {
      setBusy(false);
    }
  }

  function exportCSV() {
    const header = ["Employee", "Period Start", "Period End", "Gross", "Deductions", "Net Pay", "Method", "Status"];
    const rows = filtered.map((r) => [
      r.employeeName, r.periodStart, r.periodEnd,
      toDollars(r.grossPayCents),
      toDollars(r.grossPayCents - r.netPayCents),
      toDollars(r.netPayCents),
      r.paymentMethod, r.status,
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "payroll.csv"; a.click();
    URL.revokeObjectURL(url);
    void logAudit({ actorName, actorEmail, action: "export", entityType: "payroll_record", details: `Exported ${filtered.length} payroll rows`, riskLevel: "high" });
  }

  if (payQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payroll" />
        <ErrorState message="We couldn't load payroll records." onRetry={() => void payQ.refetch()} />
      </div>
    );
  }

  const loading = payQ.isLoading || empQ.isLoading;

  return (
    <div className="space-y-6">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">New payroll record</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Employee *</label>
                <select className="input w-full" value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}>
                  <option value="">Select employee…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Period start *</label>
                  <input type="date" className="input w-full" value={form.periodStart} onChange={(e) => setForm((p) => ({ ...p, periodStart: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Period end *</label>
                  <input type="date" className="input w-full" value={form.periodEnd} min={form.periodStart} onChange={(e) => setForm((p) => ({ ...p, periodEnd: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Reg. hours</label>
                  <input type="number" min="0" step="0.5" className="input w-full" value={form.regularHours} onChange={(e) => setForm((p) => ({ ...p, regularHours: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">OT hours</label>
                  <input type="number" min="0" step="0.5" className="input w-full" value={form.otHours} onChange={(e) => setForm((p) => ({ ...p, otHours: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">PTO hours</label>
                  <input type="number" min="0" step="0.5" className="input w-full" value={form.ptoHours} onChange={(e) => setForm((p) => ({ ...p, ptoHours: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Gross pay ($) *</label>
                <input type="number" min="0" step="0.01" className="input w-full" value={form.grossPay} onChange={(e) => setForm((p) => ({ ...p, grossPay: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Deductions ($)</p>
                <div className="grid grid-cols-2 gap-3">
                  {DEDUCTION_FIELDS.map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs text-muted-foreground">{label}</label>
                      <input type="number" min="0" step="0.01" className="input w-full" value={form.deductions[key]}
                        onChange={(e) => setForm((p) => ({ ...p, deductions: { ...p.deductions, [key]: e.target.value } }))} placeholder="0.00" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Payment method</label>
                <select className="input w-full" value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value as PayrollRecord["paymentMethod"] }))}>
                  <option value="direct_deposit">Direct deposit</option>
                  <option value="check">Check</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/30 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Net pay</span>
                <span className={`font-semibold tabular-nums ${netCents < 0 ? "text-destructive" : ""}`}>{formatCents(netCents)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={busy}>Cancel</Button>
              <Button onClick={saveRecord} disabled={busy}>Create draft</Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Payroll"
        description="Pay-period records with a draft → approved → paid workflow. All changes are written to the audit trail."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV}><Download className="size-4" /> Export CSV</Button>
            <Button onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}><Plus className="size-4" /> New record</Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Net pay paid (all time)" value={formatCents(stats.totalPaid)} icon={DollarSign} tone="success" loading={loading} />
        <StatCard label="Awaiting payment" value={stats.pending} icon={DollarSign} tone={stats.pending > 0 ? "warning" : "default"} loading={loading} />
        <StatCard label="Drafts" value={stats.draft} icon={DollarSign} loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <select className="input" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
              <option value="all">All employees</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
            <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="voided">Voided</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={DollarSign} title="No payroll records" description="Create a payroll record to get started." action={<Button onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}><Plus className="size-4" /> New record</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Employee</th>
                    <th className="pb-2 pr-4 font-medium">Pay period</th>
                    <th className="pb-2 pr-4 text-right font-medium">Gross</th>
                    <th className="pb-2 pr-4 text-right font-medium">Net pay</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td data-label="Employee" className="py-3 pr-4 font-medium">{r.employeeName}</td>
                      <td data-label="Pay period" className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{r.periodStart} – {r.periodEnd}</td>
                      <td data-label="Gross" className="py-3 pr-4 text-right tabular-nums">{formatCents(r.grossPayCents)}</td>
                      <td data-label="Net pay" className="py-3 pr-4 text-right font-medium tabular-nums">{formatCents(r.netPayCents)}</td>
                      <td data-label="Status" className="py-3 pr-4"><Badge variant={STATUS_VARIANT[r.status]} className="capitalize">{r.status}</Badge></td>
                      <td data-label="" className="py-3">
                        <div className="flex gap-1.5 md:justify-end">
                          {r.status === "draft" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => transition(r, "approved", "approved")} disabled={busy}>Approve</Button>
                              <Button size="sm" variant="ghost" onClick={() => transition(r, "voided", "voided")} disabled={busy}>Void</Button>
                            </>
                          )}
                          {r.status === "approved" && (
                            <>
                              <Button size="sm" onClick={() => transition(r, "paid", "marked paid")} disabled={busy}>Mark paid</Button>
                              <Button size="sm" variant="ghost" onClick={() => transition(r, "voided", "voided")} disabled={busy}>Void</Button>
                            </>
                          )}
                          {(r.status === "paid" || r.status === "voided") && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
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
