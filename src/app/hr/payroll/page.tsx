"use client";

import { useState, useMemo } from "react";
import { DollarSign, Download, Plus, X, Sparkles, Search, FileClock } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate } from "@/lib/data/hooks";
import { logAudit } from "@/lib/data/audit";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { useSort, SortHeader } from "@/components/shared/sortable";
import type { PayrollRecord } from "@/lib/data/schema";
import { askSage } from "@/lib/guide/context";
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

  const employees = useMemo(() => empQ.data ?? [], [empQ.data]);
  const records = useMemo(() => payQ.data ?? [], [payQ.data]);

  const [filterEmployee, setFilterEmployee] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const grossCents = toCents(form.grossPay);
  const totalDeductionCents = DEDUCTION_FIELDS.reduce((s, [k]) => s + toCents(form.deductions[k]), 0);
  const netCents = grossCents - totalDeductionCents;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (filterEmployee !== "all" && r.employeeId !== filterEmployee) return false;
      if (q && !(r.employeeName.toLowerCase().includes(q) || `${r.periodStart} ${r.periodEnd}`.includes(q))) return false;
      return true;
    });
  }, [records, filterEmployee, search]);

  const { sorted, sort, toggle } = useSort(filtered, {
    employee: (r) => r.employeeName,
    period: (r) => r.periodStart,
    gross: (r) => r.grossPayCents,
    net: (r) => r.netPayCents,
  });

  const stats = useMemo(() => ({
    totalNet: records.reduce((s, r) => s + r.netPayCents, 0),
    count: records.length,
    employees: new Set(records.map((r) => r.employeeId)).size,
  }), [records]);

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
        // Historical repository: records represent payroll that already happened.
        status: "paid",
      });
      // Audit is written server-side by a DB trigger on payroll_records.
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast.success("Payroll record added");
    } catch {
      toast.error("Failed to add payroll record.");
    } finally {
      setBusy(false);
    }
  }

  function exportCSV() {
    const header = ["Employee", "Period Start", "Period End", "Gross", "Deductions", "Net Pay", "Method"];
    const rows = filtered.map((r) => [
      r.employeeName, r.periodStart, r.periodEnd,
      toDollars(r.grossPayCents),
      toDollars(r.grossPayCents - r.netPayCents),
      toDollars(r.netPayCents),
      r.paymentMethod,
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">Add historical payroll record</h2>
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
              <Button onClick={saveRecord} disabled={busy}>Add record</Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Payroll records"
        description="A searchable archive of historical payroll records — visible only to Owners and HR. Ask Sage to search it (“what did we pay Jane in 2025?”). This is a record repository, not a payroll processor."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => askSage("Search our payroll records and summarize what you find.")}><Sparkles className="size-4" /> Ask Sage</Button>
            <Button variant="outline" onClick={exportCSV}><Download className="size-4" /> Export CSV</Button>
            <Button onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}><Plus className="size-4" /> Add record</Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total net pay (on record)" value={formatCents(stats.totalNet)} icon={DollarSign} tone="success" loading={loading} />
        <StatCard label="Records" value={stats.count} icon={FileClock} loading={loading} />
        <StatCard label="Employees on record" value={stats.employees} icon={DollarSign} loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-full pl-9" placeholder="Search by employee or period…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="input" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
              <option value="all">All employees</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={DollarSign} title="No payroll records" description="Add historical payroll records to build a searchable archive." action={<Button onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}><Plus className="size-4" /> Add record</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Employee" sortKey="employee" sort={sort} onToggle={toggle} />
                    <SortHeader label="Pay period" sortKey="period" sort={sort} onToggle={toggle} />
                    <SortHeader label="Gross" sortKey="gross" sort={sort} onToggle={toggle} align="right" className="text-right" />
                    <SortHeader label="Net pay" sortKey="net" sort={sort} onToggle={toggle} align="right" className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td data-label="Employee" className="py-3 pr-4 font-medium">{r.employeeName}</td>
                      <td data-label="Pay period" className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{r.periodStart} – {r.periodEnd}</td>
                      <td data-label="Gross" className="py-3 pr-4 text-right tabular-nums">{formatCents(r.grossPayCents)}</td>
                      <td data-label="Net pay" className="py-3 pr-4 text-right font-medium tabular-nums">{formatCents(r.netPayCents)}</td>
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
