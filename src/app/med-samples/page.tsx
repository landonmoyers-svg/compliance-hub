"use client";

import { useState, useMemo, useRef } from "react";
import {
  Pill, Plus, Search, Sparkles, X, PackagePlus, History, AlertTriangle,
  CalendarClock, Phone, Mail, Copy, Users, TrendingDown, Camera, Upload,
} from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { uploadFile } from "@/lib/storage";
import { normalizeImage } from "@/lib/images";
import { guessLocation } from "@/lib/geo";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SignedImage } from "@/components/shared/signed-image";
import { CameraCapture, type CaptureMeta } from "@/components/shared/camera-capture";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { AdminDeleteButton } from "@/components/shared/admin-delete-button";
import type { MedSample, MedSampleLog, DrugRep, WorkLocation } from "@/lib/data/schema";
import { sampleForms } from "@/lib/data/schema";
import { humanizeLabel } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import {
  runway, pace, paceLabel, suggestedRequest, restockMessage, expiry, unitCount,
  confidenceNote, trendNote, RUNWAY_CRITICAL_DAYS, type Runway,
} from "@/lib/med-samples";
import { toast } from "sonner";

const MAX_IMG_MB = 12;
const AI_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const UNITS = ["box", "carton", "pack", "pen", "vial", "each", "bottle"] as const;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ─────────────────────────── add / edit ─────────────────────────── */

interface SampleForm {
  name: string; strength: string; form: string; manufacturer: string; ndc: string;
  locationId: string; room: string; quantityOnHand: string; unit: string;
  parLevel: string; lotNumber: string; expirationDate: string; repId: string; notes: string;
}
const emptyForm = (): SampleForm => ({
  name: "", strength: "", form: "box", manufacturer: "", ndc: "", locationId: "", room: "",
  quantityOnHand: "0", unit: "box", parLevel: "0", lotNumber: "", expirationDate: "", repId: "", notes: "",
});
const numOk = (v: string) => v.trim() !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0;

