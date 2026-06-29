"use client";

import { useState, useMemo } from "react";
import { DollarSign, Download } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/states";

// Payroll records. In production these come from a payroll integration.
// We derive seed records from the employee list so the data stays consistent.
interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  grossPayCents: number;
  taxesCents: number;
  deductionsCents: number;
  netPayCents: number;
  status: "processed" | "pending" | "void";
  payType: "salary" | "hourly";
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function dateRange(weeksAgo: number): { start: string; end: string; payDate: string } {
  const end = new Date();
  end.setDate(end.getDate() - weeksAgo * 7);
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  const payDate = new Date(end);
  payDate.setDate(payDate.getDate() + 3);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    payDate: payDate.toISOString().slice(0, 10),
  };
}

const BASE_SALARIES: Record<string, number> = {
  "Jane Doe": 9500_00,
  "Sarah Mitchell": 7200_00,
  "Mike Carter": 6800_00,
  "Emily Torres": 7800_00,
  "David Lee": 5500_00,
};

function seedRecords(): PayrollRecord[] {
  const records: PayrollRecord[] = [];
  const employees = Object.entries(BASE_SALARIES);
  for (let w = 0; w < 3; w++) {
    const range = dateRange(w * 2);
    employees.forEach(([name, gross], idx) => {
      const taxes = Math.round(gross * 0.22);
      const deductions = Math.round(gross * 0.05);
      records.push({
        id: `pay-${w}-${idx}`,
        employeeId: `emp-${idx}`,
        employeeName: name,
        payPeriodStart: range.start,
        payPeriodEnd: range.end,
        payDate: range.payDate,
        grossPayCents: gross,
        taxesCents: taxes,
        deductionsCents: deductions,
        netPayCents: gross - taxes - deductions,
        status: w === 0 ? "pending" : "processed",
        payType: "salary",
      });
    });
  }
  return records;
}

const SEED_RECORDS = seedRecords();

const STATUS_VARIANT: Record<PayrollRecord["status"], "success" | "warning" | "secondary"> = {
  processed: "success",
  pending: "warning",
  void: "secondary",
};

export default function PayrollPage() {
  const empQ = useCollection("employees");
  const employees = empQ.data ?? [];

  const [filterEmployee, setFilterEmployee] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | PayrollRecord["status"]>("all");

  const records = SEED_RECORDS;

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filterEmployee !== "all" && r.employeeName !== filterEmployee) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      return true;
    });
  }, [records, filterEmployee, filterStatus]);

  const stats = useMemo(() => {
    const processed = records.filter((r) => r.status === "processed");
    return {
      totalProcessed: processed.reduce((s, r) => s + r.netPayCents, 0),
      pending: records.filter((r) => r.status === "pending").length,
      headcount: new Set(records.map((r) => r.employeeName)).size,
    };
  }, [records]);

  function exportCSV() {
    const header = ["Employee", "Pay Period Start", "Pay Period End", "Pay Date", "Gross Pay", "Taxes", "Deductions", "Net Pay", "Status"];
    const rows = filtered.map((r) => [
      r.employeeName,
      r.payPeriodStart,
      r.payPeriodEnd,
      r.payDate,
      (r.grossPayCents / 100).toFixed(2),
      (r.taxesCents / 100).toFixed(2),
      (r.deductionsCents / 100).toFixed(2),
      (r.netPayCents / 100).toFixed(2),
      r.status,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "payroll.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const employeeNames = [...new Set(records.map((r) => r.employeeName))].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Payroll records by pay period. In production this integrates with your payroll provider via API."
        actions={
          <Button variant="outline" onClick={exportCSV}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Net pay processed (last 2 periods)" value={formatCents(stats.totalProcessed)} icon={DollarSign} tone="success" loading={empQ.isLoading} />
        <StatCard label="Pending payrolls" value={stats.pending} icon={DollarSign} tone={stats.pending > 0 ? "warning" : "default"} loading={empQ.isLoading} />
        <StatCard label="Active payees" value={stats.headcount} icon={DollarSign} loading={empQ.isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <select className="input" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
              <option value="all">All employees</option>
              {employeeNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}>
              <option value="all">All statuses</option>
              <option value="processed">Processed</option>
              <option value="pending">Pending</option>
              <option value="void">Void</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {empQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={DollarSign} title="No payroll records" description="No records match the current filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Employee</th>
                    <th className="pb-2 pr-4 font-medium">Pay period</th>
                    <th className="pb-2 pr-4 font-medium">Pay date</th>
                    <th className="pb-2 pr-4 font-medium text-right">Gross</th>
                    <th className="pb-2 pr-4 font-medium text-right">Taxes</th>
                    <th className="pb-2 pr-4 font-medium text-right">Net pay</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-3 pr-4 font-medium">{r.employeeName}</td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{r.payPeriodStart} – {r.payPeriodEnd}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{r.payDate}</td>
                      <td className="py-3 pr-4 tabular-nums text-right">{formatCents(r.grossPayCents)}</td>
                      <td className="py-3 pr-4 tabular-nums text-right text-muted-foreground">{formatCents(r.taxesCents)}</td>
                      <td className="py-3 pr-4 tabular-nums text-right font-medium">{formatCents(r.netPayCents)}</td>
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

      {employees.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Showing demo payroll data. Connect a payroll integration to pull live records.
        </div>
      )}
    </div>
  );
}
