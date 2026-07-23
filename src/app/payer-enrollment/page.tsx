"use client";

import { useState, useMemo } from "react";
import {
  Handshake, Plus, Search, X, Check, AlertTriangle, CalendarClock,
  Building2, UserCircle, FileText, ChevronRight,
} from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { FileLink } from "@/components/shared/file-link";
import { uploadFile } from "@/lib/storage";
import { formatDate, dateInputToISO, daysUntil } from "@/lib/dates";
import {
  enrollmentStatuses, payerContractStatuses,
  type PayerContract, type PayerEnrollment,
} from "@/lib/data/schema";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatName } from "@/lib/format";
import { buildHolderIndex, holderStatus } from "@/lib/compliance";

/* ─── constants ─────────────────────────────────────────────── */

type EnrollStatus = PayerEnrollment["enrollmentStatus"];
type ContractStatus = PayerContract["contractStatus"];

const ENROLL_LABEL: Record<EnrollStatus, string> = {
  not_started: "Not started",
  application_submitted: "Application submitted",
  in_process: "In process",
  paneled: "Paneled (par)",
  denied: "Denied",
  recred_due: "Re-credential due",
  terminated: "Terminated",
};
const ENROLL_VARIANT: Record<EnrollStatus, "success" | "warning" | "destructive" | "secondary"> = {
  not_started: "secondary",
  application_submitted: "warning",
  in_process: "warning",
  paneled: "success",
  denied: "destructive",
  recred_due: "warning",
  terminated: "destructive",
};

const CONTRACT_LABEL: Record<ContractStatus, string> = {
  prospective: "Prospective",
  in_negotiation: "In negotiation",
  active: "Active",
  terminated: "Terminated",
  expired: "Expired",
};
const CONTRACT_VARIANT: Record<ContractStatus, "success" | "warning" | "destructive" | "secondary"> = {
  prospective: "secondary",
  in_negotiation: "warning",
  active: "success",
  terminated: "destructive",
  expired: "destructive",
};

// Common Utah behavioral-health payers, offered as a datalist (free-text still allowed).
const COMMON_PAYERS = [
  "Aetna", "Cigna", "UnitedHealthcare", "Optum Behavioral Health",
  "SelectHealth", "Regence BlueCross BlueShield of Utah", "PEHP", "DMBA",
  "Molina Healthcare of Utah", "University of Utah Health Plans", "Health Choice Utah",
  "Medicare", "Utah Medicaid", "TRICARE",
];

/* ─── helpers ───────────────────────────────────────────────── */

/** Re-credentialing / renewal urgency from a date + status. */
function dateUrgency(date: string | null | undefined): "none" | "overdue" | "soon" | "ok" {
  const d = daysUntil(date);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  return d <= 90 ? "soon" : "ok";
}

/** A paneling that needs attention: re-cred due/overdue, or explicitly flagged. */
function enrollmentNeedsAttention(e: PayerEnrollment): boolean {
  if (e.enrollmentStatus === "recred_due") return true;
  if (e.enrollmentStatus === "paneled") {
    const u = dateUrgency(e.recredentialDate);
    return u === "overdue" || u === "soon";
  }
  return false;
}

/* ─── provider-file grouping (mirrors Credentials / Insurance Vault) ─────── */

interface ProviderPanelFile { key: string; name: string; former: boolean; items: PayerEnrollment[]; attention: number; }

/** Group paneling rows by provider, active-first then alphabetical. */
function buildProviderPanelFiles(rows: PayerEnrollment[], isFormer: (e: PayerEnrollment) => boolean): ProviderPanelFile[] {
  const byProvider = new Map<string, PayerEnrollment[]>();
  for (const e of rows) {
    const key = e.providerUserId || e.providerName.trim().toLowerCase() || "unassigned";
    const arr = byProvider.get(key) ?? [];
    arr.push(e);
    byProvider.set(key, arr);
  }
  const files: ProviderPanelFile[] = [];
  for (const [key, items] of byProvider) {
    const sorted = [...items].sort((a, b) => a.payerName.localeCompare(b.payerName));
    const first = items[0];
    files.push({
      key,
      name: first.providerName.trim() || "Unassigned",
      former: isFormer(first),
      items: sorted,
      attention: items.filter(enrollmentNeedsAttention).length,
    });
  }
  return files.sort((a, b) => Number(a.former) - Number(b.former) || a.name.localeCompare(b.name));
}

