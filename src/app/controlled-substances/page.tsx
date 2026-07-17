"use client";

import { useState, useMemo } from "react";
import { ShieldAlert, Plus, Search, X, Upload, AlertTriangle, ArrowLeft, Package, UserCheck, FlaskConical, Sparkles, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { FileLink } from "@/components/shared/file-link";
import { uploadFile } from "@/lib/storage";
import { formatDate, dateInputToISO, isExpired } from "@/lib/dates";
import type { ControlledSubstanceItem, ControlledSubstanceEvent, CSItemState, CSEventType, CorrectiveAction, DeaRecord, DeaRecordType } from "@/lib/data/schema";
import { deaRecordTypes } from "@/lib/data/schema";
import { toast } from "sonner";

const DEA_RECORD_LABEL: Record<DeaRecordType, string> = {
  order_222: "DEA Form 222 order", csos_order: "CSOS electronic order", biennial_inventory: "Biennial inventory",
  form_41_destruction: "Form 41 — destruction", form_106_loss: "Form 106 — theft / loss",
  power_of_attorney: "Power of attorney (222)", registration: "DEA registration", other: "Other DEA record",
};

const CAPA_STATUS_VARIANT: Record<CorrectiveAction["status"], "warning" | "outline" | "success" | "secondary"> = {
  open: "warning", in_progress: "warning", verifying: "outline", complete: "success", cancelled: "secondary",
};

type Schedule = ControlledSubstanceItem["scheduleClass"];
const SCHEDULES: Schedule[] = ["II", "IIN", "III", "IV", "V"];
const SCHED_VARIANT: Record<Schedule, "destructive" | "warning" | "secondary"> = {
  II: "destructive", IIN: "destructive", III: "warning", IV: "warning", V: "secondary",
};

const STATE_LABEL: Record<CSItemState, string> = {
  received: "Received", in_primary_safe: "In primary safe", assigned_to_staff: "In staff custody",
  in_use: "In use", depleted: "Depleted", wasted: "Wasted", destroyed: "Destroyed", quarantined: "Quarantined",
};
const STATE_VARIANT: Record<CSItemState, "success" | "warning" | "secondary" | "destructive" | "outline"> = {
  received: "outline", in_primary_safe: "secondary", assigned_to_staff: "warning", in_use: "warning",
  depleted: "secondary", wasted: "secondary", destroyed: "secondary", quarantined: "destructive",
};
const CLOSED_STATES: CSItemState[] = ["depleted", "wasted", "destroyed"];

// Administer-only vocabulary — NO "dispense" (Lone Peak administers on-site only).
const EVENT_LABEL: Record<CSEventType, string> = {
  receive: "Received", transfer_to_safe: "Moved to primary safe", assign_to_staff: "Assigned to staff",
  return_to_safe: "Returned to safe", administer: "Administered", waste: "Wasted", destroy: "Destroyed",
  count: "Counted", adjust: "Adjustment",
};
// Events staff pick when adding to a bottle (receive is done via "Receive delivery").
const ADD_EVENT_TYPES: CSEventType[] = ["transfer_to_safe", "assign_to_staff", "return_to_safe", "administer", "waste", "destroy", "count", "adjust"];
const QTY_EVENTS: CSEventType[] = ["administer", "waste", "adjust"];

function fullName(e: { firstName: string; lastName: string }) {
  return `${e.firstName} ${e.lastName}`.trim();
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = reader.result as string; resolve(s.slice(s.indexOf(",") + 1)); };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function isAnalyzable(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

interface CsAudit {
  verdict: "clean" | "issues" | "critical";
  balanceReconciles: boolean;
  summary: string;
  issues: { issue: string; severity: "low" | "medium" | "high" }[];
  recommendations: string[];
}
const AUDIT_TONE: Record<CsAudit["verdict"], "success" | "warning" | "destructive"> = { clean: "success", issues: "warning", critical: "destructive" };

/* ─────────────────────────── receive delivery ─────────────────────────── */

function ReceiveDialog({ locations, onClose, onSave, saving }: {
  locations: { id: string; name: string }[];
  onClose: () => void;
  onSave: (d: ReceiveForm, file: File | null) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<ReceiveForm>({
    substanceName: "", scheduleClass: "II", strength: "", ndc: "", lotNumber: "", expirationDate: "",
    containerLabel: "", quantity: "", quantityUnit: "mL", supplierName: "", orderReference: "",
    locationId: locations[0]?.id ?? "", receivedDate: new Date().toISOString().slice(0, 10),
  });
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const set = (k: keyof ReceiveForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const canSave = f.substanceName.trim() && f.quantity.trim() && Number(f.quantity) > 0;

  // CS-2: OCR/AI extract fields from the scanned receiving document.
  async function extract(fileToRead: File) {
    if (!isAnalyzable(fileToRead)) return;
    setExtracting(true);
    try {
      const fileBase64 = await fileToBase64(fileToRead);
      const res = await fetch("/api/ai/cs-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileBase64, mediaType: fileToRead.type, mode: "receive" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Extraction failed");
      setF((p) => ({
        ...p,
        substanceName: d.substanceName ?? p.substanceName,
        scheduleClass: (["II", "IIN", "III", "IV", "V"].includes(d.scheduleClass) ? d.scheduleClass : p.scheduleClass),
        strength: d.strength ?? p.strength,
        ndc: d.ndc ?? p.ndc,
        lotNumber: d.lotNumber ?? p.lotNumber,
        expirationDate: d.expirationDate ?? p.expirationDate,
        quantity: d.quantity != null ? String(d.quantity) : p.quantity,
        quantityUnit: d.quantityUnit ?? p.quantityUnit,
        supplierName: d.supplierName ?? p.supplierName,
        orderReference: d.orderReference ?? p.orderReference,
        receivedDate: d.receivedDate ?? p.receivedDate,
      }));
      toast.success("Fields extracted — verify before saving.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read the document.");
    } finally { setExtracting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Receive a delivery</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Substance *</label>
            <input className="input w-full" value={f.substanceName} onChange={set("substanceName")} placeholder="e.g. Ketamine HCl" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Schedule</label>
            <select className="input w-full" value={f.scheduleClass} onChange={set("scheduleClass")}>
              {SCHEDULES.map((s) => <option key={s} value={s}>Schedule {s}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Strength</label>
            <input className="input w-full" value={f.strength} onChange={set("strength")} placeholder="e.g. 50 mg/mL" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Quantity received *</label>
            <input type="number" min={0} step="any" className="input w-full" value={f.quantity} onChange={set("quantity")} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Unit</label>
            <input className="input w-full" value={f.quantityUnit} onChange={set("quantityUnit")} placeholder="mL, mg, tablets, vials" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Container label / barcode</label>
            <input className="input w-full" value={f.containerLabel} onChange={set("containerLabel")} placeholder="Bottle/vial label id" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">NDC / product code</label>
            <input className="input w-full" value={f.ndc} onChange={set("ndc")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Lot number</label>
            <input className="input w-full" value={f.lotNumber} onChange={set("lotNumber")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Expiration date</label>
            <input type="date" className="input w-full" value={f.expirationDate} onChange={set("expirationDate")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Supplier</label>
            <input className="input w-full" value={f.supplierName} onChange={set("supplierName")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Order / DEA 222 / CSOS ref</label>
            <input className="input w-full" value={f.orderReference} onChange={set("orderReference")} placeholder="For CII, the 222/CSOS number" />
          </div>
          {locations.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Clinic</label>
              <select className="input w-full" value={f.locationId} onChange={set("locationId")}>
                <option value="">Not specified</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Date received</label>
            <input type="date" className="input w-full" value={f.receivedDate} onChange={set("receivedDate")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Scan of the receiving record (packing slip / signed 222)</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
              {extracting ? <Sparkles className="size-4 animate-pulse text-primary" /> : <Upload className="size-4" />}
              {extracting ? "Reading document…" : file ? file.name : "Upload the scanned receiving document"}
              <input type="file" accept="application/pdf,image/*" className="hidden" disabled={extracting} onChange={(e) => { const nf = e.target.files?.[0] ?? null; setFile(nf); if (nf && isAnalyzable(nf)) void extract(nf); }} />
            </label>
            <p className="flex items-center gap-1 text-[11px] text-primary"><Sparkles className="size-3" /> AI reads the scan and prefills the fields below — always verify before saving.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(f, file)} disabled={!canSave || saving}>{saving ? "Saving…" : "Log receipt"}</Button>
        </div>
      </div>
    </div>
  );
}
interface ReceiveForm {
  substanceName: string; scheduleClass: Schedule; strength: string; ndc: string; lotNumber: string;
  expirationDate: string; containerLabel: string; quantity: string; quantityUnit: string;
  supplierName: string; orderReference: string; locationId: string; receivedDate: string;
}

/* ─────────────────────────── add custody event ─────────────────────────── */

function EventDialog({ item, staff, onClose, onSave, saving }: {
  item: ControlledSubstanceItem;
  staff: { id: string; name: string }[];
  onClose: () => void;
  onSave: (d: EventForm, file: File | null) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<EventForm>({
    eventType: "administer", eventDate: new Date().toISOString().slice(0, 10), quantity: "",
    toCustodian: "", witnessName: "", patientRef: "", discrepancy: false, discrepancyNote: "", notes: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const set = (k: keyof EventForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  // CS-2: OCR/AI extract event fields from a scanned paper log.
  async function extract(fileToRead: File) {
    if (!isAnalyzable(fileToRead)) return;
    setExtracting(true);
    try {
      const fileBase64 = await fileToBase64(fileToRead);
      const res = await fetch("/api/ai/cs-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileBase64, mediaType: fileToRead.type, mode: "event" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Extraction failed");
      const evTypes: CSEventType[] = ADD_EVENT_TYPES;
      setF((p) => ({
        ...p,
        eventType: (d.eventType && evTypes.includes(d.eventType) ? d.eventType : p.eventType),
        eventDate: d.eventDate ?? p.eventDate,
        quantity: d.quantity != null ? String(d.quantity) : p.quantity,
        toCustodian: d.toCustodianName ?? p.toCustodian,
        witnessName: d.witnessName ?? p.witnessName,
        patientRef: d.patientRef ?? p.patientRef,
      }));
      toast.success("Fields extracted — verify before saving.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read the document.");
    } finally { setExtracting(false); }
  }

  const needsQty = QTY_EVENTS.includes(f.eventType);
  const needsCustodian = f.eventType === "assign_to_staff";
  const isAdminister = f.eventType === "administer";
  const isWasteDestroy = f.eventType === "waste" || f.eventType === "destroy";
  const isCount = f.eventType === "count";
  const qtyLabel = f.eventType === "adjust" ? "Corrected balance" : isCount ? "Counted quantity" : "Quantity";
  const showQty = needsQty || isCount;
  const canSave = (!showQty || f.quantity.trim() !== "") && (!needsCustodian || f.toCustodian.trim() !== "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Record custody event</h2>
            <p className="text-xs text-muted-foreground">{item.substanceName}{item.containerLabel ? ` · ${item.containerLabel}` : ""} · balance {item.currentQuantity} {item.quantityUnit}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Event</label>
            <select className="input w-full" value={f.eventType} onChange={set("eventType")}>
              {ADD_EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date</label>
              <input type="date" className="input w-full" value={f.eventDate} onChange={set("eventDate")} />
            </div>
            {showQty && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{qtyLabel} ({item.quantityUnit})</label>
                <input type="number" min={0} step="any" className="input w-full" value={f.quantity} onChange={set("quantity")} placeholder="0" />
              </div>
            )}
          </div>
          {needsCustodian && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Assign to staff member *</label>
              <input className="input w-full" list="cs-staff" value={f.toCustodian} onChange={set("toCustodian")} placeholder="Staff name" />
              <datalist id="cs-staff">{staff.map((s) => <option key={s.id} value={s.name} />)}</datalist>
            </div>
          )}
          {isAdminister && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Patient reference (de-identified)</label>
              <input className="input w-full" value={f.patientRef} onChange={set("patientRef")} placeholder="e.g. MRN last 4 or initials — NO full PHI" />
            </div>
          )}
          {(isWasteDestroy || isCount || needsCustodian) && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Witness {isWasteDestroy ? <span className="text-destructive">*</span> : "(recommended)"}</label>
              <input className="input w-full" list="cs-staff" value={f.witnessName} onChange={set("witnessName")} placeholder="Second-person witness" />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Scanned record (paper log / waste form / 41)</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
              {extracting ? <Sparkles className="size-4 animate-pulse text-primary" /> : <Upload className="size-4" />}
              {extracting ? "Reading document…" : file ? file.name : "Upload the scanned document"}
              <input type="file" accept="application/pdf,image/*" className="hidden" disabled={extracting} onChange={(e) => { const nf = e.target.files?.[0] ?? null; setFile(nf); if (nf && isAnalyzable(nf)) void extract(nf); }} />
            </label>
            <p className="flex items-center gap-1 text-[11px] text-primary"><Sparkles className="size-3" /> AI reads the scan and prefills the fields above — verify before saving.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={f.discrepancy} onChange={(e) => setF((p) => ({ ...p, discrepancy: e.target.checked }))} />
            Flag a discrepancy
          </label>
          {f.discrepancy && (
            <textarea className="input w-full resize-none" rows={2} value={f.discrepancyNote} onChange={set("discrepancyNote")} placeholder="Describe the discrepancy and the corrective action taken (DEA reporting)." />
          )}
          {isWasteDestroy && !f.witnessName.trim() && (
            <p className="flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="size-3.5" /> Waste and destruction require a witness.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(f, file)} disabled={!canSave || saving || (isWasteDestroy && !f.witnessName.trim())}>{saving ? "Saving…" : "Record event"}</Button>
        </div>
      </div>
    </div>
  );
}
interface EventForm {
  eventType: CSEventType; eventDate: string; quantity: string; toCustodian: string;
  witnessName: string; patientRef: string; discrepancy: boolean; discrepancyNote: string; notes: string;
}

/* ─────────────────────── discrepancy → corrective action ─────────────────────── */

const CS_ROOT_CAUSES = ["Miscount", "Documentation error", "Unwitnessed waste", "Transcription error", "Spill / breakage", "Diversion suspected", "Delivery shortage", "Process gap"];

function CapaDialog({ item, event, owners, onClose, onSave, saving }: {
  item: ControlledSubstanceItem;
  event: ControlledSubstanceEvent;
  owners: string[];
  onClose: () => void;
  onSave: (d: { title: string; rootCause: string; actionPlan: string; ownerName: string; dueDate: string }) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(`Controlled-substance discrepancy — ${item.substanceName}${item.containerLabel ? " (" + item.containerLabel + ")" : ""}`);
  const [rootCause, setRootCause] = useState("");
  const [actionPlan, setActionPlan] = useState(event.discrepancyNote ?? "");
  const [ownerName, setOwnerName] = useState("");
  const [dueDate, setDueDate] = useState("");
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Track corrective action</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <p className="rounded-md bg-secondary/40 px-2 py-1.5 text-xs text-muted-foreground">DEA compliance: every discrepancy needs a documented root cause and corrective action.</p>
          <input className="input w-full" placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input w-full" list="cs-root-causes" placeholder="Root cause" value={rootCause} onChange={(e) => setRootCause(e.target.value)} />
          <datalist id="cs-root-causes">{CS_ROOT_CAUSES.map((r) => <option key={r} value={r} />)}</datalist>
          <textarea className="input w-full resize-none" rows={3} placeholder="Corrective action / action taken" value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input w-full" list="cs-owners" placeholder="Owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            <input type="date" className="input w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <datalist id="cs-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ title, rootCause, actionPlan, ownerName, dueDate })} disabled={!title.trim() || saving}>{saving ? "Saving…" : "Create corrective action"}</Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── DEA regulatory record ─────────────────────────── */

interface DeaForm { recordType: DeaRecordType; recordDate: string; referenceNumber: string; periodStart: string; periodEnd: string; notes: string; }

function DeaDialog({ locations, onClose, onSave, saving }: {
  locations: { id: string; name: string }[];
  onClose: () => void;
  onSave: (d: DeaForm & { locationId: string }, file: File | null) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<DeaForm>({ recordType: "order_222", recordDate: new Date().toISOString().slice(0, 10), referenceNumber: "", periodStart: "", periodEnd: "", notes: "" });
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const set = (k: keyof DeaForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const isInventory = f.recordType === "biennial_inventory";

  async function extract(fileToRead: File) {
    if (!isAnalyzable(fileToRead)) return;
    setExtracting(true);
    try {
      const fileBase64 = await fileToBase64(fileToRead);
      const res = await fetch("/api/ai/cs-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileBase64, mediaType: fileToRead.type, mode: "receive" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Extraction failed");
      setF((p) => ({ ...p, referenceNumber: d.orderReference ?? p.referenceNumber, recordDate: d.receivedDate ?? p.recordDate }));
      toast.success("Reference extracted — verify before saving.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't read the document."); }
    finally { setExtracting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Add DEA record</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Record type</label>
            <select className="input w-full" value={f.recordType} onChange={set("recordType")}>
              {deaRecordTypes.map((t) => <option key={t} value={t}>{DEA_RECORD_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{isInventory ? "Inventory date" : "Record date"}</label>
              <input type="date" className="input w-full" value={f.recordDate} onChange={set("recordDate")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reference #</label>
              <input className="input w-full" value={f.referenceNumber} onChange={set("referenceNumber")} placeholder="222 serial / CSOS / DEA #" />
            </div>
          </div>
          {isInventory && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Period start</label>
                <input type="date" className="input w-full" value={f.periodStart} onChange={set("periodStart")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Period end</label>
                <input type="date" className="input w-full" value={f.periodEnd} onChange={set("periodEnd")} />
              </div>
            </div>
          )}
          {locations.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Clinic</label>
              <select className="input w-full" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Not specified</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Scanned official form</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
              {extracting ? <Sparkles className="size-4 animate-pulse text-primary" /> : <Upload className="size-4" />}
              {extracting ? "Reading document…" : file ? file.name : "Upload the scanned DEA form"}
              <input type="file" accept="application/pdf,image/*" className="hidden" disabled={extracting} onChange={(e) => { const nf = e.target.files?.[0] ?? null; setFile(nf); if (nf && isAnalyzable(nf)) void extract(nf); }} />
            </label>
          </div>
          <textarea className="input w-full resize-none" rows={2} value={f.notes} onChange={set("notes")} placeholder="Notes (retain ≥2 years per DEA)" />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ ...f, locationId }, file)} disabled={saving}>{saving ? "Saving…" : "Save record"}</Button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── page ──────────────────────────────── */

export default function ControlledSubstancesPage() {
  const { profile } = useAuth();
  const itemsQ = useCollection("controlledSubstanceItems");
  const eventsQ = useCollection("controlledSubstanceEvents");
  const employeesQ = useCollection("employees");
  const locationsQ = useCollection("locations");
  const capasQ = useCollection("correctiveActions");
  const deaQ = useCollection("deaRecords");
  const createDea = useCreate("deaRecords");
  const createItem = useCreate("controlledSubstanceItems");
  const updateItem = useUpdate("controlledSubstanceItems");
  const createEvent = useCreate("controlledSubstanceEvents");
  const updateEvent = useUpdate("controlledSubstanceEvents");
  const createCapa = useCreate("correctiveActions");

  const [search, setSearch] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [addingDea, setAddingDea] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addingEvent, setAddingEvent] = useState(false);
  const [resolving, setResolving] = useState<ControlledSubstanceEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<CsAudit | null>(null);

  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const events = useMemo(() => eventsQ.data ?? [], [eventsQ.data]);
  const staff = useMemo(() => (employeesQ.data ?? []).filter((e) => e.employmentStatus === "active").map((e) => ({ id: e.id, name: fullName(e), userId: e.userId ?? undefined })), [employeesQ.data]);
  const owners = useMemo(() => staff.map((s) => s.name).sort(), [staff]);
  const locations = useMemo(() => (locationsQ.data ?? []).map((l) => ({ id: l.id, name: l.name })), [locationsQ.data]);
  const locName = (id?: string | null) => locations.find((l) => l.id === id)?.name;
  const capaById = useMemo(() => new Map((capasQ.data ?? []).map((c) => [c.id, c])), [capasQ.data]);
  const deaRecords = useMemo(() => [...(deaQ.data ?? [])].sort((a, b) => (b.recordDate ?? b.createdDate).localeCompare(a.recordDate ?? a.createdDate)), [deaQ.data]);

  const eventsFor = (itemId: string) => events.filter((e) => e.itemId === itemId).sort((a, b) => (b.eventDate ?? b.createdDate).localeCompare(a.eventDate ?? a.createdDate));
  const openItem = items.find((i) => i.id === openId) ?? null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => !q || i.substanceName.toLowerCase().includes(q) || (i.containerLabel ?? "").toLowerCase().includes(q) || (i.lotNumber ?? "").toLowerCase().includes(q) || (i.custodianName ?? "").toLowerCase().includes(q));
  }, [items, search]);

  // Active bottles (not closed) first, then discrepancies float up.
  const ordered = useMemo(() => [...filtered].sort((a, b) => Number(CLOSED_STATES.includes(a.state)) - Number(CLOSED_STATES.includes(b.state)) || Number(b.hasDiscrepancy) - Number(a.hasDiscrepancy)), [filtered]);
  const { sorted, sort, toggle } = useSort(ordered, {
    substance: (i) => i.substanceName,
    label: (i) => i.containerLabel ?? "",
    balance: (i) => i.currentQuantity,
    state: (i) => i.state,
    custodian: (i) => i.custodianName ?? "",
  });

  const stats = useMemo(() => ({
    active: items.filter((i) => !CLOSED_STATES.includes(i.state)).length,
    inCustody: items.filter((i) => i.state === "assigned_to_staff" || i.state === "in_use").length,
    discrepancies: items.filter((i) => i.hasDiscrepancy).length,
    expiring: items.filter((i) => !CLOSED_STATES.includes(i.state) && i.expirationDate && isExpired(i.expirationDate)).length,
  }), [items]);

  async function receive(d: ReceiveForm, file: File | null) {
    setSaving(true);
    try {
      let documentUrl: string | null = null;
      if (file) { try { documentUrl = await uploadFile(file, "controlled-substances"); } catch { toast.error("Couldn't upload the document — logging without it."); } }
      const qty = Number(d.quantity) || 0;
      const receivedDate = d.receivedDate ? dateInputToISO(d.receivedDate) : new Date().toISOString();
      const item = await createItem.mutateAsync({
        substanceName: d.substanceName.trim(), scheduleClass: d.scheduleClass, strength: d.strength.trim() || undefined,
        ndc: d.ndc.trim() || undefined, lotNumber: d.lotNumber.trim() || undefined,
        expirationDate: d.expirationDate ? dateInputToISO(d.expirationDate) : null,
        containerLabel: d.containerLabel.trim() || undefined, quantityUnit: d.quantityUnit.trim() || "units",
        initialQuantity: qty, currentQuantity: qty, state: "received",
        locationId: d.locationId || null, receivedDate,
        orderReference: d.orderReference.trim() || undefined, supplierName: d.supplierName.trim() || undefined,
        hasDiscrepancy: false,
      });
      await createEvent.mutateAsync({
        itemId: item.id, eventType: "receive", eventDate: receivedDate, quantity: qty, balanceAfter: qty,
        performedByName: profile?.fullName || undefined, performedByUserId: profile?.userId || null, documentUrl,
        discrepancy: false,
      });
      toast.success("Delivery logged");
      setReceiving(false);
      setOpenId(item.id);
    } catch { toast.error("Couldn't log the delivery."); }
    finally { setSaving(false); }
  }

  async function addEvent(d: EventForm, file: File | null) {
    if (!openItem) return;
    setSaving(true);
    try {
      let documentUrl: string | null = null;
      if (file) { try { documentUrl = await uploadFile(file, "controlled-substances"); } catch { toast.error("Couldn't upload the document — logging without it."); } }
      const qty = Number(d.quantity) || 0;
      const cur = openItem.currentQuantity;
      // Compute the new balance + item state from the event type.
      let balance = cur;
      const patch: Partial<ControlledSubstanceItem> = {};
      switch (d.eventType) {
        case "administer": balance = Math.max(0, cur - qty); patch.state = balance === 0 ? "depleted" : "in_use"; break;
        case "waste": balance = Math.max(0, cur - qty); patch.state = balance === 0 ? "wasted" : openItem.state; break;
        case "destroy": balance = 0; patch.state = "destroyed"; break;
        case "adjust": balance = qty; break; // corrected balance
        case "count": balance = cur; break; // no change; discrepancy captured separately
        case "assign_to_staff": patch.state = "assigned_to_staff"; patch.custodianName = d.toCustodian.trim(); patch.custodianUserId = staff.find((s) => s.name === d.toCustodian.trim())?.userId ?? null; break;
        case "transfer_to_safe": patch.state = "in_primary_safe"; break;
        case "return_to_safe": patch.state = "in_primary_safe"; patch.custodianName = undefined; patch.custodianUserId = null; break;
      }
      patch.currentQuantity = balance;
      if (d.discrepancy) patch.hasDiscrepancy = true;
      await createEvent.mutateAsync({
        itemId: openItem.id, eventType: d.eventType, eventDate: d.eventDate ? dateInputToISO(d.eventDate) : new Date().toISOString(),
        quantity: qty, balanceAfter: balance,
        fromCustodianName: openItem.custodianName || undefined,
        toCustodianName: d.eventType === "assign_to_staff" ? d.toCustodian.trim() : undefined,
        toCustodianUserId: d.eventType === "assign_to_staff" ? (staff.find((s) => s.name === d.toCustodian.trim())?.userId ?? null) : null,
        performedByName: profile?.fullName || undefined, performedByUserId: profile?.userId || null,
        witnessName: d.witnessName.trim() || undefined, patientRef: d.patientRef.trim() || undefined, documentUrl,
        discrepancy: d.discrepancy, discrepancyNote: d.discrepancyNote.trim() || undefined,
      });
      await updateItem.mutateAsync({ id: openItem.id, patch });
      toast.success("Event recorded");
      setAddingEvent(false);
    } catch { toast.error("Couldn't record the event."); }
    finally { setSaving(false); }
  }

  // CS-6: create a tracked corrective action for a discrepancy and link it to the event.
  async function resolveDiscrepancy(d: { title: string; rootCause: string; actionPlan: string; ownerName: string; dueDate: string }) {
    if (!resolving) return;
    setSaving(true);
    try {
      const capa = await createCapa.mutateAsync({
        title: d.title.trim(),
        rootCause: d.rootCause.trim() || undefined,
        actionPlan: d.actionPlan.trim() || undefined,
        ownerName: d.ownerName.trim() || undefined,
        ownerUserId: staff.find((s) => s.name === d.ownerName.trim())?.userId ?? null,
        dueDate: d.dueDate ? dateInputToISO(d.dueDate) : null,
        status: "open",
      });
      await updateEvent.mutateAsync({ id: resolving.id, patch: { correctiveActionId: capa.id } });
      toast.success("Corrective action created and linked");
      setResolving(null);
    } catch { toast.error("Couldn't create the corrective action."); }
    finally { setSaving(false); }
  }

  async function saveDea(d: DeaForm & { locationId: string }, file: File | null) {
    setSaving(true);
    try {
      let documentUrl: string | null = null;
      if (file) { try { documentUrl = await uploadFile(file, "dea-records"); } catch { toast.error("Couldn't upload the document — saving without it."); } }
      await createDea.mutateAsync({
        recordType: d.recordType,
        recordDate: d.recordDate ? dateInputToISO(d.recordDate) : null,
        referenceNumber: d.referenceNumber.trim() || undefined,
        periodStart: d.periodStart ? dateInputToISO(d.periodStart) : null,
        periodEnd: d.periodEnd ? dateInputToISO(d.periodEnd) : null,
        locationId: d.locationId || null,
        filedByName: profile?.fullName || undefined,
        documentUrl,
        notes: d.notes.trim() || undefined,
      });
      toast.success("DEA record saved");
      setAddingDea(false);
    } catch { toast.error("Couldn't save the DEA record."); }
    finally { setSaving(false); }
  }

  // CS-8: AI reconstructs and verifies a container's chain of custody.
  async function runAudit(item: ControlledSubstanceItem) {
    setAuditing(true);
    setAudit(null);
    try {
      const chain = eventsFor(item.id);
      const res = await fetch("/api/ai/cs-audit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: { substanceName: item.substanceName, scheduleClass: item.scheduleClass, quantityUnit: item.quantityUnit, initialQuantity: item.initialQuantity, currentQuantity: item.currentQuantity, state: item.state, custodianName: item.custodianName, hasDiscrepancy: item.hasDiscrepancy },
          events: chain.map((e) => ({ eventType: e.eventType, eventDate: e.eventDate, quantity: e.quantity, balanceAfter: e.balanceAfter, toCustodianName: e.toCustodianName, performedByName: e.performedByName, witnessName: e.witnessName, hasDocument: !!e.documentUrl, discrepancy: e.discrepancy, hasCorrectiveAction: !!e.correctiveActionId })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI audit failed");
      setAudit(data as CsAudit);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI audit failed.");
    } finally { setAuditing(false); }
  }

  if (itemsQ.isError) return <div className="space-y-6"><PageHeader title="Controlled Substances" /><ErrorState message="We couldn't load controlled-substance records." onRetry={() => void itemsQ.refetch()} /></div>;
  const loading = itemsQ.isLoading || eventsQ.isLoading;

  /* ── bottle detail: chain of custody ── */
  if (openItem) {
    const chain = eventsFor(openItem.id);
    return (
      <div className="space-y-6">
        {addingEvent && <EventDialog item={openItem} staff={staff} onClose={() => setAddingEvent(false)} onSave={addEvent} saving={saving} />}
        {resolving && <CapaDialog item={openItem} event={resolving} owners={owners} onClose={() => setResolving(null)} onSave={resolveDiscrepancy} saving={saving} />}
        <PageHeader
          title={openItem.substanceName}
          description={`${openItem.strength ? openItem.strength + " · " : ""}Schedule ${openItem.scheduleClass}${openItem.containerLabel ? " · " + openItem.containerLabel : ""}${openItem.lotNumber ? " · Lot " + openItem.lotNumber : ""}`}
          actions={<div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setOpenId(null); setAudit(null); }}><ArrowLeft className="size-4" /> All bottles</Button>
            <Button variant="outline" onClick={() => void runAudit(openItem)} disabled={auditing}><Sparkles className="size-4" /> {auditing ? "Auditing…" : "AI chain audit"}</Button>
            {!CLOSED_STATES.includes(openItem.state) && <Button onClick={() => setAddingEvent(true)}><Plus className="size-4" /> Record event</Button>}
          </div>}
        />
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Current balance" value={`${openItem.currentQuantity} ${openItem.quantityUnit}`} icon={FlaskConical} tone={openItem.currentQuantity === 0 ? "default" : "success"} />
          <StatCard label="State" value={STATE_LABEL[openItem.state]} icon={Package} tone={openItem.state === "quarantined" ? "destructive" : "default"} />
          <StatCard label="Custodian" value={openItem.custodianName || locName(openItem.locationId) || "—"} icon={UserCheck} />
          <StatCard label="Received" value={openItem.initialQuantity} hint={`${openItem.receivedDate ? formatDate(openItem.receivedDate) : ""}${openItem.orderReference ? " · " + openItem.orderReference : ""}`} icon={Package} />
        </div>
        {openItem.hasDiscrepancy && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> This container has a flagged discrepancy — review the chain below and ensure a corrective action is documented.
          </div>
        )}
        {audit && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="size-4 text-primary" /> AI chain audit</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={AUDIT_TONE[audit.verdict]} className="capitalize">{audit.verdict}</Badge>
                  <Badge variant={audit.balanceReconciles ? "success" : "destructive"}>{audit.balanceReconciles ? "Balance reconciles" : "Balance mismatch"}</Badge>
                  <button onClick={() => setAudit(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{audit.summary}</p>
              {audit.issues.length > 0 && (
                <div className="space-y-1.5">
                  {audit.issues.map((iss, n) => (
                    <p key={n} className="flex items-start gap-1.5"><AlertTriangle className={`mt-0.5 size-3.5 shrink-0 ${iss.severity === "high" ? "text-destructive" : "text-warning"}`} /><span>{iss.issue}</span></p>
                  ))}
                </div>
              )}
              {audit.recommendations.length > 0 && (
                <div className="rounded-md bg-secondary/30 p-3">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Recommended</p>
                  <ul className="list-disc space-y-1 pl-4 text-xs">{audit.recommendations.map((r, n) => <li key={n}>{r}</li>)}</ul>
                </div>
              )}
              {audit.verdict === "clean" && audit.issues.length === 0 && (
                <p className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="size-3.5" /> No chain-of-custody issues found. AI decision-support — verify against the source records.</p>
              )}
              <p className="text-[11px] text-muted-foreground">AI decision-support, not a substitute for a manual DEA audit. Verify findings against the scanned records.</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle className="text-sm">Chain of custody</CardTitle></CardHeader>
          <CardContent>
            {chain.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {chain.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className={`absolute -left-[23px] top-1 size-3 rounded-full ring-2 ring-card ${ev.discrepancy ? "bg-destructive" : "bg-primary"}`} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={ev.discrepancy ? "destructive" : "secondary"}>{EVENT_LABEL[ev.eventType]}</Badge>
                      {QTY_EVENTS.includes(ev.eventType) && <span className="text-sm font-medium">{ev.quantity} {openItem.quantityUnit}</span>}
                      {ev.balanceAfter != null && <span className="text-xs text-muted-foreground">→ balance {ev.balanceAfter} {openItem.quantityUnit}</span>}
                      <span className="text-xs text-muted-foreground">· {ev.eventDate ? formatDate(ev.eventDate) : formatDate(ev.createdDate)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {ev.toCustodianName && <span>To: {ev.toCustodianName}</span>}
                      {ev.performedByName && <span>By: {ev.performedByName}</span>}
                      {ev.witnessName && <span>Witness: {ev.witnessName}</span>}
                      {ev.patientRef && <span>Patient: {ev.patientRef}</span>}
                      {ev.documentUrl && <FileLink path={ev.documentUrl} label="Scanned record" className="text-primary hover:underline" />}
                    </div>
                    {ev.discrepancy && ev.discrepancyNote && <p className="mt-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{ev.discrepancyNote}</p>}
                    {ev.discrepancy && (
                      <div className="mt-1.5">
                        {ev.correctiveActionId && capaById.get(ev.correctiveActionId) ? (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground">Corrective action:</span>
                            <Badge variant={CAPA_STATUS_VARIANT[capaById.get(ev.correctiveActionId)!.status]}>{capaById.get(ev.correctiveActionId)!.status.replace("_", " ")}</Badge>
                            <span className="text-muted-foreground">{capaById.get(ev.correctiveActionId)!.title}</span>
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setResolving(ev)}>Track corrective action</Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ── bottle list ── */
  return (
    <div className="space-y-6">
      {receiving && <ReceiveDialog locations={locations} onClose={() => setReceiving(false)} onSave={receive} saving={saving} />}
      {addingDea && <DeaDialog locations={locations} onClose={() => setAddingDea(false)} onSave={saveDea} saving={saving} />}
      <PageHeader
        title="Controlled Substances"
        description="Per-bottle chain of custody, from delivery through administration, waste, or destruction. Lone Peak administers on-site only — every container is tracked with scanned DEA records."
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAddingDea(true)}><Plus className="size-4" /> DEA record</Button>
          <Button onClick={() => setReceiving(true)}><Plus className="size-4" /> Receive delivery</Button>
        </div>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active bottles" value={stats.active} icon={Package} loading={loading} />
        <StatCard label="In staff custody" value={stats.inCustody} icon={UserCheck} loading={loading} />
        <StatCard label="Discrepancies" value={stats.discrepancies} icon={AlertTriangle} tone={stats.discrepancies ? "destructive" : "success"} loading={loading} />
        <StatCard label="Expired on hand" value={stats.expiring} icon={ShieldAlert} tone={stats.expiring ? "warning" : "default"} loading={loading} />
      </div>
      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input className="input w-full pl-9" placeholder="Search substance, label, lot, custodian…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : sorted.length === 0 ? (
            <EmptyState icon={Package} title={search ? "No bottles found" : "No controlled substances tracked yet"} description={search ? "Try adjusting your search." : "Log a delivery to start a bottle's chain of custody."} action={<Button onClick={() => setReceiving(true)}><Plus className="size-4" /> Receive delivery</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Substance" sortKey="substance" sort={sort} onToggle={toggle} />
                    <SortHeader label="Label / lot" sortKey="label" sort={sort} onToggle={toggle} />
                    <SortHeader label="Balance" sortKey="balance" sort={sort} onToggle={toggle} />
                    <SortHeader label="State" sortKey="state" sort={sort} onToggle={toggle} />
                    <SortHeader label="Custodian" sortKey="custodian" sort={sort} onToggle={toggle} className="pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((i) => (
                    <tr key={i.id} className="cursor-pointer border-b border-border/50 hover:bg-secondary/20" onClick={() => { setOpenId(i.id); setAudit(null); }}>
                      <td data-label="Substance" className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{i.substanceName}</span>
                          <Badge variant={SCHED_VARIANT[i.scheduleClass]}>C-{i.scheduleClass}</Badge>
                          {i.hasDiscrepancy && <AlertTriangle className="size-3.5 text-destructive" />}
                        </div>
                        {i.strength && <span className="text-xs text-muted-foreground">{i.strength}</span>}
                      </td>
                      <td data-label="Label / lot" className="py-3 pr-4 text-muted-foreground">
                        {i.containerLabel && <span className="font-mono text-xs">{i.containerLabel}</span>}
                        {i.lotNumber && <span className="block text-xs">Lot {i.lotNumber}</span>}
                        {!i.containerLabel && !i.lotNumber && "—"}
                      </td>
                      <td data-label="Balance" className="py-3 pr-4 tabular-nums">{i.currentQuantity} {i.quantityUnit}</td>
                      <td data-label="State" className="py-3 pr-4"><Badge variant={STATE_VARIANT[i.state]}>{STATE_LABEL[i.state]}</Badge></td>
                      <td data-label="Custodian" className="py-3 text-muted-foreground">{i.custodianName || locName(i.locationId) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CS-3: DEA regulatory records register (222/CSOS, biennial inventory, Form 41/106). */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">DEA regulatory records</CardTitle>
            <p className="text-xs text-muted-foreground">222/CSOS orders, biennial inventory, Form 41 destruction, Form 106 theft/loss — retain ≥2 years</p>
          </div>
        </CardHeader>
        <CardContent>
          {deaRecords.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No DEA records logged yet. Add a scanned 222, biennial inventory, or Form 41/106.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Reference</th>
                    <th className="pb-2 pr-4 font-medium">Filed by</th>
                    <th className="pb-2 font-medium">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {deaRecords.map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td data-label="Type" className="py-2.5 pr-4 font-medium">{DEA_RECORD_LABEL[r.recordType]}</td>
                      <td data-label="Date" className="py-2.5 pr-4 text-muted-foreground">
                        {r.recordDate ? formatDate(r.recordDate) : "—"}
                        {r.recordType === "biennial_inventory" && r.periodStart && r.periodEnd && <span className="block text-xs">{formatDate(r.periodStart)}–{formatDate(r.periodEnd)}</span>}
                      </td>
                      <td data-label="Reference" className="py-2.5 pr-4 text-muted-foreground">{r.referenceNumber ?? "—"}</td>
                      <td data-label="Filed by" className="py-2.5 pr-4 text-muted-foreground">{r.filedByName ?? "—"}</td>
                      <td data-label="Document" className="py-2.5">{r.documentUrl ? <FileLink path={r.documentUrl} label="View" className="text-primary hover:underline" /> : <span className="text-muted-foreground">—</span>}</td>
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
