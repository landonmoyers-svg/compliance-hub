"use client";

import { useState, useMemo } from "react";
import { ShieldAlert, Plus, Search, X, Check } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useSort, SortHeader } from "@/components/shared/sortable";
import type { ControlledSubstanceLog } from "@/lib/data/schema";
import { formatDate } from "@/lib/dates";
import { toast } from "sonner";

type ScheduleClass = ControlledSubstanceLog["scheduleClass"];
type TransactionType = ControlledSubstanceLog["transactionType"];

const SCHEDULES: ScheduleClass[] = ["II", "III", "IV", "V"];
const TX_TYPES: TransactionType[] = ["receive", "dispense", "return", "dispose", "adjustment"];

const TX_LABEL: Record<TransactionType, string> = {
  receive: "Receive",
  dispense: "Dispense",
  return: "Return",
  dispose: "Dispose",
  adjustment: "Adjustment",
};

const TX_VARIANT: Record<TransactionType, "success" | "warning" | "destructive" | "secondary" | "default"> = {
  receive: "success",
  dispense: "default",
  return: "secondary",
  dispose: "warning",
  adjustment: "secondary",
};

const SCHED_VARIANT: Record<ScheduleClass, "destructive" | "warning" | "secondary"> = {
  II: "destructive",
  III: "warning",
  IV: "warning",
  V: "secondary",
};

/** Transactions that increase the on-hand balance. */
const ADDS: TransactionType[] = ["receive", "return"];
/** Transactions that decrease the on-hand balance. */
const SUBTRACTS: TransactionType[] = ["dispense", "dispose"];

/** Effective date used for ordering: transactionDate if present, else createdDate. */
function effectiveDate(e: ControlledSubstanceLog): string {
  return e.transactionDate ?? e.createdDate ?? "";
}

/** Sort newest-first by effective date, breaking ties with createdDate. */
function byNewest(a: ControlledSubstanceLog, b: ControlledSubstanceLog): number {
  const ea = effectiveDate(a);
  const eb = effectiveDate(b);
  if (ea !== eb) return eb.localeCompare(ea);
  return (b.createdDate ?? "").localeCompare(a.createdDate ?? "");
}

/** Signed display quantity for the log table (+ for adds, - for subtracts). */
function signedQuantity(e: ControlledSubstanceLog): string {
  if (ADDS.includes(e.transactionType)) return `+${e.quantity}`;
  if (SUBTRACTS.includes(e.transactionType)) return `-${e.quantity}`;
  return `${e.quantity}`; // adjustment = absolute set
}

const today = () => new Date().toISOString().slice(0, 10);

interface FormState {
  substanceName: string;
  scheduleClass: ScheduleClass;
  transactionType: TransactionType;
  quantity: string;
  patientRef: string;
  prescriberName: string;
  witnessName: string;
  transactionDate: string;
  notes: string;
}

const emptyForm = (witness: string): FormState => ({
  substanceName: "",
  scheduleClass: "II",
  transactionType: "dispense",
  quantity: "",
  patientRef: "",
  prescriberName: "",
  witnessName: witness,
  transactionDate: today(),
  notes: "",
});