function SampleDialog({ initial, locations, reps, onClose, onSave, saving }: {
  initial?: MedSample; locations: WorkLocation[]; reps: DrugRep[];
  onClose: () => void; saving: boolean;
  onSave: (patch: Partial<MedSample>) => void;
}) {
  const [form, setForm] = useState<SampleForm>(() => initial ? {
    name: initial.name, strength: initial.strength ?? "", form: initial.form,
    manufacturer: initial.manufacturer ?? "", ndc: initial.ndc ?? "",
    locationId: initial.locationId ?? "", room: initial.room ?? "",
    quantityOnHand: String(initial.quantityOnHand ?? 0), unit: initial.unit,
    parLevel: String(initial.parLevel ?? 0), lotNumber: initial.lotNumber ?? "",
    expirationDate: (initial.expirationDate ?? "").slice(0, 10), repId: initial.repId ?? "",
    notes: initial.notes ?? "",
  } : emptyForm());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [exif, setExif] = useState<{ capturedAt?: string; lat?: number; lng?: number }>({});
  const [camOpen, setCamOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiState, setAiState] = useState<{ identified: boolean; confidence?: string }>({ identified: false });

  const set = (k: keyof SampleForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleImage(picked: File, override?: CaptureMeta) {
    if (picked.size > MAX_IMG_MB * 1024 * 1024) { toast.error(`Image too large (max ${MAX_IMG_MB}MB).`); return; }
    setAnalyzing(true); setAiNote(null);
    const norm = await normalizeImage(picked);
    const lat = override?.lat ?? norm.lat, lng = override?.lng ?? norm.lng;
    setFile(norm.file); setPreview(URL.createObjectURL(norm.file));
    setExif({ capturedAt: override?.capturedAt ?? norm.capturedAt, lat, lng });

    const gpsGuess = guessLocation(lat, lng, locations);
    let locNote = "";
    if (gpsGuess) { setForm((p) => ({ ...p, locationId: p.locationId || gpsGuess.location.id })); locNote = ` Site set from photo GPS: “${gpsGuess.location.name}”.`; }

    if (!AI_MIMES.includes(norm.file.type)) {
      setAiNote(`Photo attached. Fill the details manually.${locNote}`); setAnalyzing(false); return;
    }
    try {
      const base64 = await fileToBase64(norm.file);
      const res = await fetch("/api/ai/medsample-identify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: norm.file.type, locationNames: locations.map((l) => l.name) }),
      });
      if (!res.ok) throw new Error("identify failed");
      const r = await res.json() as {
        name: string; strength: string | null; form: string; manufacturer: string | null; ndc: string | null;
        unit: string; lotNumber: string | null; expirationDate: string | null;
        suggestedRoom: string | null; suggestedLocationName: string | null; confidence: string;
      };
      const visualMatch = !gpsGuess && r.suggestedLocationName
        ? locations.find((l) => l.name.toLowerCase() === r.suggestedLocationName!.toLowerCase()) : undefined;
      setForm((p) => ({
        ...p,
        name: r.name || p.name,
        strength: p.strength || r.strength || "",
        form: (sampleForms as readonly string[]).includes(r.form) ? r.form : p.form,
        manufacturer: p.manufacturer || r.manufacturer || "",
        ndc: p.ndc || r.ndc || "",
        unit: (UNITS as readonly string[]).includes(r.unit) ? r.unit : p.unit,
        lotNumber: p.lotNumber || r.lotNumber || "",
        expirationDate: p.expirationDate || r.expirationDate || "",
        room: p.room || r.suggestedRoom || "",
        locationId: gpsGuess ? p.locationId : (visualMatch?.id ?? p.locationId),
      }));
      setAiState({ identified: true, confidence: r.confidence });
      setAiNote(`Identified as “${r.name}” (${r.confidence} confidence). Check every field before saving.${locNote}`);
    } catch {
      setAiNote(`Photo attached, but identification failed. Fill the details manually.${locNote}`);
    } finally { setAnalyzing(false); }
  }

  async function submit() {
    let imageUrl: string | undefined;
    if (file) {
      try { imageUrl = await uploadFile(file, "med-sample"); }
      catch { toast.error("Couldn't upload the photo. Saving without it."); }
    }
    onSave({
      name: form.name.trim(),
      strength: form.strength.trim() || null,
      form: form.form as MedSample["form"],
      manufacturer: form.manufacturer.trim() || null,
      ndc: form.ndc.trim() || null,
      locationId: form.locationId || null,
      room: form.room.trim() || null,
      quantityOnHand: Number(form.quantityOnHand),
      unit: form.unit,
      parLevel: Number(form.parLevel),
      lotNumber: form.lotNumber.trim() || null,
      expirationDate: form.expirationDate || null,
      repId: form.repId || null,
      notes: form.notes.trim() || null,
      ...(imageUrl ? { imageUrl, capturedAt: exif.capturedAt ?? null, capturedLat: exif.lat ?? null, capturedLng: exif.lng ?? null } : {}),
      ...(aiState.identified ? { aiIdentified: true, aiConfidence: aiState.confidence ?? null } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><Pill className="size-4 text-primary" /> {initial ? "Edit sample" : "Add sample"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-dashed border-border p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-primary" /> Photograph the carton</p>
            <p className="mb-3 text-xs text-muted-foreground">The label is read for you — drug, strength, manufacturer, NDC, lot and expiry. Nothing is entered that isn&apos;t legible in the photo, so check each field.</p>
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImage(f); e.target.value = ""; }} />
            <CameraCapture open={camOpen} wantGeo onCapture={(f, m) => { setCamOpen(false); void handleImage(f, m); }} onClose={() => setCamOpen(false)} />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => setCamOpen(true)} disabled={analyzing}><Camera className="size-4" /> Take photo</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={analyzing}><Upload className="size-4" /> Upload</Button>
            </div>
            {preview && <img src={preview} alt="" className="mt-3 max-h-40 rounded-lg border border-border object-contain" />}
            {analyzing && <p className="mt-2 text-xs text-muted-foreground">Reading the label…</p>}
            {aiNote && <p className="mt-2 text-xs text-muted-foreground">{aiNote}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Drug *</label>
              <input className="input w-full" value={form.name} onChange={set("name")} placeholder="e.g. Trintellix (vortioxetine)" />
            </div>
            <div><label className="text-sm font-medium">Strength</label>
              <input className="input w-full" value={form.strength} onChange={set("strength")} placeholder="10 mg" /></div>
            <div><label className="text-sm font-medium">Package</label>
              <select className="input w-full" value={form.form} onChange={set("form")}>
                {sampleForms.map((f) => <option key={f} value={f}>{humanizeLabel(f)}</option>)}
              </select></div>
            <div><label className="text-sm font-medium">Manufacturer</label>
              <input className="input w-full" value={form.manufacturer} onChange={set("manufacturer")} /></div>
            <div><label className="text-sm font-medium">NDC</label>
              <input className="input w-full" value={form.ndc} onChange={set("ndc")} /></div>

            <div><label className="text-sm font-medium">Site *</label>
              <select className="input w-full" value={form.locationId} onChange={set("locationId")}>
                <option value="">Select a site…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
            <div><label className="text-sm font-medium">Storage</label>
              <input className="input w-full" value={form.room} onChange={set("room")} placeholder="sample closet" /></div>

            <div><label className="text-sm font-medium">On hand</label>
              <input type="number" min={0} className="input w-full" value={form.quantityOnHand} onChange={set("quantityOnHand")} /></div>
            <div><label className="text-sm font-medium">Counted in</label>
              <select className="input w-full" value={form.unit} onChange={set("unit")}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select></div>
            <div><label className="text-sm font-medium">Minimum to keep</label>
              <input type="number" min={0} className="input w-full" value={form.parLevel} onChange={set("parLevel")} />
              <p className="mt-1 text-xs text-muted-foreground">Optional backstop. The runway warning comes from actual pace.</p></div>
            <div><label className="text-sm font-medium">Lot</label>
              <input className="input w-full" value={form.lotNumber} onChange={set("lotNumber")} /></div>
            <div><label className="text-sm font-medium">Expires</label>
              <input type="date" className="input w-full" value={form.expirationDate} onChange={set("expirationDate")} /></div>
            <div><label className="text-sm font-medium">Rep to call</label>
              <select className="input w-full" value={form.repId} onChange={set("repId")}>
                <option value="">No rep on file</option>
                {reps.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}{r.company ? ` — ${r.company}` : ""}</option>)}
              </select></div>
            <div className="sm:col-span-2"><label className="text-sm font-medium">Notes</label>
              <textarea rows={2} className="input w-full" value={form.notes} onChange={set("notes")} /></div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!form.name.trim() || !numOk(form.quantityOnHand) || !numOk(form.parLevel) || saving || analyzing}>
            {saving ? "Saving…" : initial ? "Save" : "Add sample"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── dispense ─────────────────────────── */

function DispenseDialog({ sample, byName, onClose, onSave, saving }: {
  sample: MedSample; byName: string; onClose: () => void; saving: boolean;
  onSave: (patch: Partial<MedSample>, log: Omit<MedSampleLog, "id" | "createdDate">) => void;
}) {
  const [action, setAction] = useState<MedSampleLog["action"]>("dispensed");
  const [qty, setQty] = useState("1");
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 10));
  const [lot, setLot] = useState(sample.lotNumber ?? "");
  const [note, setNote] = useState("");

  const amt = Number(qty) || 0;
  const adds = action === "received";
  const balanceAfter = adds ? sample.quantityOnHand + amt : Math.max(0, sample.quantityOnHand - amt);
  const delta = balanceAfter - sample.quantityOnHand;

  function submit() {
    const patch: Partial<MedSample> = { quantityOnHand: balanceAfter };
    if (adds && lot.trim() && lot.trim() !== (sample.lotNumber ?? "")) patch.lotNumber = lot.trim();
    onSave(patch, {
      sampleId: sample.id, action, quantityDelta: delta, balanceAfter,
      occurredAt: new Date(`${when}T12:00:00`).toISOString(),
      lotNumber: lot.trim() || null, byName: byName || null, note: note.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><PackagePlus className="size-4 text-primary" /> Record movement</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{sample.name}</span>
            {sample.strength ? ` ${sample.strength}` : ""} — on hand{" "}
            <span className="font-medium text-foreground">{sample.quantityOnHand} {sample.unit}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium">What happened</label>
              <select className="input w-full" value={action} onChange={(e) => setAction(e.target.value as MedSampleLog["action"])}>
                <option value="dispensed">Given to a patient</option>
                <option value="received">Received from rep</option>
                <option value="expired">Pulled — expired</option>
                <option value="discarded">Discarded / damaged</option>
                <option value="adjusted">Count correction</option>
              </select></div>
            <div><label className="text-sm font-medium">How many</label>
              <input type="number" min={0} className="input w-full" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div><label className="text-sm font-medium">When</label>
              <input type="date" className="input w-full" value={when} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setWhen(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Back-date it if you&apos;re catching up — pace uses this date.</p></div>
            <div><label className="text-sm font-medium">Lot</label>
              <input className="input w-full" value={lot} onChange={(e) => setLot(e.target.value)} /></div>
          </div>
          <div><label className="text-sm font-medium">Note</label>
            <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <p className="rounded-md bg-secondary px-3 py-2 text-sm">
            New balance: <span className="font-semibold">{balanceAfter} {sample.unit}</span>
            <span className="text-muted-foreground"> ({delta >= 0 ? "+" : ""}{delta})</span>
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || amt <= 0}>{saving ? "Saving…" : "Record"}</Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── history ─────────────────────────── */

function HistoryDialog({ sample, logs, onClose }: { sample: MedSample; logs: MedSampleLog[]; onClose: () => void }) {
  const rows = useMemo(
    () => logs.filter((l) => l.sampleId === sample.id)
      .sort((a, b) => new Date(b.occurredAt ?? b.createdDate).getTime() - new Date(a.occurredAt ?? a.createdDate).getTime()),
    [logs, sample.id],
  );
  const p = pace(rows);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><History className="size-4 text-primary" /> {sample.name} — movement</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          <p className="mb-4 rounded-md bg-secondary px-3 py-2 text-sm">
            {p.basis === "measured" ? (
              <>
                Dispensing {paceLabel(p, sample.unit)} — {unitCount(p.totalUsed, sample.unit)} across {p.events} entries.
                <span className="block text-xs text-muted-foreground">{confidenceNote(p)}{trendNote(p) ? ` · ${trendNote(p)}.` : ""}</span>
              </>
            ) : <>{confidenceNote(p)}</>}
          </p>
          {rows.length === 0 ? <EmptyState title="Nothing recorded yet" description="Movements appear here once you record them." />
            : <table className="rtable w-full text-sm">
                <thead><tr className="border-b border-border text-left"><th className="py-2 pr-3">When</th><th className="py-2 pr-3">What</th><th className="py-2 pr-3">Change</th><th className="py-2 pr-3">Balance</th><th className="py-2 pr-3">By</th><th className="py-2">Note</th></tr></thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="border-b border-border/60">
                      <td data-label="When" className="py-2 pr-3">{formatDate(l.occurredAt ?? l.createdDate)}</td>
                      <td data-label="What" className="py-2 pr-3">{humanizeLabel(l.action)}</td>
                      <td data-label="Change" className="py-2 pr-3 font-medium">{l.quantityDelta >= 0 ? "+" : ""}{l.quantityDelta}</td>
                      <td data-label="Balance" className="py-2 pr-3">{l.balanceAfter ?? "—"}</td>
                      <td data-label="By" className="py-2 pr-3">{l.byName ?? "—"}</td>
                      <td data-label="Note" className="py-2 text-muted-foreground">{l.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── request more ─────────────────────────── */

function RequestDialog({ sample, rep, logs, siteName, onClose, onLogged }: {
  sample: MedSample; rep?: DrugRep; logs: MedSampleLog[]; siteName?: string;
  onClose: () => void; onLogged: () => void;
}) {
  const qty = suggestedRequest(sample, logs);
  const [msg, setMsg] = useState(() => restockMessage(sample, rep, qty, siteName));
  const subject = `Sample request — ${sample.name}${sample.strength ? ` ${sample.strength}` : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><Phone className="size-4 text-primary" /> Request more samples</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {!rep ? (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
              No rep is on file for this sample. Add one under <span className="font-medium">Reps</span>, then set it on the sample.
            </p>
          ) : (
            <div className="rounded-lg border border-border p-3">
              <p className="font-medium">{rep.name}</p>
              {rep.company && <p className="text-sm text-muted-foreground">{rep.company}{rep.territory ? ` · ${rep.territory}` : ""}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {rep.phone && <a href={`tel:${rep.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-secondary"><Phone className="size-3.5" /> {rep.phone}</a>}
                {rep.email && <a href={`mailto:${rep.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-secondary"><Mail className="size-3.5" /> {rep.email}</a>}
              </div>
              {rep.lastContactDate && <p className="mt-2 text-xs text-muted-foreground">Last contacted {formatDate(rep.lastContactDate)}</p>}
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Message</label>
            <textarea rows={7} className="input w-full" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              {qty === null
                ? "No quantity suggested — there isn't enough dispensing history to size the request, so name an amount yourself."
                : qty === 0
                  ? "You have more than 60 days of stock at the current pace, so no quantity was suggested."
                  : `Suggested ${unitCount(qty, sample.unit)} — roughly 60 days at the current pace, less what's on the shelf.`}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(msg); toast.success("Message copied"); }}>
            <Copy className="size-4" /> Copy
          </Button>
          {rep && <Button onClick={onLogged}>Mark as contacted</Button>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── reps ─────────────────────────── */

function RepsDialog({ reps, onClose, onCreate, onUpdate, saving }: {
  reps: DrugRep[]; onClose: () => void; saving: boolean;
  onCreate: (d: Omit<DrugRep, "id" | "createdDate">) => void;
  onUpdate: (id: string, patch: Partial<DrugRep>) => void;
}) {
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", territory: "" });
  const ok = f.name.trim().length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><Users className="size-4 text-primary" /> Drug reps</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {reps.length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border">
              {reps.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[r.company, r.phone, r.email].filter(Boolean).join(" · ") || "No contact details"}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onUpdate(r.id, { active: !r.active })}>
                    {r.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="mb-2 text-sm font-medium">Add a rep</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input w-full" placeholder="Name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <input className="input w-full" placeholder="Company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
              <input className="input w-full" placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              <input className="input w-full" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <input className="input w-full sm:col-span-2" placeholder="Territory / notes" value={f.territory} onChange={(e) => setF({ ...f, territory: e.target.value })} />
            </div>
            <Button className="mt-3" size="sm" disabled={!ok || saving}
              onClick={() => { onCreate({ name: f.name.trim(), company: f.company.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null, territory: f.territory.trim() || null, active: true, lastContactDate: null, notes: null }); setF({ name: "", company: "", phone: "", email: "", territory: "" }); }}>
              <Plus className="size-4" /> Add rep
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── page ─────────────────────────── */

function RunwayCell({ r, unit }: { r: Runway; unit: string }) {
  if (r.status === "out") return <Badge variant="destructive">Out of stock</Badge>;
  if (r.daysLeft === null) {
    return (
      <span className="text-sm text-muted-foreground">
        {r.belowPar ? <Badge variant="destructive">Below minimum</Badge> : "Not enough history"}
      </span>
    );
  }
  const d = Math.floor(r.daysLeft);
  const tone = r.status === "critical" ? "destructive" : r.status === "watch" ? "warning" : "success";
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={tone as "destructive" | "warning" | "success"}>
        {d <= 0 ? "Out now" : d === 1 ? "1 day left" : `${d} days left`}
      </Badge>
      {r.runsOutOn && <span className="text-xs text-muted-foreground">~{formatDate(r.runsOutOn.toISOString())}</span>}
    </div>
  );
}

export default function MedSamplesPage() {
  const { profile } = useAuth();
  const samplesQ = useCollection("medSamples");
  const logsQ = useCollection("medSampleLogs");
  const repsQ = useCollection("drugReps");
  const locationsQ = useCollection("locations");

  const createSample = useCreate("medSamples");
  const updateSample = useUpdate("medSamples");
  const createLog = useCreate("medSampleLogs");
  const createRep = useCreate("drugReps");
  const updateRep = useUpdate("drugReps");

  const [q, setQ] = useState("");
  const [site, setSite] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MedSample | null>(null);
  const [dispensing, setDispensing] = useState<MedSample | null>(null);
  const [history, setHistory] = useState<MedSample | null>(null);
  const [requesting, setRequesting] = useState<MedSample | null>(null);
  const [repsOpen, setRepsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const samples = useMemo(() => samplesQ.data ?? [], [samplesQ.data]);
  const logs = useMemo(() => logsQ.data ?? [], [logsQ.data]);
  const reps = useMemo(() => repsQ.data ?? [], [repsQ.data]);
  const locations = useMemo(() => (locationsQ.data ?? []).filter((l) => l.active), [locationsQ.data]);
  const locName = (id?: string | null) => locations.find((l) => l.id === id)?.name;
  const logsFor = (id: string) => logs.filter((l) => l.sampleId === id);

  /** Runway per sample, computed once. */
  const rows = useMemo(() => samples
    .filter((s) => s.active !== false)
    .map((s) => ({ s, r: runway(s, logsFor(s.id)), e: expiry(s) }))
    .filter(({ s }) => site === "all" || s.locationId === site)
    .filter(({ s }) => {
      const t = q.trim().toLowerCase();
      if (!t) return true;
      return [s.name, s.strength, s.manufacturer, s.ndc, s.room].filter(Boolean).join(" ").toLowerCase().includes(t);
    })
    // Worst first: out, then soonest to run out, then everything else.
    .sort((a, b) => {
      const rank = (x: typeof a) => x.r.status === "out" ? 0 : x.r.status === "critical" ? 1 : x.r.status === "watch" ? 2 : x.r.status === "unknown" ? 4 : 3;
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return (a.r.daysLeft ?? 1e9) - (b.r.daysLeft ?? 1e9);
    }), [samples, logs, site, q]);

  const stats = useMemo(() => {
    const all = samples.filter((s) => s.active !== false).map((s) => ({ s, r: runway(s, logsFor(s.id)), e: expiry(s) }));
    const scoped = site === "all" ? all : all.filter((x) => x.s.locationId === site);
    return {
      total: scoped.length,
      critical: scoped.filter((x) => x.r.status === "critical").length,
      out: scoped.filter((x) => x.r.status === "out").length,
      expiring: scoped.filter((x) => x.e.status === "expiring" || x.e.status === "expired").length,
    };
  }, [samples, logs, site]);

  async function saveNew(patch: Partial<MedSample>) {
    setSaving(true);
    try { await createSample.mutateAsync(patch as Omit<MedSample, "id" | "createdDate">); setAdding(false); toast.success("Sample added"); }
    catch { toast.error("Couldn't save the sample."); } finally { setSaving(false); }
  }
  async function saveEdit(patch: Partial<MedSample>) {
    if (!editing) return;
    setSaving(true);
    try { await updateSample.mutateAsync({ id: editing.id, patch }); setEditing(null); toast.success("Saved"); }
    catch { toast.error("Couldn't save the changes."); } finally { setSaving(false); }
  }
  async function saveMovement(patch: Partial<MedSample>, log: Omit<MedSampleLog, "id" | "createdDate">) {
    if (!dispensing) return;
    setSaving(true);
    try {
      await updateSample.mutateAsync({ id: dispensing.id, patch });
      await createLog.mutateAsync(log);
      setDispensing(null);
      toast.success("Recorded");
    } catch { toast.error("Couldn't record that."); } finally { setSaving(false); }
  }

  if (samplesQ.isError) return <ErrorState onRetry={() => void samplesQ.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Med Samples"
        description="Drug-rep samples held at each site, the pace they go out at, and who to call before you run out."
        actions={
          <>
            <Button variant="outline" onClick={() => setRepsOpen(true)}><Users className="size-4" /> Reps</Button>
            <Button onClick={() => setAdding(true)}><Plus className="size-4" /> Add sample</Button>
          </>
        }
      />

      <div className="grid auto-rows-min grid-cols-2 content-start gap-4 lg:grid-cols-4">
        <StatCard label="Products tracked" value={stats.total} icon={Pill} loading={samplesQ.isLoading} />
        <StatCard label={`Out within ${RUNWAY_CRITICAL_DAYS} days`} value={stats.critical} icon={TrendingDown} tone={stats.critical ? "destructive" : "default"} loading={samplesQ.isLoading} />
        <StatCard label="Out of stock" value={stats.out} icon={AlertTriangle} tone={stats.out ? "destructive" : "default"} loading={samplesQ.isLoading} />
        <StatCard label="Expiring or expired" value={stats.expiring} icon={CalendarClock} tone={stats.expiring ? "warning" : "default"} loading={samplesQ.isLoading} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-full pl-9" placeholder="Search drug, manufacturer, NDC…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setSite("all")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${site === "all" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>All sites</button>
              {locations.map((l) => (
                <button key={l.id} onClick={() => setSite(l.id)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${site === l.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{l.name}</button>
              ))}
            </div>
          </div>

          {samplesQ.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            : rows.length === 0 ? (
              <EmptyState
                title={samples.length === 0 ? "No samples tracked yet" : "Nothing matches"}
                description={samples.length === 0
                  ? "Add the first sample — photograph the carton and the label is read for you."
                  : "Try a different search or site."}
              />
            ) : (
              <table className="rtable w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-3">Drug</th><th className="py-2 pr-3">Site</th>
                    <th className="py-2 pr-3">On hand</th><th className="py-2 pr-3">Pace</th>
                    <th className="py-2 pr-3">Runway</th><th className="py-2 pr-3">Expires</th>
                    <th className="py-2 pr-3">Rep</th><th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ s, r, e }) => {
                    const rep = reps.find((x) => x.id === s.repId);
                    return (
                      <tr key={s.id} className="border-b border-border/60">
                        <td data-label="Drug" className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            {s.imageUrl && <SignedImage path={s.imageUrl} alt="" className="size-9 shrink-0 rounded border border-border object-cover" />}
                            <div className="min-w-0">
                              <button onClick={() => setEditing(s)} className="text-left font-medium text-primary hover:underline">{s.name}</button>
                              <p className="text-xs text-muted-foreground">{[s.strength, humanizeLabel(s.form), s.manufacturer].filter(Boolean).join(" · ")}</p>
                            </div>
                          </div>
                        </td>
                        <td data-label="Site" className="py-3 pr-3">
                          <span className="text-sm">{locName(s.locationId) ?? <span className="text-muted-foreground">Unassigned</span>}</span>
                          {s.room && <p className="text-xs text-muted-foreground">{s.room}</p>}
                        </td>
                        <td data-label="On hand" className="py-3 pr-3 whitespace-nowrap">{unitCount(s.quantityOnHand, s.unit)}</td>
                        <td data-label="Pace" className="py-3 pr-3 text-sm">
                          <span className="text-muted-foreground">{paceLabel(r.pace, s.unit)}</span>
                          {r.pace.basis === "measured" && (
                            <span className="block text-xs text-muted-foreground/80">
                              {r.pace.confidence === "strong" ? "settled" : r.pace.confidence === "good" ? "tightening" : "early estimate"}
                              {trendNote(r.pace) ? ` · ${trendNote(r.pace)!.toLowerCase()}` : ""}
                            </span>
                          )}
                        </td>
                        <td data-label="Runway" className="py-3 pr-3"><RunwayCell r={r} unit={s.unit} /></td>
                        <td data-label="Expires" className="py-3 pr-3">
                          {!s.expirationDate ? <span className="text-muted-foreground">—</span>
                            : e.status === "expired" ? <Badge variant="destructive">Expired</Badge>
                            : e.status === "expiring" ? <Badge variant="warning">{e.days}d</Badge>
                            : <span className="text-sm">{formatDate(s.expirationDate)}</span>}
                        </td>
                        <td data-label="Rep" className="py-3 pr-3 text-sm">
                          {rep ? <span>{rep.name}</span> : <span className="text-muted-foreground">None</span>}
                        </td>
                        <td data-label="Actions" className="py-3">
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="outline" onClick={() => setDispensing(s)}>Record</Button>
                            <Button size="sm" variant={r.status === "critical" || r.status === "out" ? "default" : "ghost"} onClick={() => setRequesting(s)}>Request</Button>
                            <Button size="sm" variant="ghost" onClick={() => setHistory(s)}><History className="size-4" /></Button>
                            <AdminDeleteButton collection="medSamples" id={s.id} label={s.name} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </CardContent>
      </Card>

      {adding && <SampleDialog locations={locations} reps={reps} saving={saving} onClose={() => setAdding(false)} onSave={saveNew} />}
      {editing && <SampleDialog initial={editing} locations={locations} reps={reps} saving={saving} onClose={() => setEditing(null)} onSave={saveEdit} />}
      {dispensing && <DispenseDialog sample={dispensing} byName={profile?.fullName ?? ""} saving={saving} onClose={() => setDispensing(null)} onSave={saveMovement} />}
      {history && <HistoryDialog sample={history} logs={logs} onClose={() => setHistory(null)} />}
      {requesting && (
        <RequestDialog
          sample={requesting}
          rep={reps.find((r) => r.id === requesting.repId)}
          logs={logsFor(requesting.id)}
          siteName={locName(requesting.locationId)}
          onClose={() => setRequesting(null)}
          onLogged={() => {
            const rep = reps.find((r) => r.id === requesting.repId);
            if (rep) void updateRep.mutateAsync({ id: rep.id, patch: { lastContactDate: new Date().toISOString().slice(0, 10) } });
            setRequesting(null);
            toast.success("Logged as contacted");
          }}
        />
      )}
      {repsOpen && (
        <RepsDialog
          reps={reps} saving={saving} onClose={() => setRepsOpen(false)}
          onCreate={async (d) => { setSaving(true); try { await createRep.mutateAsync(d); toast.success("Rep added"); } catch { toast.error("Couldn't add the rep."); } finally { setSaving(false); } }}
          onUpdate={(id, patch) => void updateRep.mutateAsync({ id, patch })}
        />
      )}
    </div>
  );
}
