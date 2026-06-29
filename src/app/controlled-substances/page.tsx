"use client";

import { useState, useMemo } from "react";
import { ShieldAlert, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";
import { formatDate } from "@/lib/dates";
import { toast } from "sonner";

// DEA Schedule II-V log. For psychiatric practices, most controlled substances
// are Schedule II-IV (stimulants, benzodiazepines, certain sleep aids).
// Each log entry records a transaction: dispense, receive, return, or disposal.

interface CSLogEntry {
  id: string;
  substance: string;
  scheduleClass: "II" | "III" | "IV" | "V";
  transactionType: "received" | "dispensed" | "returned" | "disposed" | "adjustment";
  quantity: number;
  unit: string;
  runningBalance: number;
  patientId?: string;
  prescriber?: string;
  witnessName?: string;
  transactionDate: string;
  notes?: string;
}

interface CSInventory {
  substance: string;
  scheduleClass: "II" | "III" | "IV" | "V";
  currentBalance: number;
  unit: string;
  lastCountDate: string;
  lastCountBy: string;
}

const INVENTORY: CSInventory[] = [
  { substance: "Adderall XR 30mg", scheduleClass: "II", currentBalance: 450, unit: "capsules", lastCountDate: "2026-06-27", lastCountBy: "Jane Doe" },
  { substance: "Ritalin 20mg", scheduleClass: "II", currentBalance: 120, unit: "tablets", lastCountDate: "2026-06-27", lastCountBy: "Jane Doe" },
  { substance: "Klonopin 0.5mg", scheduleClass: "IV", currentBalance: 300, unit: "tablets", lastCountDate: "2026-06-27", lastCountBy: "Sarah Mitchell" },
  { substance: "Ambien 10mg", scheduleClass: "IV", currentBalance: 60, unit: "tablets", lastCountDate: "2026-06-27", lastCountBy: "Sarah Mitchell" },
  { substance: "Tramadol 50mg", scheduleClass: "IV", currentBalance: 180, unit: "tablets", lastCountDate: "2026-06-27", lastCountBy: "Jane Doe" },
];

const SEED_LOG: CSLogEntry[] = [
  { id: "l1", substance: "Adderall XR 30mg", scheduleClass: "II", transactionType: "received", quantity: 500, unit: "capsules", runningBalance: 500, transactionDate: "2026-06-01", prescriber: "Jane Doe" },
  { id: "l2", substance: "Adderall XR 30mg", scheduleClass: "II", transactionType: "dispensed", quantity: 30, unit: "capsules", runningBalance: 470, patientId: "P-10042", prescriber: "Jane Doe", witnessName: "Sarah Mitchell", transactionDate: "2026-06-05" },
  { id: "l3", substance: "Adderall XR 30mg", scheduleClass: "II", transactionType: "dispensed", quantity: 20, unit: "capsules", runningBalance: 450, patientId: "P-10087", prescriber: "Jane Doe", witnessName: "Sarah Mitchell", transactionDate: "2026-06-15" },
  { id: "l4", substance: "Klonopin 0.5mg", scheduleClass: "IV", transactionType: "received", quantity: 300, unit: "tablets", runningBalance: 300, transactionDate: "2026-06-01", prescriber: "Jane Doe" },
  { id: "l5", substance: "Klonopin 0.5mg", scheduleClass: "IV", transactionType: "adjustment", quantity: 0, unit: "tablets", runningBalance: 300, notes: "Biweekly count reconciliation — no discrepancy", transactionDate: "2026-06-15", witnessName: "Sarah Mitchell" },
];

const TX_VARIANT: Record<CSLogEntry["transactionType"], "success" | "warning" | "destructive" | "secondary" | "default"> = {
  received: "success",
  dispensed: "default",
  returned: "secondary",
  disposed: "warning",
  adjustment: "secondary",
};

const SCHED_VARIANT: Record<string, "destructive" | "warning" | "secondary"> = {
  II: "destructive",
  III: "warning",
  IV: "warning",
  V: "secondary",
};

interface NewEntry {
  substance: string;
  scheduleClass: CSLogEntry["scheduleClass"];
  transactionType: CSLogEntry["transactionType"];
  quantity: string;
  unit: string;
  patientId: string;
  prescriber: string;
  witnessName: string;
  transactionDate: string;
  notes: string;
}

export default function ControlledSubstancesPage() {
  const [log, setLog] = useState<CSLogEntry[]>(SEED_LOG);
  const [search, setSearch] = useState("");
  const [filterSchedule, setFilterSchedule] = useState<"all" | CSLogEntry["scheduleClass"]>("all");
  const [activeTab, setActiveTab] = useState<"inventory" | "log">("inventory");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<NewEntry>({
    substance: "",
    scheduleClass: "IV",
    transactionType: "dispensed",
    quantity: "",
    unit: "tablets",
    patientId: "",
    prescriber: "",
    witnessName: "",
    transactionDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const filteredLog = useMemo(() => {
    const q = search.toLowerCase();
    return log.filter((e) => {
      if (filterSchedule !== "all" && e.scheduleClass !== filterSchedule) return false;
      if (q && !e.substance.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [log, search, filterSchedule]);

  const stats = useMemo(() => ({
    substances: INVENTORY.length,
    scheduleII: INVENTORY.filter((i) => i.scheduleClass === "II").length,
    dispensedThisMonth: log.filter((e) => e.transactionType === "dispensed" && e.transactionDate.startsWith("2026-06")).length,
  }), [log]);

  function save() {
    const qty = parseFloat(form.quantity);
    if (!form.substance.trim() || isNaN(qty) || qty <= 0) {
      toast.error("Substance and valid quantity are required");
      return;
    }
    if ((form.transactionType === "dispensed" || form.transactionType === "disposed") && !form.witnessName.trim()) {
      toast.error("A witness is required for dispense and disposal transactions");
      return;
    }
    setLog((prev) => [{
      id: `l-${Date.now()}`,
      substance: form.substance.trim(),
      scheduleClass: form.scheduleClass,
      transactionType: form.transactionType,
      quantity: qty,
      unit: form.unit.trim(),
      runningBalance: 0, // would compute from INVENTORY in a real backend
      patientId: form.patientId.trim() || undefined,
      prescriber: form.prescriber.trim() || undefined,
      witnessName: form.witnessName.trim() || undefined,
      transactionDate: form.transactionDate,
      notes: form.notes.trim() || undefined,
    }, ...prev]);
    setShowNew(false);
    setForm({ substance: "", scheduleClass: "IV", transactionType: "dispensed", quantity: "", unit: "tablets", patientId: "", prescriber: "", witnessName: "", transactionDate: new Date().toISOString().slice(0, 10), notes: "" });
    toast.success("Log entry recorded");
  }

  const set = (k: keyof NewEntry) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowNew(false)}
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">Add DEA log entry</h2>
              <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Substance *</label>
                <input className="input w-full" value={form.substance} onChange={set("substance")} placeholder="Name, strength, form" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">DEA Schedule</label>
                <select className="input w-full" value={form.scheduleClass} onChange={set("scheduleClass")}>
                  <option value="II">Schedule II</option>
                  <option value="III">Schedule III</option>
                  <option value="IV">Schedule IV</option>
                  <option value="V">Schedule V</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Transaction type</label>
                <select className="input w-full" value={form.transactionType} onChange={set("transactionType")}>
                  <option value="received">Received</option>
                  <option value="dispensed">Dispensed</option>
                  <option value="returned">Returned</option>
                  <option value="disposed">Disposed</option>
                  <option value="adjustment">Count adjustment</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quantity *</label>
                <input type="number" min="0" className="input w-full" value={form.quantity} onChange={set("quantity")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Unit</label>
                <input className="input w-full" value={form.unit} onChange={set("unit")} placeholder="tablets, capsules, mL…" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date</label>
                <input type="date" className="input w-full" value={form.transactionDate} onChange={set("transactionDate")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Prescriber</label>
                <input className="input w-full" value={form.prescriber} onChange={set("prescriber")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Witness name {(form.transactionType === "dispensed" || form.transactionType === "disposed") ? "*" : ""}</label>
                <input className="input w-full" value={form.witnessName} onChange={set("witnessName")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Patient ID (if applicable)</label>
                <input className="input w-full" value={form.patientId} onChange={set("patientId")} placeholder="De-identified ID only" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea className="input w-full min-h-[60px] resize-y" value={form.notes} onChange={set("notes")} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button onClick={save}>Save entry</Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Controlled Substances"
        description="DEA-required log of all Schedule II–V controlled substance transactions. Every entry requires a witness for dispense and disposal."
        actions={
          <Button onClick={() => setShowNew(true)}><Plus className="size-4" /> Log transaction</Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Substances tracked" value={stats.substances} icon={ShieldAlert} />
        <StatCard label="Schedule II substances" value={stats.scheduleII} icon={ShieldAlert} tone="warning" />
        <StatCard label="Transactions this month" value={stats.dispensedThisMonth} icon={ShieldAlert} />
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["inventory", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "log" ? "Transaction log" : "Inventory"}
          </button>
        ))}
      </div>

      {activeTab === "inventory" && (
        <Card>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Substance</th>
                    <th className="pb-2 pr-4 font-medium">Schedule</th>
                    <th className="pb-2 pr-4 font-medium text-right">Balance</th>
                    <th className="pb-2 pr-4 font-medium">Last count</th>
                    <th className="pb-2 font-medium">Counted by</th>
                  </tr>
                </thead>
                <tbody>
                  {INVENTORY.map((i) => (
                    <tr key={i.substance} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-3 pr-4 font-medium">{i.substance}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={SCHED_VARIANT[i.scheduleClass]}>Schedule {i.scheduleClass}</Badge>
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-right font-medium">{i.currentBalance} {i.unit}</td>
                      <td className="py-3 pr-4">{formatDate(i.lastCountDate)}</td>
                      <td className="py-3 text-muted-foreground">{i.lastCountBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "log" && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input className="input w-full pl-9" placeholder="Search substance…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="input" value={filterSchedule} onChange={(e) => setFilterSchedule(e.target.value as typeof filterSchedule)}>
                <option value="all">All schedules</option>
                <option value="II">Schedule II</option>
                <option value="III">Schedule III</option>
                <option value="IV">Schedule IV</option>
                <option value="V">Schedule V</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {filteredLog.length === 0 ? (
              <EmptyState icon={ShieldAlert} title="No log entries" description="Log your first controlled substance transaction." action={<Button onClick={() => setShowNew(true)}><Plus className="size-4" /> Log transaction</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Date</th>
                      <th className="pb-2 pr-4 font-medium">Substance</th>
                      <th className="pb-2 pr-4 font-medium">Type</th>
                      <th className="pb-2 pr-4 font-medium text-right">Qty</th>
                      <th className="pb-2 pr-4 font-medium text-right">Balance</th>
                      <th className="pb-2 pr-4 font-medium">Prescriber</th>
                      <th className="pb-2 font-medium">Witness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLog.map((e) => (
                      <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="py-2.5 pr-4 text-muted-foreground">{formatDate(e.transactionDate)}</td>
                        <td className="py-2.5 pr-4 font-medium">{e.substance}</td>
                        <td className="py-2.5 pr-4">
                          <Badge variant={TX_VARIANT[e.transactionType]} className="capitalize">{e.transactionType}</Badge>
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums text-right">{e.quantity} {e.unit}</td>
                        <td className="py-2.5 pr-4 tabular-nums text-right text-muted-foreground">{e.runningBalance} {e.unit}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{e.prescriber ?? "—"}</td>
                        <td className="py-2.5 text-muted-foreground">{e.witnessName ?? "—"}</td>
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