/** Collapsed-by-name paneling view: each provider expands to their payers;
 *  former/past providers sit in their own collapsed section at the end. */
function ProviderPanelView({ files, onEdit }: { files: ProviderPanelFile[]; onEdit: (e: PayerEnrollment) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (k: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const active = files.filter((f) => !f.former);
  const former = files.filter((f) => f.former);

  const renderFile = (f: ProviderPanelFile) => {
    const isOpen = open.has(f.key);
    return (
      <div key={f.key} className="rounded-lg border border-border">
        <button type="button" onClick={() => toggleOpen(f.key)} className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/20">
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
          <span className="font-medium">{formatName(f.name)}</span>
          {!f.former && f.attention > 0 && <Badge variant="warning">{f.attention} to address</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">{f.items.length} payer{f.items.length === 1 ? "" : "s"}</span>
        </button>
        {isOpen && (
          <div className="divide-y divide-border/60 border-t border-border">
            {f.items.map((e) => {
              const recred = dateUrgency(e.recredentialDate);
              const attention = !f.former && enrollmentNeedsAttention(e);
              return (
                <div key={e.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3", attention && "bg-warning/5")}>
                  <span className="font-medium">{e.payerName}</span>
                  <button type="button" onClick={() => onEdit(e)} className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                    <Badge variant={f.former ? "secondary" : ENROLL_VARIANT[e.enrollmentStatus]}>{ENROLL_LABEL[e.enrollmentStatus]}</Badge>
                  </button>
                  {e.effectiveDate && <span className="text-sm text-muted-foreground">par {formatDate(e.effectiveDate)}</span>}
                  {e.recredentialDate && (
                    <span className={cn("text-sm", recred === "overdue" ? "font-medium text-destructive" : recred === "soon" ? "font-medium text-warning" : "text-muted-foreground")}>
                      re-cred {formatDate(e.recredentialDate)}{recred === "overdue" ? " (overdue)" : recred === "soon" ? " (soon)" : ""}
                    </span>
                  )}
                  {e.providerPayerId && <span className="text-xs text-muted-foreground">ID {e.providerPayerId}</span>}
                  <div className="ml-auto flex items-center gap-1">
                    {e.applicationDocumentUrl && <FileLink path={e.applicationDocumentUrl} label="Document" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:underline" />}
                    <Button size="sm" variant="ghost" onClick={() => onEdit(e)}>Edit</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">{active.map(renderFile)}</div>
      {former.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-2 text-sm font-semibold text-muted-foreground">
            Former / past providers <Badge variant="secondary">{former.length}</Badge>
          </div>
          {former.map(renderFile)}
        </div>
      )}
    </div>
  );
}

/* ─── contract form ─────────────────────────────────────────── */

interface ContractForm {
  payerName: string; planNetwork: string; contractLevel: "group" | "individual";
  taxId: string; groupNpi: string; contractStatus: ContractStatus;
  effectiveDate: string; renewalDate: string; terminationDate: string;
  payerContactName: string; payerContactEmail: string; payerContactPhone: string;
  notes: string;
}
function emptyContractForm(): ContractForm {
  return {
    payerName: "", planNetwork: "", contractLevel: "group", taxId: "", groupNpi: "",
    contractStatus: "active", effectiveDate: "", renewalDate: "", terminationDate: "",
    payerContactName: "", payerContactEmail: "", payerContactPhone: "", notes: "",
  };
}
function contractFormFrom(c: PayerContract): ContractForm {
  return {
    payerName: c.payerName, planNetwork: c.planNetwork ?? "", contractLevel: c.contractLevel,
    taxId: c.taxId ?? "", groupNpi: c.groupNpi ?? "", contractStatus: c.contractStatus,
    effectiveDate: c.effectiveDate?.slice(0, 10) ?? "", renewalDate: c.renewalDate?.slice(0, 10) ?? "",
    terminationDate: c.terminationDate?.slice(0, 10) ?? "",
    payerContactName: c.payerContactName ?? "", payerContactEmail: c.payerContactEmail ?? "",
    payerContactPhone: c.payerContactPhone ?? "", notes: c.notes ?? "",
  };
}

function ContractDialog({ initial, onClose, onSave, saving }: {
  initial?: PayerContract; onClose: () => void;
  onSave: (f: ContractForm, files: { contract: File | null; fee: File | null }) => void; saving: boolean;
}) {
  const [form, setForm] = useState<ContractForm>(() => initial ? contractFormFrom(initial) : emptyContractForm());
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [feeFile, setFeeFile] = useState<File | null>(null);
  const upd = (p: Partial<ContractForm>) => setForm((f) => ({ ...f, ...p }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit payer contract" : "Add payer contract"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Payer *</label>
            <input className="input w-full" list="payer-list" value={form.payerName} onChange={(e) => upd({ payerName: e.target.value })} placeholder="e.g. SelectHealth" />
            <datalist id="payer-list">{COMMON_PAYERS.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Plan / network</label>
            <input className="input w-full" value={form.planNetwork} onChange={(e) => upd({ planNetwork: e.target.value })} placeholder="Commercial PPO, Medicaid…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contract level</label>
            <select className="input w-full" value={form.contractLevel} onChange={(e) => upd({ contractLevel: e.target.value as ContractForm["contractLevel"] })}>
              <option value="group">Group (practice / TIN)</option>
              <option value="individual">Individual provider</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tax ID (TIN)</label>
            <input className="input w-full" value={form.taxId} onChange={(e) => upd({ taxId: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Group NPI</label>
            <input className="input w-full" value={form.groupNpi} onChange={(e) => upd({ groupNpi: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select className="input w-full" value={form.contractStatus} onChange={(e) => upd({ contractStatus: e.target.value as ContractStatus })}>
              {payerContractStatuses.map((s) => <option key={s} value={s}>{CONTRACT_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Effective date</label>
            <input type="date" className="input w-full" value={form.effectiveDate} onChange={(e) => upd({ effectiveDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Renewal date</label>
            <input type="date" className="input w-full" value={form.renewalDate} onChange={(e) => upd({ renewalDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Termination date</label>
            <input type="date" className="input w-full" value={form.terminationDate} onChange={(e) => upd({ terminationDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Payer contact name</label>
            <input className="input w-full" value={form.payerContactName} onChange={(e) => upd({ payerContactName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contact email</label>
            <input type="email" className="input w-full" value={form.payerContactEmail} onChange={(e) => upd({ payerContactEmail: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contact phone</label>
            <input className="input w-full" value={form.payerContactPhone} onChange={(e) => upd({ payerContactPhone: e.target.value })} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Executed contract / agreement</label>
            <div className="flex items-center gap-3">
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
                <Plus className="size-4" />{contractFile ? contractFile.name : "Upload the signed contract (PDF)"}
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setContractFile(e.target.files?.[0] ?? null)} />
              </label>
              {initial?.contractDocumentUrl && !contractFile && <FileLink path={initial.contractDocumentUrl} label="Current" className="shrink-0 text-sm text-primary hover:underline" />}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Fee schedule</label>
            <div className="flex items-center gap-3">
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
                <Plus className="size-4" />{feeFile ? feeFile.name : "Upload the fee schedule (PDF)"}
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFeeFile(e.target.files?.[0] ?? null)} />
              </label>
              {initial?.feeScheduleUrl && !feeFile && <FileLink path={initial.feeScheduleUrl} label="Current" className="shrink-0 text-sm text-primary hover:underline" />}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea className="input w-full min-h-[60px] resize-y" value={form.notes} onChange={(e) => upd({ notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form, { contract: contractFile, fee: feeFile })} disabled={!form.payerName.trim() || saving}>
            {saving ? "Saving…" : <><Check className="size-3" /> Save</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── enrollment (paneling) form ────────────────────────────── */

interface EnrollForm {
  providerName: string; providerUserId: string; payerContractId: string; payerName: string;
  enrollmentStatus: EnrollStatus; submittedDate: string; effectiveDate: string;
  recredentialDate: string; terminationDate: string;
  providerPayerId: string; caqhId: string; individualNpi: string; notes: string;
}
function emptyEnrollForm(): EnrollForm {
  return {
    providerName: "", providerUserId: "", payerContractId: "", payerName: "",
    enrollmentStatus: "not_started", submittedDate: "", effectiveDate: "", recredentialDate: "",
    terminationDate: "", providerPayerId: "", caqhId: "", individualNpi: "", notes: "",
  };
}
function enrollFormFrom(e: PayerEnrollment): EnrollForm {
  return {
    providerName: e.providerName, providerUserId: e.providerUserId ?? "",
    payerContractId: e.payerContractId ?? "", payerName: e.payerName,
    enrollmentStatus: e.enrollmentStatus,
    submittedDate: e.submittedDate?.slice(0, 10) ?? "", effectiveDate: e.effectiveDate?.slice(0, 10) ?? "",
    recredentialDate: e.recredentialDate?.slice(0, 10) ?? "", terminationDate: e.terminationDate?.slice(0, 10) ?? "",
    providerPayerId: e.providerPayerId ?? "", caqhId: e.caqhId ?? "", individualNpi: e.individualNpi ?? "",
    notes: e.notes ?? "",
  };
}

function EnrollmentDialog({ initial, contracts, providers, onClose, onSave, saving }: {
  initial?: PayerEnrollment;
  contracts: PayerContract[];
  providers: { userId: string; name: string }[];
  onClose: () => void;
  onSave: (f: EnrollForm, file: File | null) => void; saving: boolean;
}) {
  const [form, setForm] = useState<EnrollForm>(() => initial ? enrollFormFrom(initial) : emptyEnrollForm());
  const [docFile, setDocFile] = useState<File | null>(null);
  const upd = (p: Partial<EnrollForm>) => setForm((f) => ({ ...f, ...p }));

  // Linking a contract auto-fills the payer name from it.
  function pickContract(id: string) {
    const c = contracts.find((x) => x.id === id);
    upd({ payerContractId: id, ...(c ? { payerName: c.payerName } : {}) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit paneling" : "Add provider paneling"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Provider *</label>
            <input className="input w-full" list="provider-list" value={form.providerName}
              onChange={(e) => {
                const match = providers.find((p) => p.name === e.target.value);
                upd({ providerName: e.target.value, providerUserId: match?.userId ?? "" });
              }} placeholder="Provider name" />
            <datalist id="provider-list">{providers.map((p) => <option key={p.userId || p.name} value={p.name} />)}</datalist>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select className="input w-full" value={form.enrollmentStatus} onChange={(e) => upd({ enrollmentStatus: e.target.value as EnrollStatus })}>
              {enrollmentStatuses.map((s) => <option key={s} value={s}>{ENROLL_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Payer contract</label>
            <select className="input w-full" value={form.payerContractId} onChange={(e) => pickContract(e.target.value)}>
              <option value="">— Not linked to a group contract —</option>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.payerName}{c.planNetwork ? ` · ${c.planNetwork}` : ""}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Payer *</label>
            <input className="input w-full" list="payer-list" value={form.payerName} onChange={(e) => upd({ payerName: e.target.value })} placeholder="e.g. Aetna" />
            <datalist id="payer-list">{COMMON_PAYERS.map((p) => <option key={p} value={p} />)}</datalist>
            <p className="text-xs text-muted-foreground">Auto-filled when you link a group contract; edit if paneling under a different plan.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Application submitted</label>
            <input type="date" className="input w-full" value={form.submittedDate} onChange={(e) => upd({ submittedDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Effective / par date</label>
            <input type="date" className="input w-full" value={form.effectiveDate} onChange={(e) => upd({ effectiveDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Re-credential due</label>
            <input type="date" className="input w-full" value={form.recredentialDate} onChange={(e) => upd({ recredentialDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Termination date</label>
            <input type="date" className="input w-full" value={form.terminationDate} onChange={(e) => upd({ terminationDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Provider payer ID / PTAN</label>
            <input className="input w-full" value={form.providerPayerId} onChange={(e) => upd({ providerPayerId: e.target.value })} placeholder="Payer-assigned ID / Medicare PTAN" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">CAQH ID</label>
            <input className="input w-full" value={form.caqhId} onChange={(e) => upd({ caqhId: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Individual NPI</label>
            <input className="input w-full" value={form.individualNpi} onChange={(e) => upd({ individualNpi: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Paneling document (approval letter / application)</label>
            <div className="flex items-center gap-3">
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
                <Plus className="size-4" />{docFile ? docFile.name : "Upload the approval letter / application (PDF)"}
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
              </label>
              {initial?.applicationDocumentUrl && !docFile && <FileLink path={initial.applicationDocumentUrl} label="Current" className="shrink-0 text-sm text-primary hover:underline" />}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea className="input w-full min-h-[60px] resize-y" value={form.notes} onChange={(e) => upd({ notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form, docFile)} disabled={!form.providerName.trim() || !form.payerName.trim() || saving}>
            {saving ? "Saving…" : <><Check className="size-3" /> Save</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── page ──────────────────────────────────────────────────── */

export default function PayerEnrollmentPage() {
  const contractsQ = useCollection("payerContracts");
  const enrollmentsQ = useCollection("payerEnrollments");
  const employeesQ = useCollection("employees");
  const createContract = useCreate("payerContracts");
  const updateContract = useUpdate("payerContracts");
  const createEnroll = useCreate("payerEnrollments");
  const updateEnroll = useUpdate("payerEnrollments");

  const [search, setSearch] = useState("");
  const [editingContract, setEditingContract] = useState<PayerContract | "new" | null>(null);
  const [editingEnroll, setEditingEnroll] = useState<PayerEnrollment | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  const contracts = useMemo(() => contractsQ.data ?? [], [contractsQ.data]);
  const enrollments = useMemo(() => enrollmentsQ.data ?? [], [enrollmentsQ.data]);
  const isLoading = contractsQ.isLoading || enrollmentsQ.isLoading;
  const isError = contractsQ.isError || enrollmentsQ.isError;

  const providers = useMemo(() => {
    const list = (employeesQ.data ?? [])
      .filter((e) => e.employmentStatus === "active" || e.employmentStatus === "on_leave")
      .map((e) => ({ userId: e.userId ?? "", name: `${e.firstName} ${e.lastName}`.trim() }));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [employeesQ.data]);

  const enrollFiltered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return enrollments;
    return enrollments.filter((e) =>
      e.providerName.toLowerCase().includes(q) || e.payerName.toLowerCase().includes(q));
  }, [enrollments, search]);

  const holderIdx = useMemo(() => buildHolderIndex(employeesQ.data ?? []), [employeesQ.data]);
  const providerIsFormer = useMemo(
    () => (e: PayerEnrollment) => holderStatus({ employeeUserId: e.providerUserId, employeeName: e.providerName }, holderIdx) === "former",
    [holderIdx],
  );
  const panelFiles = useMemo(() => buildProviderPanelFiles(enrollFiltered, providerIsFormer), [enrollFiltered, providerIsFormer]);

  const stats = useMemo(() => ({
    paneled: enrollments.filter((e) => e.enrollmentStatus === "paneled").length,
    inProcess: enrollments.filter((e) => e.enrollmentStatus === "application_submitted" || e.enrollmentStatus === "in_process").length,
    attention: enrollments.filter(enrollmentNeedsAttention).length,
    contracts: contracts.filter((c) => c.contractStatus === "active").length,
  }), [enrollments, contracts]);

  const enrollCountByContract = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of enrollments) if (e.payerContractId) m.set(e.payerContractId, (m.get(e.payerContractId) ?? 0) + 1);
    return m;
  }, [enrollments]);

  async function saveContract(f: ContractForm, files: { contract: File | null; fee: File | null }) {
    setSaving(true);
    try {
      let contractDocumentUrl: string | undefined;
      let feeScheduleUrl: string | undefined;
      if (files.contract) {
        try { contractDocumentUrl = await uploadFile(files.contract, "payer-contracts"); }
        catch { toast.error("Couldn't upload the contract — saving other changes."); }
      }
      if (files.fee) {
        try { feeScheduleUrl = await uploadFile(files.fee, "payer-fee-schedules"); }
        catch { toast.error("Couldn't upload the fee schedule — saving other changes."); }
      }
      const payload = {
        payerName: f.payerName.trim(),
        planNetwork: f.planNetwork.trim() || undefined,
        contractLevel: f.contractLevel,
        taxId: f.taxId.trim() || undefined,
        groupNpi: f.groupNpi.trim() || undefined,
        contractStatus: f.contractStatus,
        effectiveDate: f.effectiveDate ? dateInputToISO(f.effectiveDate) : null,
        renewalDate: f.renewalDate ? dateInputToISO(f.renewalDate) : null,
        terminationDate: f.terminationDate ? dateInputToISO(f.terminationDate) : null,
        payerContactName: f.payerContactName.trim() || undefined,
        payerContactEmail: f.payerContactEmail.trim() || undefined,
        payerContactPhone: f.payerContactPhone.trim() || undefined,
        notes: f.notes.trim() || undefined,
        ...(contractDocumentUrl && { contractDocumentUrl }),
        ...(feeScheduleUrl && { feeScheduleUrl }),
      };
      if (editingContract && editingContract !== "new") {
        await updateContract.mutateAsync({ id: editingContract.id, patch: payload });
        toast.success("Contract updated");
      } else {
        await createContract.mutateAsync(payload);
        toast.success("Contract added");
      }
      setEditingContract(null);
    } catch { toast.error("Failed to save the contract."); }
    finally { setSaving(false); }
  }

  async function saveEnroll(f: EnrollForm, file: File | null) {
    setSaving(true);
    try {
      let applicationDocumentUrl: string | undefined;
      if (file) {
        try { applicationDocumentUrl = await uploadFile(file, "payer-enrollments"); }
        catch { toast.error("Couldn't upload the document — saving other changes."); }
      }
      const payload = {
        providerName: f.providerName.trim(),
        providerUserId: f.providerUserId || null,
        payerContractId: f.payerContractId || null,
        payerName: f.payerName.trim(),
        enrollmentStatus: f.enrollmentStatus,
        submittedDate: f.submittedDate ? dateInputToISO(f.submittedDate) : null,
        effectiveDate: f.effectiveDate ? dateInputToISO(f.effectiveDate) : null,
        recredentialDate: f.recredentialDate ? dateInputToISO(f.recredentialDate) : null,
        terminationDate: f.terminationDate ? dateInputToISO(f.terminationDate) : null,
        providerPayerId: f.providerPayerId.trim() || undefined,
        caqhId: f.caqhId.trim() || undefined,
        individualNpi: f.individualNpi.trim() || undefined,
        notes: f.notes.trim() || undefined,
        ...(applicationDocumentUrl && { applicationDocumentUrl }),
      };
      if (editingEnroll && editingEnroll !== "new") {
        await updateEnroll.mutateAsync({ id: editingEnroll.id, patch: payload });
        toast.success("Paneling updated");
      } else {
        await createEnroll.mutateAsync(payload);
        toast.success("Paneling added");
      }
      setEditingEnroll(null);
    } catch { toast.error("Failed to save the paneling record."); }
    finally { setSaving(false); }
  }

  if (isError) {
    return <div className="space-y-6"><PageHeader title="Payer Enrollment" />
      <ErrorState message="We couldn't load payer enrollment." onRetry={() => { void contractsQ.refetch(); void enrollmentsQ.refetch(); }} /></div>;
  }

  return (
    <div className="space-y-6">
      {editingContract && (
        <ContractDialog initial={editingContract === "new" ? undefined : editingContract}
          onClose={() => setEditingContract(null)} onSave={saveContract} saving={saving} />
      )}
      {editingEnroll && (
        <EnrollmentDialog initial={editingEnroll === "new" ? undefined : editingEnroll}
          contracts={contracts} providers={providers}
          onClose={() => setEditingEnroll(null)} onSave={saveEnroll} saving={saving} />
      )}

      <PageHeader
        title="Payer Enrollment"
        description="Insurance payers the practice is contracted with, and each provider's paneling (enrollment) under those contracts — separate from a provider's credentials."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditingContract("new")}><Plus className="size-4" /> Add contract</Button>
            <Button onClick={() => setEditingEnroll("new")}><Plus className="size-4" /> Add paneling</Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Paneled" value={stats.paneled} icon={Check} tone="success" loading={isLoading} />
        <StatCard label="In process" value={stats.inProcess} icon={CalendarClock} tone={stats.inProcess ? "warning" : "default"} loading={isLoading} />
        <StatCard label="Re-cred due / overdue" value={stats.attention} icon={AlertTriangle} tone={stats.attention ? "warning" : "default"} loading={isLoading} />
        <StatCard label="Active contracts" value={stats.contracts} icon={Building2} loading={isLoading} />
      </div>

      {/* ── Payer contracts (practice ↔ payer) ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Building2 className="size-4 text-muted-foreground" /><h2 className="font-semibold">Payer contracts</h2></div>
            <Button size="sm" variant="outline" onClick={() => setEditingContract("new")}><Plus className="size-3" /> Add contract</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : contracts.length === 0 ? (
            <EmptyState icon={Handshake} title="No payer contracts yet"
              description="Add the practice's executed contract with each payer (group/TIN level), then panel providers under it."
              action={<Button onClick={() => setEditingContract("new")}><Plus className="size-4" /> Add contract</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Payer</th>
                    <th className="pb-2 font-medium">Level</th>
                    <th className="pb-2 font-medium">Effective</th>
                    <th className="pb-2 font-medium">Renewal</th>
                    <th className="pb-2 font-medium">Providers</th>
                    <th className="pb-2 font-medium">Documents</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => {
                    const renew = dateUrgency(c.renewalDate);
                    return (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Payer" className="py-3 pr-4">
                          <span className="font-medium">{c.payerName}</span>
                          {c.planNetwork && <p className="text-xs text-muted-foreground">{c.planNetwork}</p>}
                        </td>
                        <td data-label="Level" className="py-3 pr-4 text-muted-foreground capitalize">{c.contractLevel}</td>
                        <td data-label="Effective" className="py-3 pr-4">{formatDate(c.effectiveDate)}</td>
                        <td data-label="Renewal" className="py-3 pr-4">
                          <span className={renew === "overdue" ? "text-destructive font-medium" : renew === "soon" ? "text-warning font-medium" : ""}>
                            {formatDate(c.renewalDate)}{renew === "overdue" && " (overdue)"}{renew === "soon" && " (soon)"}
                          </span>
                        </td>
                        <td data-label="Providers" className="py-3 pr-4 text-muted-foreground">{enrollCountByContract.get(c.id) ?? 0}</td>
                        <td data-label="Documents" className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            {c.contractDocumentUrl && <FileLink path={c.contractDocumentUrl} label="Contract" className="text-xs text-primary hover:underline" />}
                            {c.feeScheduleUrl && <FileLink path={c.feeScheduleUrl} label="Fee schedule" className="text-xs text-primary hover:underline" />}
                            {!c.contractDocumentUrl && !c.feeScheduleUrl && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </td>
                        <td data-label="Status" className="py-3 pr-4">
                          <button type="button" onClick={() => setEditingContract(c)} className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                            <Badge variant={CONTRACT_VARIANT[c.contractStatus]}>{CONTRACT_LABEL[c.contractStatus]}</Badge>
                          </button>
                        </td>
                        <td data-label="" className="py-3">
                          <div className="flex gap-1 md:justify-end"><Button size="sm" variant="ghost" onClick={() => setEditingContract(c)}>Edit</Button></div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Provider paneling (provider ↔ payer) ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><UserCircle className="size-4 text-muted-foreground" /><h2 className="font-semibold">Provider paneling</h2></div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input className="input pl-9" placeholder="Search provider or payer…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search paneling" />
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditingEnroll("new")}><Plus className="size-3" /> Add paneling</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : enrollFiltered.length === 0 ? (
            <EmptyState icon={FileText} title={enrollments.length ? "No matching paneling" : "No paneling recorded yet"}
              description={enrollments.length ? "Try a different search." : "Record which payers each provider is paneled with, their par date, re-credential date, and payer-assigned IDs."}
              action={<Button onClick={() => setEditingEnroll("new")}><Plus className="size-4" /> Add paneling</Button>} />
          ) : (
            <ProviderPanelView files={panelFiles} onEdit={(e) => setEditingEnroll(e)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