export default function ControlledSubstancesPage() {
  const { profile, user } = useAuth();
  const myName = profile?.fullName ?? user?.fullName ?? "";

  const { data, isLoading, isError, refetch } = useCollection("controlledSubstanceLogs");
  const createMut = useCreate("controlledSubstanceLogs");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(myName));
  const [saving, setSaving] = useState(false);

  const [filterSubstance, setFilterSubstance] = useState<string>("all");
  const [filterType, setFilterType] = useState<TransactionType | "all">("all");
  const [search, setSearch] = useState("");

  const logs = useMemo(() => data ?? [], [data]);

  const sorted = useMemo(() => [...logs].sort(byNewest), [logs]);

  /** Distinct substance names (preserving a stable, sorted order). */
  const substances = useMemo(() => {
    const set = new Set(logs.map((l) => l.substanceName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [logs]);

  /** Current balance + last-counted date per substance, from its newest tx. */
  const inventory = useMemo(() => {
    const map = new Map<string, ControlledSubstanceLog>();
    for (const l of logs) {
      const existing = map.get(l.substanceName);
      if (!existing || byNewest(l, existing) < 0) map.set(l.substanceName, l);
    }
    return Array.from(map.values())
      .map((l) => ({
        substanceName: l.substanceName,
        scheduleClass: l.scheduleClass,
        currentBalance: l.balanceAfter,
        lastCounted: effectiveDate(l),
      }))
      .sort((a, b) => a.substanceName.localeCompare(b.substanceName));
  }, [logs]);

  const filteredLog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((e) => {
      if (filterSubstance !== "all" && e.substanceName !== filterSubstance) return false;
      if (filterType !== "all" && e.transactionType !== filterType) return false;
      if (q && !e.substanceName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sorted, filterSubstance, filterType, search]);

  const stats = useMemo(() => ({
    distinct: substances.length,
    total: logs.length,
    dispenses: logs.filter((l) => l.transactionType === "dispense").length,
    atOrBelowZero: inventory.filter((i) => i.currentBalance <= 0).length,
  }), [substances, logs, inventory]);

  const { sorted: invSorted, sort: invSort, toggle: invToggle } = useSort(inventory, {
    substance: (i) => i.substanceName,
    schedule: (i) => i.scheduleClass,
    balance: (i) => i.currentBalance,
    lastCounted: (i) => i.lastCounted,
  });

  const { sorted: logSorted, sort: logSort, toggle: logToggle } = useSort(filteredLog, {
    date: (e) => effectiveDate(e),
    substance: (e) => e.substanceName,
    schedule: (e) => e.scheduleClass,
    type: (e) => TX_LABEL[e.transactionType],
    quantity: (e) => (SUBTRACTS.includes(e.transactionType) ? -e.quantity : e.quantity),
    balance: (e) => e.balanceAfter,
    prescriber: (e) => e.prescriberName,
    witness: (e) => e.witnessName,
    patientRef: (e) => e.patientRef,
  });

  /** Most recent prior balance for a substance (newest tx's balanceAfter, else 0). */
  function priorBalance(substanceName: string): number {
    const prior = logs
      .filter((l) => l.substanceName === substanceName)
      .sort(byNewest)[0];
    return prior ? prior.balanceAfter : 0;
  }

  function computeBalance(
    substanceName: string,
    type: TransactionType,
    qty: number,
  ): number {
    if (type === "adjustment") return qty; // absolute corrected count
    const prior = priorBalance(substanceName);
    if (ADDS.includes(type)) return prior + qty;
    return prior - qty; // dispense / dispose
  }

  async function save() {
    const name = form.substanceName.trim();
    const qty = Number(form.quantity);
    if (!name) {
      toast.error("Substance name is required.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be a number greater than 0.");
      return;
    }

    const balanceAfter = computeBalance(name, form.transactionType, qty);
    const negative =
      SUBTRACTS.includes(form.transactionType) && balanceAfter < 0;

    setSaving(true);
    try {
      await createMut.mutateAsync({
        substanceName: name,
        scheduleClass: form.scheduleClass,
        transactionType: form.transactionType,
        quantity: qty,
        balanceAfter,
        patientRef: form.patientRef.trim() || undefined,
        prescriberName: form.prescriberName.trim() || undefined,
        witnessName: form.witnessName.trim() || undefined,
        transactionDate: form.transactionDate || today(),
        notes: form.notes.trim() || undefined,
      });
      if (negative) {
        toast.warning(
          `Recorded — but ${name} is now at ${balanceAfter}. Negative balance flagged; verify physical count.`,
        );
      } else {
        toast.success("Transaction recorded.");
      }
      setShowForm(false);
      setForm(emptyForm(myName));
    } catch {
      toast.error("Failed to record transaction.");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // Live preview of the computed balance in the modal.
  const previewQty = Number(form.quantity);
  const previewValid = Number.isFinite(previewQty) && previewQty > 0 && !!form.substanceName.trim();
  const previewBalance = previewValid
    ? computeBalance(form.substanceName.trim(), form.transactionType, previewQty)
    : null;

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Controlled Substances" />
        <ErrorState message="We couldn't load the controlled substance log." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">Record transaction</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Substance *</label>
                <input
                  className="input w-full"
                  list="cs-substances"
                  value={form.substanceName}
                  onChange={set("substanceName")}
                  placeholder="Name, strength, form"
                />
                <datalist id="cs-substances">
                  {substances.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">DEA Schedule</label>
                <select className="input w-full" value={form.scheduleClass} onChange={set("scheduleClass")}>
                  {SCHEDULES.map((s) => <option key={s} value={s}>Schedule {s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Transaction type</label>
                <select className="input w-full" value={form.transactionType} onChange={set("transactionType")}>
                  {TX_TYPES.map((t) => <option key={t} value={t}>{TX_LABEL[t]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Quantity *{form.transactionType === "adjustment" ? " (corrected total)" : ""}
                </label>
                <input type="number" min="0" step="any" className="input w-full" value={form.quantity} onChange={set("quantity")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date</label>
                <input type="date" className="input w-full" value={form.transactionDate} onChange={set("transactionDate")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Prescriber</label>
                <input className="input w-full" value={form.prescriberName} onChange={set("prescriberName")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Witness</label>
                <input className="input w-full" value={form.witnessName} onChange={set("witnessName")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Patient reference (de-identified)</label>
                <input className="input w-full" value={form.patientRef} onChange={set("patientRef")} placeholder="De-identified ID only" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea className="input w-full min-h-[60px] resize-y" value={form.notes} onChange={set("notes")} />
              </div>
              {previewBalance !== null && (
                <p className={`sm:col-span-2 rounded-md px-3 py-2 text-sm ${previewBalance < 0 ? "bg-destructive/10 text-destructive" : "bg-secondary/40 text-muted-foreground"}`}>
                  New balance after this transaction: <span className="font-medium tabular-nums">{previewBalance}</span>
                  {previewBalance < 0 && " — negative balance will be flagged."}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : <><Check className="size-3" /> Record</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Controlled Substances"
        description="DEA Schedule II–V transaction log. DEA requires a biennial (every 2 years) physical inventory, and all records must be retained for at least 2 years. Disposals and losses may require DEA Form 41 (destruction) or Form 106 (theft/loss)."
        actions={<Button onClick={() => { setForm(emptyForm(myName)); setShowForm(true); }}><Plus className="size-4" /> Record transaction</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Substances tracked" value={stats.distinct} icon={ShieldAlert} loading={isLoading} />
        <StatCard label="Total transactions" value={stats.total} icon={ShieldAlert} loading={isLoading} />
        <StatCard label="Dispenses" value={stats.dispenses} icon={ShieldAlert} loading={isLoading} />
        <StatCard label="At / below zero" value={stats.atOrBelowZero} icon={ShieldAlert} tone={stats.atOrBelowZero ? "destructive" : "default"} loading={isLoading} />
      </div>

      {/* Current inventory */}
      <Card>
        <CardHeader><CardTitle>Current inventory</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : inventory.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No substances tracked yet. Record a transaction to begin building inventory.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Substance" sortKey="substance" sort={invSort} onToggle={invToggle} />
                    <SortHeader label="Schedule" sortKey="schedule" sort={invSort} onToggle={invToggle} />
                    <SortHeader label="Current balance" sortKey="balance" sort={invSort} onToggle={invToggle} className="text-right" align="right" />
                    <SortHeader label="Last counted" sortKey="lastCounted" sort={invSort} onToggle={invToggle} className="pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {invSorted.map((i) => (
                    <tr key={i.substanceName} className="border-b border-border/50 hover:bg-secondary/20">
                      <td data-label="Substance" className="py-3 pr-4 font-medium">{i.substanceName}</td>
                      <td data-label="Schedule" className="py-3 pr-4"><Badge variant={SCHED_VARIANT[i.scheduleClass]}>Schedule {i.scheduleClass}</Badge></td>
                      <td data-label="Current balance" className={`py-3 pr-4 tabular-nums text-right font-medium ${i.currentBalance <= 0 ? "text-destructive" : ""}`}>{i.currentBalance}</td>
                      <td data-label="Last counted" className="py-3 text-muted-foreground">{i.lastCounted ? formatDate(i.lastCounted) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction log */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="mr-auto">Transaction log</CardTitle>
            <div className="relative min-w-[180px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-full pl-9" placeholder="Search substance…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search substance" />
            </div>
            <select className="input" value={filterSubstance} onChange={(e) => setFilterSubstance(e.target.value)} aria-label="Filter by substance">
              <option value="all">All substances</option>
              {substances.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="input" value={filterType} onChange={(e) => setFilterType(e.target.value as TransactionType | "all")} aria-label="Filter by transaction type">
              <option value="all">All types</option>
              {TX_TYPES.map((t) => <option key={t} value={t}>{TX_LABEL[t]}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filteredLog.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title={logs.length === 0 ? "No transactions yet" : "No matching transactions"}
              description={logs.length === 0 ? "Record your first controlled substance transaction." : "Try adjusting your filters."}
              action={logs.length === 0 ? <Button onClick={() => { setForm(emptyForm(myName)); setShowForm(true); }}><Plus className="size-4" /> Record transaction</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Date" sortKey="date" sort={logSort} onToggle={logToggle} />
                    <SortHeader label="Substance" sortKey="substance" sort={logSort} onToggle={logToggle} />
                    <SortHeader label="Schedule" sortKey="schedule" sort={logSort} onToggle={logToggle} />
                    <SortHeader label="Type" sortKey="type" sort={logSort} onToggle={logToggle} />
                    <SortHeader label="Quantity" sortKey="quantity" sort={logSort} onToggle={logToggle} className="text-right" align="right" />
                    <SortHeader label="Balance" sortKey="balance" sort={logSort} onToggle={logToggle} className="text-right" align="right" />
                    <SortHeader label="Prescriber" sortKey="prescriber" sort={logSort} onToggle={logToggle} />
                    <SortHeader label="Witness" sortKey="witness" sort={logSort} onToggle={logToggle} />
                    <SortHeader label="Patient ref" sortKey="patientRef" sort={logSort} onToggle={logToggle} className="pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {logSorted.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td data-label="Date" className="whitespace-nowrap py-2.5 pr-4 text-muted-foreground">{formatDate(effectiveDate(e))}</td>
                      <td data-label="Substance" className="py-2.5 pr-4 font-medium">{e.substanceName}</td>
                      <td data-label="Schedule" className="py-2.5 pr-4"><Badge variant={SCHED_VARIANT[e.scheduleClass]}>{e.scheduleClass}</Badge></td>
                      <td data-label="Type" className="py-2.5 pr-4"><Badge variant={TX_VARIANT[e.transactionType]}>{TX_LABEL[e.transactionType]}</Badge></td>
                      <td data-label="Quantity" className={`py-2.5 pr-4 tabular-nums text-right ${ADDS.includes(e.transactionType) ? "text-success" : SUBTRACTS.includes(e.transactionType) ? "text-destructive" : ""}`}>{signedQuantity(e)}</td>
                      <td data-label="Balance" className={`py-2.5 pr-4 tabular-nums text-right font-medium ${e.balanceAfter < 0 ? "text-destructive" : ""}`}>{e.balanceAfter}</td>
                      <td data-label="Prescriber" className="py-2.5 pr-4 text-muted-foreground">{e.prescriberName ?? "—"}</td>
                      <td data-label="Witness" className="py-2.5 pr-4 text-muted-foreground">{e.witnessName ?? "—"}</td>
                      <td data-label="Patient ref" className="py-2.5 font-mono text-xs text-muted-foreground">{e.patientRef ?? "—"}</td>
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
