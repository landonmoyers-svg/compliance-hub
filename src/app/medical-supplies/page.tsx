"use client";

import { useState, useMemo, useRef } from "react";
import {
  Syringe, Plus, Search, Sparkles, Upload, X, Camera, PackageMinus, History, AlertTriangle,
  CalendarClock, TrendingDown, ShoppingCart, ExternalLink, Copy, ArrowRightLeft, Clock,
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
import { useSort, SortHeader } from "@/components/shared/sortable";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { AdminDeleteButton } from "@/components/shared/admin-delete-button";
import type { MedicalSupply, MedicalSupplyLog, MedicalSupplyLot, WorkLocation } from "@/lib/data/schema";
import { consumableCategories } from "@/lib/data/schema";
import { humanizeLabel } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import {
  supplyStock, transferHint, paceLabel, confidenceNote, trendNote,
  LEGACY_LOT_PREFIX, RUNWAY_CRITICAL_DAYS, type SupplyStock,
} from "@/lib/medical-supplies";
import {
  allocateUse, daysToExpiry, fefoOrder, safeOrderUrl, productSearchUrl, orderOverdue,
  EXPIRY_SOON_DAYS, DEFAULT_LEAD_TIME_DAYS, DEFAULT_TARGET_COVER_DAYS,
  type LotProjection,
} from "@/lib/stock-lots";
import { toast } from "sonner";

const MAX_IMG_MB = 12;
const AI_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const UNITS = ["each", "box", "case", "pair", "roll", "pack", "bag", "bottle"] as const;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const todayInput = () => new Date().toISOString().slice(0, 10);
/** Midday, so a date stored as a timestamp never renders as the previous day. */
const noonIso = (date: string) => new Date(`${date}T12:00:00`).toISOString();
const qtyText = (n: number) => String(Math.round(n * 10) / 10);
const intOk = (v: string) => v.trim() !== "" && !isNaN(parseInt(v, 10)) && parseInt(v, 10) >= 0;
const optIntOk = (v: string) => v.trim() === "" || intOk(v);
const lotName = (l: Pick<MedicalSupplyLot, "lotNumber">) => (l.lotNumber ? `lot ${l.lotNumber}` : "unlabelled lot");
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "vendor site"; } };

/* ------------------------------ item dialog ------------------------------ */

interface SupplyForm {
  name: string; category: MedicalSupply["category"]; unit: string; sku: string;
  locationId: string; room: string; quantityOnHand: string; parLevel: string;
  reorderQuantity: string; lotNumber: string; expirationDate: string; vendor: string; notes: string;
  orderUrl: string; packSize: string; leadTimeDays: string; targetCoverDays: string;
}
function emptyForm(): SupplyForm {
  return {
    name: "", category: "ppe", unit: "box", sku: "", locationId: "", room: "", quantityOnHand: "0", parLevel: "0",
    reorderQuantity: "", lotNumber: "", expirationDate: "", vendor: "", notes: "",
    orderUrl: "", packSize: "", leadTimeDays: "", targetCoverDays: "",
  };
}

function ItemDialog({
  initial, stock, locations, rooms, onClose, onSave, saving,
}: {
  initial?: MedicalSupply;
  stock?: SupplyStock;
  locations: WorkLocation[];
  rooms: string[];
  onClose: () => void;
  onSave: (data: SupplyForm, image: { file: File; capturedAt?: string; lat?: number; lng?: number } | null, ai: { identified: boolean; confidence?: string }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<SupplyForm>(
    initial
      ? {
          name: initial.name, category: initial.category, unit: initial.unit, sku: initial.sku ?? "",
          locationId: initial.locationId ?? "", room: initial.room ?? "", quantityOnHand: String(initial.quantityOnHand ?? 0),
          parLevel: String(initial.parLevel ?? 0), reorderQuantity: initial.reorderQuantity != null ? String(initial.reorderQuantity) : "",
          lotNumber: initial.lotNumber ?? "", expirationDate: (initial.expirationDate ?? "").slice(0, 10), vendor: initial.vendor ?? "", notes: initial.notes ?? "",
          orderUrl: initial.orderUrl ?? "",
          packSize: initial.packSize != null ? String(initial.packSize) : "",
          leadTimeDays: initial.leadTimeDays != null ? String(initial.leadTimeDays) : "",
          targetCoverDays: initial.targetCoverDays != null ? String(initial.targetCoverDays) : "",
        }
      : emptyForm(),
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [exif, setExif] = useState<{ capturedAt?: string; lat?: number; lng?: number }>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiState, setAiState] = useState<{ identified: boolean; confidence?: string }>({ identified: initial?.aiIdentified ?? false, confidence: initial?.aiConfidence ?? undefined });
  const [camOpen, setCamOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof SupplyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleImage(picked: File, override?: CaptureMeta) {
    if (picked.size > MAX_IMG_MB * 1024 * 1024) { toast.error(`Image too large (max ${MAX_IMG_MB}MB).`); return; }
    setAnalyzing(true);
    setAiNote(null);
    const norm = await normalizeImage(picked);
    const lat = override?.lat ?? norm.lat;
    const lng = override?.lng ?? norm.lng;
    const capturedAt = override?.capturedAt ?? norm.capturedAt;
    setFile(norm.file);
    setPreview(URL.createObjectURL(norm.file));
    setExif({ capturedAt, lat, lng });

    const gpsGuess = guessLocation(lat, lng, locations);
    let locNote = "";
    if (gpsGuess) { setForm((p) => ({ ...p, locationId: p.locationId || gpsGuess.location.id })); locNote = ` Location set from photo GPS: “${gpsGuess.location.name}”.`; }

    if (!AI_MIMES.includes(norm.file.type)) {
      setAiNote(`Photo attached${norm.converted ? " (converted to JPG)" : ""}. Fill the details manually.${locNote}`);
      setAnalyzing(false);
      return;
    }
    try {
      const base64 = await fileToBase64(norm.file);
      const res = await fetch("/api/ai/medsupply-identify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: norm.file.type, locationNames: locations.map((l) => l.name) }),
      });
      if (!res.ok) throw new Error("identify failed");
      const r = await res.json() as { name: string; category: string; unit: string; lotNumber: string | null; expirationDate: string | null; suggestedRoom: string | null; suggestedLocationName: string | null; confidence: string };
      const visualMatch = !gpsGuess && r.suggestedLocationName
        ? locations.find((l) => l.name.toLowerCase() === r.suggestedLocationName!.toLowerCase())
        : undefined;
      setForm((p) => ({
        ...p,
        name: r.name || p.name,
        category: (consumableCategories as readonly string[]).includes(r.category) ? (r.category as MedicalSupply["category"]) : p.category,
        unit: (UNITS as readonly string[]).includes(r.unit) ? r.unit : p.unit,
        lotNumber: p.lotNumber || r.lotNumber || "",
        expirationDate: p.expirationDate || r.expirationDate || "",
        room: p.room || r.suggestedRoom || "",
        locationId: gpsGuess ? p.locationId : (visualMatch?.id ?? p.locationId),
      }));
      setAiState({ identified: true, confidence: r.confidence });
      setAiNote(`AI identified this as “${r.name}” (${r.confidence} confidence).${r.lotNumber ? ` Lot ${r.lotNumber}.` : ""}${r.expirationDate ? ` Exp ${r.expirationDate}.` : ""}${locNote}`);
    } catch {
      setAiNote(`Couldn't auto-identify the photo. Enter the details manually — the photo is still attached.${locNote}`);
    } finally {
      setAnalyzing(false);
    }
  }

  const urlBad = form.orderUrl.trim() !== "" && !safeOrderUrl(form.orderUrl);
  const numbersOk = optIntOk(form.parLevel) && optIntOk(form.reorderQuantity) && optIntOk(form.packSize)
    && optIntOk(form.leadTimeDays) && optIntOk(form.targetCoverDays) && (!!initial || intOk(form.quantityOnHand));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit supply" : "Add medical supply"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">Photo {!initial && <span className="text-muted-foreground">— identify with AI (reads lot & expiration)</span>}</label>
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImage(f); e.target.value = ""; }} />
            <CameraCapture open={camOpen} wantGeo onCapture={(f, m) => { setCamOpen(false); void handleImage(f, m); }} onClose={() => setCamOpen(false)} />
            <div className="flex items-start gap-3">
              <div className="size-24 shrink-0 overflow-hidden rounded-lg border border-border">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Preview" className="size-full object-cover" />
                ) : initial?.imageUrl ? (
                  <SignedImage path={initial.imageUrl} alt={initial.name} className="size-full" />
                ) : (
                  <div className="flex size-full items-center justify-center bg-secondary/40 text-muted-foreground"><Syringe className="size-6" /></div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={() => setCamOpen(true)} disabled={analyzing}>
                    {analyzing ? <><Sparkles className="size-4 animate-pulse" /> Analyzing…</> : <><Camera className="size-4" /> Take photo</>}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={analyzing}>
                    <Upload className="size-4" /> Upload
                  </Button>
                </div>
                {aiNote && <p className="rounded-md bg-secondary/40 p-2 text-xs text-muted-foreground">{aiNote}</p>}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Product name *</label>
            <input className="input w-full" value={form.name} onChange={set("name")} placeholder="e.g. Nitrile Exam Gloves, Medium" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <select className="input w-full" value={form.category} onChange={set("category")}>
                {consumableCategories.map((c) => <option key={c} value={c}>{humanizeLabel(c)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Unit</label>
              <input className="input w-full" list="med-units" value={form.unit} onChange={set("unit")} placeholder="box, each, pair…" />
              <datalist id="med-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
            </div>
          </div>

          {initial ? (
            <p className="rounded-md bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
              {stock && stock.plan.onHand > 0
                ? <><span className="font-medium text-foreground">{qtyText(stock.plan.onHand)} {initial.unit}</span> on hand across {stock.lots.filter((l) => l.quantityRemaining > 0).length} {stock.lots.filter((l) => l.quantityRemaining > 0).length === 1 ? "lot" : "lots"}. </>
                : <>No stock on hand. </>}
              Deliveries, use and counts are recorded with <span className="font-medium text-foreground">Record</span> so each lot keeps its own expiry.
            </p>
          ) : (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Stock on the shelf now</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Quantity</label>
                  <input type="number" min={0} className="input w-full" value={form.quantityOnHand} onChange={set("quantityOnHand")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Lot #</label>
                  <input className="input w-full" value={form.lotNumber} onChange={set("lotNumber")} placeholder="optional" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Expires</label>
                  <input type="date" className="input w-full" value={form.expirationDate} onChange={set("expirationDate")} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">If the shelf holds boxes with different expiry dates, enter the soonest here and add the others as deliveries.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Par level</label>
              <input type="number" min={0} className="input w-full" value={form.parLevel} onChange={set("parLevel")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Usual order qty</label>
              <input type="number" min={0} className="input w-full" value={form.reorderQuantity} onChange={set("reorderQuantity")} placeholder="—" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Par is the floor you never want to drop below. Once there’s enough usage recorded, order sizes come from your actual pace; the usual order qty is only used until then.</p>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Location</label>
                <select className="input w-full" value={form.locationId} onChange={set("locationId")}>
                  <option value="">— None —</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Room / cabinet</label>
                <input className="input w-full" list="med-rooms" value={form.room} onChange={set("room")} placeholder="e.g. Supply Closet A" />
                <datalist id="med-rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium"><ShoppingCart className="size-4 text-primary" /> Ordering</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Vendor</label>
                <input className="input w-full" value={form.vendor} onChange={set("vendor")} placeholder="e.g. Henry Schein" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Vendor item # / SKU</label>
                <input className="input w-full font-mono" value={form.sku} onChange={set("sku")} placeholder="optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Order page link</label>
              <input className="input w-full" type="url" inputMode="url" value={form.orderUrl} onChange={set("orderUrl")} placeholder="https://… the page you order this exact item from" />
              {urlBad
                ? <p className="text-xs text-destructive">Paste the full link, starting with https://</p>
                : <p className="text-xs text-muted-foreground">The Order button opens this page.</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Pack size</label>
                <input type="number" min={1} className="input w-full" value={form.packSize} onChange={set("packSize")} placeholder="1" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Days to arrive</label>
                <input type="number" min={0} className="input w-full" value={form.leadTimeDays} onChange={set("leadTimeDays")} placeholder={String(DEFAULT_LEAD_TIME_DAYS)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Days to cover</label>
                <input type="number" min={1} className="input w-full" value={form.targetCoverDays} onChange={set("targetCoverDays")} placeholder={String(DEFAULT_TARGET_COVER_DAYS)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Orders are sized to last from arrival through the days to cover, rounded to whole packs, and never more than you’ll use before it expires.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <textarea className="input w-full" rows={2} value={form.notes} onChange={set("notes")} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSave(form, file ? { file, capturedAt: exif.capturedAt, lat: exif.lat, lng: exif.lng } : null, aiState)}
            disabled={!form.name.trim() || !numbersOk || urlBad || saving || analyzing}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ stock dialog ----------------------------- */

type StockMode = "use" | "receive" | "remove" | "correct";

type StockOp =
  | { kind: "use"; qty: number; occurredAt: string; note: string | null }
  | { kind: "receive"; qty: number; lotNumber: string | null; expirationDate: string | null; occurredAt: string; note: string | null }
  | { kind: "remove"; lotId: string; qty: number; reason: "expired" | "discarded"; occurredAt: string; note: string | null }
  | { kind: "correct"; lotId: string; newCount: number; occurredAt: string; note: string | null };

function StockDialog({ item, stock, preset, onClose, onSave, saving }: {
  item: MedicalSupply;
  stock: SupplyStock;
  preset?: { mode: StockMode; lotId?: string };
  onClose: () => void;
  onSave: (op: StockOp) => void;
  saving: boolean;
}) {
  const active = fefoOrder(stock.lots.filter((l) => l.quantityRemaining > 0));
  const firstExpired = active.find((l) => { const d = daysToExpiry(l); return d !== null && d < 0; });
  const [mode, setMode] = useState<StockMode>(preset?.mode ?? "use");
  const [amount, setAmount] = useState("1");
  const [when, setWhen] = useState(todayInput());
  const [note, setNote] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [lotId, setLotId] = useState(preset?.lotId ?? firstExpired?.id ?? active[0]?.id ?? "");
  const [reason, setReason] = useState<"expired" | "discarded">(() => {
    const l = active.find((x) => x.id === (preset?.lotId ?? firstExpired?.id));
    const d = l ? daysToExpiry(l) : null;
    return d !== null && d < 0 ? "expired" : "discarded";
  });

  const chosen = active.find((l) => l.id === lotId);
  const amt = parseInt(amount, 10);
  const amtOk = !isNaN(amt) && amt >= 0;
  const alloc = mode === "use" && amtOk ? allocateUse(stock.lots, amt) : null;

  const valid =
    mode === "use" ? amtOk && amt > 0 && (alloc?.takes.length ?? 0) > 0
    : mode === "receive" ? amtOk && amt > 0
    : mode === "remove" ? !!chosen && amtOk && amt > 0 && amt <= chosen.quantityRemaining
    : !!chosen && amtOk;

  function pickLot(id: string) {
    setLotId(id);
    const l = active.find((x) => x.id === id);
    if (!l) return;
    if (mode === "remove") {
      setAmount(String(l.quantityRemaining));
      const d = daysToExpiry(l);
      setReason(d !== null && d < 0 ? "expired" : "discarded");
    }
    if (mode === "correct") setAmount(String(l.quantityRemaining));
  }

  function switchMode(m: StockMode) {
    setMode(m);
    if (m === "remove") { const l = chosen ?? firstExpired ?? active[0]; if (l) { setLotId(l.id); setAmount(String(l.quantityRemaining)); } }
    else if (m === "correct") { const l = chosen ?? active[0]; if (l) { setLotId(l.id); setAmount(String(l.quantityRemaining)); } }
    else setAmount("1");
  }

  function submit() {
    const occurredAt = noonIso(when);
    const n = note.trim() || null;
    if (mode === "use") onSave({ kind: "use", qty: amt, occurredAt, note: n });
    else if (mode === "receive") onSave({ kind: "receive", qty: amt, lotNumber: lotNumber.trim() || null, expirationDate: expiry || null, occurredAt, note: n });
    else if (mode === "remove" && chosen) onSave({ kind: "remove", lotId: chosen.id, qty: amt, reason, occurredAt, note: n });
    else if (mode === "correct" && chosen) onSave({ kind: "correct", lotId: chosen.id, newCount: amt, occurredAt, note: n });
  }

  const lotOption = (l: MedicalSupplyLot) => {
    const d = daysToExpiry(l);
    const exp = l.expirationDate ? ` · exp ${formatDate(l.expirationDate)}${d !== null && d < 0 ? " (expired)" : ""}` : "";
    return `${lotName(l)} — ${qtyText(l.quantityRemaining)} ${item.unit}${exp}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold flex items-center gap-2"><PackageMinus className="size-4 text-primary" /> Record</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{item.name}</span> — {qtyText(stock.plan.onHand)} {item.unit} on hand
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["use", "Use / dispense"], ["receive", "Receive delivery"],
              ["remove", "Pull or discard"], ["correct", "Correct a count"],
            ] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => switchMode(m)} disabled={m !== "receive" && active.length === 0}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${mode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
                {label}
              </button>
            ))}
          </div>

          {(mode === "remove" || mode === "correct") && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Which lot</label>
              <select className="input w-full" value={lotId} onChange={(e) => pickLot(e.target.value)}>
                {active.map((l) => <option key={l.id} value={l.id}>{lotOption(l)}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{mode === "correct" ? "Actual count" : "Quantity"}</label>
              <input type="number" min={0} className="input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">When</label>
              <input type="date" className="input w-full" value={when} max={todayInput()} onChange={(e) => setWhen(e.target.value)} />
            </div>
          </div>

          {mode === "use" && alloc && (
            <div className="space-y-2">
              {alloc.takes.length > 0 && (
                <div className="rounded-md bg-secondary/40 px-3 py-2 text-sm">
                  <p className="font-medium">Pull from</p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {alloc.takes.map(({ lot, take }) => (
                      <li key={lot.id}>{qtyText(take)} from {lotName(lot)}{lot.expirationDate ? ` (exp ${formatDate(lot.expirationDate)})` : ""}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">Soonest-expiring stock first, so less of it goes to waste.</p>
                </div>
              )}
              {alloc.skippedExpired.length > 0 && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
                  {alloc.skippedExpired.map(lotName).join(", ")} {alloc.skippedExpired.length === 1 ? "is" : "are"} expired and won’t be used — pull {alloc.skippedExpired.length === 1 ? "it" : "them"} with “Pull or discard”.
                </p>
              )}
              {alloc.shortfall > 0 && (
                <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
                  Only {qtyText(amt - alloc.shortfall)} {item.unit} in date on hand{alloc.takes.length > 0 ? " — that’s what will be recorded" : ""}.
                </p>
              )}
            </div>
          )}

          {mode === "receive" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Lot #</label>
                <input className="input w-full" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="optional" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Expires</label>
                <input type="date" className="input w-full" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </div>
              {(item.pendingOrderQty ?? 0) > 0 && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  {qtyText(item.pendingOrderQty!)} {item.unit} are marked on order — this delivery counts against that.
                </p>
              )}
            </div>
          )}

          {mode === "remove" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason</label>
              <select className="input w-full" value={reason} onChange={(e) => setReason(e.target.value as "expired" | "discarded")}>
                <option value="expired">Expired</option>
                <option value="discarded">Damaged / discarded</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Note <span className="text-muted-foreground">(optional)</span></label>
            <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Back-date entries if you’re catching up — pace is measured against the date, not when it was typed.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ order dialog ----------------------------- */

function OrderDialog({ item, stock, onClose, onSaveLink, onMarkOrdered, onCancelOrder, saving }: {
  item: MedicalSupply;
  stock: SupplyStock;
  onClose: () => void;
  onSaveLink: (url: string) => void;
  onMarkOrdered: (qty: number) => void;
  onCancelOrder: () => void;
  saving: boolean;
}) {
  const rec = stock.order;
  const [qty, setQty] = useState(String(rec.qty && rec.qty > 0 ? rec.qty : item.reorderQuantity ?? ""));
  const [linkDraft, setLinkDraft] = useState("");
  const url = safeOrderUrl(item.orderUrl);
  const draftUrl = safeOrderUrl(linkDraft);
  const overdue = orderOverdue(item.lastOrderedAt);
  const n = parseInt(qty, 10);
  const qtyOk = !isNaN(n) && n > 0;

  async function copySku() {
    try { await navigator.clipboard.writeText(item.sku ?? ""); toast.success("Item # copied"); }
    catch { toast.error("Couldn't copy — select it instead."); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold flex items-center gap-2"><ShoppingCart className="size-4 text-primary" /> Order {item.name}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {(item.pendingOrderQty ?? 0) > 0 && (
            <div className={`flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm ${overdue ? "border border-warning/30 bg-warning/10" : "bg-secondary/40"}`}>
              <p>
                <span className="font-medium">{qtyText(item.pendingOrderQty!)} {item.unit} on order</span>
                {item.lastOrderedAt ? ` since ${formatDate(item.lastOrderedAt)}` : ""}.
                {overdue && <span className="block text-xs">Not received after {overdue} days — worth chasing.</span>}
              </p>
              <button type="button" onClick={onCancelOrder} className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground" disabled={saving}>Cancel order</button>
            </div>
          )}

          <div className="rounded-lg border border-border p-3">
            {rec.qty !== null && rec.qty > 0 ? (
              <p className="text-lg font-semibold">Order {qtyText(rec.qty)} {item.unit}</p>
            ) : rec.qty === 0 ? (
              <p className="text-lg font-semibold">No order needed yet</p>
            ) : (
              <p className="text-base font-semibold">No quantity suggested</p>
            )}
            {rec.reasons.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {rec.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantity to order</label>
              <input type="number" min={1} className="input w-full" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Item #</label>
              {item.sku ? (
                <button type="button" onClick={() => void copySku()} className="input flex w-full items-center justify-between font-mono text-left" title="Copy">
                  <span className="truncate">{item.sku}</span><Copy className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              ) : <p className="py-2 text-sm text-muted-foreground">Not recorded</p>}
            </div>
          </div>

          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Open {item.vendor || hostOf(url)} <ExternalLink className="size-4" />
            </a>
          ) : (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <p className="text-sm">No order page saved for this item yet.</p>
              <a href={productSearchUrl(item.name, item.vendor, item.sku)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Find it online <ExternalLink className="size-3.5" />
              </a>
              <div className="flex gap-2">
                <input className="input w-full" type="url" inputMode="url" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="Paste the product page link" />
                <Button size="sm" variant="outline" disabled={!draftUrl || saving} onClick={() => draftUrl && onSaveLink(draftUrl)}>Save</Button>
              </div>
              {linkDraft.trim() !== "" && !draftUrl && <p className="text-xs text-destructive">Paste the full link, starting with https://</p>}
              <p className="text-xs text-muted-foreground">Once saved, this button goes straight to the product every time.</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
          <Button onClick={() => onMarkOrdered(n)} disabled={!qtyOk || saving}>{saving ? "Saving…" : "Mark as ordered"}</Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ history dialog --------------------------- */

function lotStatusText(p: LotProjection<MedicalSupplyLot>, unit: string): { text: string; tone: "destructive" | "warning" | "outline" } {
  if (p.status === "expired") return { text: "Expired", tone: "destructive" };
  if (p.status === "at_risk") return { text: `~${qtyText(p.projectedWaste ?? 0)} ${unit} will expire unused`, tone: "warning" };
  if (p.status === "soon") return { text: `Expires in ${p.daysToExpiry}d`, tone: "warning" };
  if (p.status === "no_expiry") return { text: "No expiry", tone: "outline" };
  return { text: "In date", tone: "outline" };
}

function HistoryDialog({ item, stock, logs, onClose }: { item: MedicalSupply; stock: SupplyStock; logs: MedicalSupplyLog[]; onClose: () => void }) {
  const rows = logs.filter((l) => l.supplyId === item.id)
    .sort((a, b) => new Date(b.occurredAt ?? b.createdDate).getTime() - new Date(a.occurredAt ?? a.createdDate).getTime());
  const p = stock.pace;
  const depleted = stock.lots.filter((l) => l.quantityRemaining <= 0).length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold flex items-center gap-2"><History className="size-4 text-primary" /> Stock history</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <p className="mb-1 text-sm font-medium">{item.name}</p>
            <p className="rounded-md bg-secondary px-3 py-2 text-sm">
              {p.basis === "measured"
                ? <>Using {paceLabel(p, item.unit)}.<span className="block text-xs text-muted-foreground">{confidenceNote(p)}{trendNote(p) ? ` · ${trendNote(p)}.` : ""}</span></>
                : <span className="text-muted-foreground">{confidenceNote(p)}</span>}
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Lots on hand</p>
            {stock.plan.lots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing on hand.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {stock.plan.lots.map((proj) => {
                  const s = lotStatusText(proj, item.unit);
                  return (
                    <li key={proj.lot.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{lotName(proj.lot)} · {qtyText(proj.lot.quantityRemaining)} {item.unit}</p>
                        <p className="text-xs text-muted-foreground">
                          {proj.lot.expirationDate ? `Expires ${formatDate(proj.lot.expirationDate)}` : "No expiry recorded"}
                          {proj.lot.receivedAt ? ` · received ${formatDate(proj.lot.receivedAt)}` : ""}
                          {proj.startsInDays !== null && proj.startsInDays > 0 ? ` · starts in ~${Math.round(proj.startsInDays)}d` : ""}
                        </p>
                      </div>
                      <Badge variant={s.tone}>{s.text}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
            {depleted > 0 && <p className="mt-1 text-xs text-muted-foreground">{depleted} used-up {depleted === 1 ? "lot" : "lots"} not shown.</p>}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Movements</p>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stock changes logged yet.</p>
            ) : (
              <ol className="space-y-3">
                {rows.map((l) => (
                  <li key={l.id} className="border-l-2 border-border pl-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{humanizeLabel(l.action)}</Badge>
                      <span className={`text-sm font-medium ${l.quantityDelta < 0 ? "text-destructive" : l.quantityDelta > 0 ? "text-success" : ""}`}>
                        {l.quantityDelta > 0 ? "+" : ""}{l.quantityDelta}
                      </span>
                      {l.balanceAfter != null && <span className="text-xs text-muted-foreground">→ {l.balanceAfter} on hand</span>}
                      <span className="ml-auto text-xs text-muted-foreground">{formatDate(l.occurredAt ?? l.createdDate)}</span>
                    </div>
                    {(l.byName || l.note || l.lotNumber) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{[l.byName ? `by ${l.byName}` : "", l.lotNumber ? `lot ${l.lotNumber}` : "", l.note].filter(Boolean).join(" — ")}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- page ---------------------------------- */

interface UseFirstEntry {
  item: MedicalSupply;
  proj: LotProjection<MedicalSupplyLot>;
  rank: number;
  hint: ReturnType<typeof transferHint>;
  estimated: boolean;
}

export default function MedicalSuppliesPage() {
  const { data, isLoading, isError, refetch } = useCollection("medicalSupplies");
  const { data: logData, refetch: refetchLogs } = useCollection("medicalSupplyLogs");
  const { data: lotData, refetch: refetchLots } = useCollection("medicalSupplyLots");
  const { data: locationData } = useCollection("locations");
  const { user } = useAuth();
  const createItem = useCreate("medicalSupplies");
  const updateItem = useUpdate("medicalSupplies");
  const createLog = useCreate("medicalSupplyLogs");
  const createLot = useCreate("medicalSupplyLots");
  const updateLot = useUpdate("medicalSupplyLots");

  const [search, setSearch] = useState("");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [view, setView] = useState<"all" | "reorder" | "use-first" | "expiring">("all");
  const [editing, setEditing] = useState<MedicalSupply | null | "new">(null);
  const [recording, setRecording] = useState<{ item: MedicalSupply; preset?: { mode: StockMode; lotId?: string } } | null>(null);
  const [ordering, setOrdering] = useState<MedicalSupply | null>(null);
  const [historyOf, setHistoryOf] = useState<MedicalSupply | null>(null);
  const [showAllUseFirst, setShowAllUseFirst] = useState(false);
  const [saving, setSaving] = useState(false);

  const items = useMemo(() => data ?? [], [data]);
  const logs = useMemo(() => logData ?? [], [logData]);
  const lots = useMemo(() => lotData ?? [], [lotData]);
  const locations = useMemo(() => (locationData ?? []).filter((l) => l.active !== false), [locationData]);
  const locName = useMemo(() => {
    const m = new Map(locations.map((l) => [l.id, l.name] as const));
    return (id?: string | null) => (id ? m.get(id) ?? "" : "");
  }, [locations]);
  const rooms = useMemo(() => Array.from(new Set(items.map((i) => i.room).filter((r): r is string => !!r))).sort(), [items]);

  /** Everything about each item's stock, computed once: lots, pace, expiry, runway, order. */
  const stockById = useMemo(() => {
    const m = new Map<string, SupplyStock>();
    for (const i of items) m.set(i.id, supplyStock(i, logs, lots));
    return m;
  }, [items, logs, lots]);

  /** Soonest in-stock expiry, for sorting and the "Expiring" view. */
  const soonestDays = (i: MedicalSupply): number | null => {
    const first = stockById.get(i.id)?.plan.lots.find((p) => p.daysToExpiry !== null);
    return first?.daysToExpiry ?? null;
  };

  const useFirst = useMemo<UseFirstEntry[]>(() => {
    const out: UseFirstEntry[] = [];
    for (const item of items) {
      const s = stockById.get(item.id);
      if (!s) continue;
      const expired = s.plan.lots.find((p) => p.status === "expired");
      const atRisk = s.plan.lots.find((p) => p.status === "at_risk");
      const soon = s.plan.basis === "dates_only" ? s.plan.lots.find((p) => p.status === "soon") : undefined;
      const proj = expired ?? atRisk ?? soon;
      if (!proj) continue;
      out.push({
        item, proj,
        rank: expired ? 0 : atRisk ? 1 : 2,
        hint: atRisk ? transferHint(item, s, items, stockById) : null,
        estimated: !!atRisk,
      });
    }
    return out.sort((a, b) => a.rank - b.rank || (a.proj.daysToExpiry ?? 9e9) - (b.proj.daysToExpiry ?? 9e9));
  }, [items, stockById]);
  const useFirstIds = useMemo(() => new Set(useFirst.map((u) => u.item.id)), [useFirst]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => {
      const s = stockById.get(i.id);
      if (filterCategory !== "all" && i.category !== filterCategory) return false;
      if (filterLocation !== "all" && (i.locationId ?? "") !== filterLocation) return false;
      if (view === "reorder" && !s?.order.needed) return false;
      if (view === "use-first" && !useFirstIds.has(i.id)) return false;
      if (view === "expiring") { const d = soonestDays(i); if (d == null || d > EXPIRY_SOON_DAYS) return false; }
      if (q) {
        const hay = [i.name, i.sku, i.vendor, ...(s?.lots.map((l) => l.lotNumber) ?? [])].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // soonestDays reads stockById, which is already a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, stockById, useFirstIds, search, filterCategory, filterLocation, view]);

  const { sorted, sort, toggle } = useSort(filtered, {
    name: (r) => r.name,
    onhand: (r) => stockById.get(r.id)?.plan.onHand ?? 0,
    expiration: (r) => soonestDays(r) ?? 9e9,
  });

  const stats = useMemo(() => {
    const all = items.map((i) => stockById.get(i.id)).filter((s): s is SupplyStock => !!s);
    return {
      total: items.length,
      needsOrder: all.filter((s) => s.order.needed).length,
      runningOut: all.filter((s) => s.runway.status === "critical" || s.runway.status === "out").length,
      useFirst: useFirst.filter((u) => u.rank > 0).length,
      expired: all.filter((s) => s.plan.expiredUnits > 0).length,
    };
  }, [items, stockById, useFirst]);

  const by = user?.fullName ?? null;

  async function refreshStock() {
    await Promise.all([refetch(), refetchLots(), refetchLogs()]);
  }

  async function handleSave(form: SupplyForm, image: { file: File; capturedAt?: string; lat?: number; lng?: number } | null, ai: { identified: boolean; confidence?: string }) {
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (image) {
        try { imageUrl = await uploadFile(image.file, "medical-supplies"); }
        catch { toast.error("Photo upload failed."); setSaving(false); return; }
      }
      const optInt = (v: string) => (v.trim() ? parseInt(v, 10) : null);
      const common = {
        name: form.name.trim(),
        category: form.category,
        unit: form.unit.trim() || "each",
        sku: form.sku.trim() || null,
        locationId: form.locationId || null,
        room: form.room.trim() || null,
        parLevel: parseInt(form.parLevel, 10) || 0,
        reorderQuantity: optInt(form.reorderQuantity),
        vendor: form.vendor.trim() || null,
        notes: form.notes.trim() || null,
        orderUrl: safeOrderUrl(form.orderUrl),
        packSize: optInt(form.packSize),
        leadTimeDays: optInt(form.leadTimeDays),
        targetCoverDays: optInt(form.targetCoverDays),
        aiIdentified: imageUrl ? ai.identified : (editing && editing !== "new" ? editing.aiIdentified : false),
        ...(imageUrl ? { imageUrl, capturedAt: image?.capturedAt ?? null, capturedLat: image?.lat ?? null, capturedLng: image?.lng ?? null, aiConfidence: ai.confidence ?? null } : {}),
      };
      if (editing && editing !== "new") {
        // On-hand, lot and expiry are owned by the lots now — not edited here.
        await updateItem.mutateAsync({ id: editing.id, patch: common });
        toast.success("Supply updated");
      } else {
        const onHand = parseInt(form.quantityOnHand, 10) || 0;
        const created = await createItem.mutateAsync({ ...common, quantityOnHand: 0 });
        if (onHand > 0) {
          const lot = await createLot.mutateAsync({
            supplyId: created.id, lotNumber: form.lotNumber.trim() || null, expirationDate: form.expirationDate || null,
            quantityReceived: onHand, quantityRemaining: onHand, receivedAt: new Date().toISOString(), note: "Initial stock",
          });
          await createLog.mutateAsync({
            supplyId: created.id, action: "received", quantityDelta: onHand, balanceAfter: onHand,
            occurredAt: new Date().toISOString(), lotId: lot.id, lotNumber: lot.lotNumber ?? null, byName: by, note: "Initial stock",
          });
        }
        toast.success("Supply added");
      }
      setEditing(null);
      await refreshStock();
    } catch {
      toast.error("Failed to save supply");
    } finally {
      setSaving(false);
    }
  }

  async function applyOp(item: MedicalSupply, op: StockOp) {
    const stock = stockById.get(item.id);
    if (!stock) return;
    setSaving(true);
    try {
      let work = stock.lots.map((l) => ({ ...l }));
      // Stock from before lot tracking must become a real lot BEFORE any other lot
      // write — the on-hand trigger recomputes from lot rows, so a new lot written
      // first would silently drop it.
      const legacy = work.find((l) => l.id.startsWith(LEGACY_LOT_PREFIX));
      let legacyRealId: string | null = null;
      if (legacy) {
        const created = await createLot.mutateAsync({
          supplyId: item.id, lotNumber: legacy.lotNumber ?? null, expirationDate: legacy.expirationDate ?? null,
          quantityReceived: legacy.quantityRemaining, quantityRemaining: legacy.quantityRemaining,
          receivedAt: legacy.receivedAt ?? null, note: "Stock on hand before lot tracking",
        });
        legacyRealId = created.id;
        work = work.map((l) => (l.id === legacy.id ? { ...l, id: created.id } : l));
      }
      const resolve = (id: string) => (legacy && id === legacy.id && legacyRealId ? legacyRealId : id);
      let balance = work.reduce((s, l) => s + l.quantityRemaining, 0);
      const log = (entry: Omit<MedicalSupplyLog, "id" | "createdDate" | "supplyId" | "byName" | "balanceAfter" | "occurredAt" | "note">) =>
        createLog.mutateAsync({ supplyId: item.id, byName: by, balanceAfter: balance, occurredAt: op.occurredAt, note: op.note, ...entry });

      if (op.kind === "use") {
        const alloc = allocateUse(work, op.qty);
        for (const { lot, take } of alloc.takes) {
          await updateLot.mutateAsync({ id: lot.id, patch: { quantityRemaining: lot.quantityRemaining - take } });
          balance -= take;
          await log({ action: "used", quantityDelta: -take, lotId: lot.id, lotNumber: lot.lotNumber ?? null });
        }
        toast.success(alloc.shortfall > 0 ? `Recorded ${op.qty - alloc.shortfall} — that’s all the in-date stock` : "Use recorded");
      } else if (op.kind === "receive") {
        const lot = await createLot.mutateAsync({
          supplyId: item.id, lotNumber: op.lotNumber, expirationDate: op.expirationDate,
          quantityReceived: op.qty, quantityRemaining: op.qty, receivedAt: op.occurredAt, note: op.note,
        });
        balance += op.qty;
        await log({ action: "received", quantityDelta: op.qty, lotId: lot.id, lotNumber: op.lotNumber });
        const pending = item.pendingOrderQty ?? 0;
        if (pending > 0) {
          const left = Math.max(0, pending - op.qty);
          await updateItem.mutateAsync({ id: item.id, patch: left > 0 ? { pendingOrderQty: left } : { pendingOrderQty: null, lastOrderedAt: null } });
        }
        toast.success("Delivery recorded");
      } else if (op.kind === "remove") {
        const lot = work.find((l) => l.id === resolve(op.lotId));
        if (!lot) throw new Error("lot not found");
        const take = Math.min(op.qty, lot.quantityRemaining);
        await updateLot.mutateAsync({ id: lot.id, patch: { quantityRemaining: lot.quantityRemaining - take } });
        balance -= take;
        await log({ action: op.reason, quantityDelta: -take, lotId: lot.id, lotNumber: lot.lotNumber ?? null });
        toast.success(op.reason === "expired" ? "Expired stock pulled" : "Discard recorded");
      } else {
        const lot = work.find((l) => l.id === resolve(op.lotId));
        if (!lot) throw new Error("lot not found");
        const delta = op.newCount - lot.quantityRemaining;
        await updateLot.mutateAsync({ id: lot.id, patch: { quantityRemaining: op.newCount } });
        balance += delta;
        await log({ action: "adjusted", quantityDelta: delta, lotId: lot.id, lotNumber: lot.lotNumber ?? null });
        toast.success("Count corrected");
      }
      setRecording(null);
      await refreshStock();
    } catch {
      toast.error("Couldn't record that — nothing further was changed.");
      await refreshStock();
    } finally {
      setSaving(false);
    }
  }

  async function patchOrder(item: MedicalSupply, patch: Partial<MedicalSupply>, message: string, close = false) {
    setSaving(true);
    try {
      await updateItem.mutateAsync({ id: item.id, patch });
      toast.success(message);
      await refetch();
      if (close) setOrdering(null);
      else setOrdering((cur) => (cur && cur.id === item.id ? { ...cur, ...patch } : cur));
    } catch {
      toast.error("Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Medical Supplies" />
        <ErrorState message="We couldn't load medical supplies." onRetry={() => void refetch()} />
      </div>
    );
  }

  const recordingStock = recording ? stockById.get(recording.item.id) : undefined;
  const orderingStock = ordering ? stockById.get(ordering.id) : undefined;
  const visibleUseFirst = showAllUseFirst ? useFirst : useFirst.slice(0, 4);

  return (
    <div className="space-y-6">
      {editing && (
        <ItemDialog initial={editing === "new" ? undefined : editing} stock={editing === "new" ? undefined : stockById.get(editing.id)}
          locations={locations} rooms={rooms} onClose={() => setEditing(null)} onSave={handleSave} saving={saving} />
      )}
      {recording && recordingStock && (
        <StockDialog item={recording.item} stock={recordingStock} preset={recording.preset}
          onClose={() => setRecording(null)} onSave={(op) => void applyOp(recording.item, op)} saving={saving} />
      )}
      {ordering && orderingStock && (
        <OrderDialog
          item={ordering} stock={orderingStock} saving={saving}
          onClose={() => setOrdering(null)}
          onSaveLink={(url) => void patchOrder(ordering, { orderUrl: url }, "Order link saved")}
          onMarkOrdered={(qty) => void patchOrder(ordering, { lastOrderedAt: new Date().toISOString(), pendingOrderQty: (ordering.pendingOrderQty ?? 0) + qty }, "Marked as ordered", true)}
          onCancelOrder={() => void patchOrder(ordering, { lastOrderedAt: null, pendingOrderQty: null }, "Order cleared")}
        />
      )}
      {historyOf && stockById.get(historyOf.id) && (
        <HistoryDialog item={historyOf} stock={stockById.get(historyOf.id)!} logs={logs} onClose={() => setHistoryOf(null)} />
      )}

      <PageHeader
        title="Medical Supplies"
        description="Consumable clinical supplies. Each delivery keeps its own lot and expiry, use draws the soonest-expiring first, and order sizes come from how fast you actually go through them."
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add supply</Button>}
      />

      <div className="grid auto-rows-min grid-cols-2 content-start gap-4 lg:grid-cols-5">
        <StatCard label="Products" value={stats.total} icon={Syringe} loading={isLoading} />
        <StatCard label="Needs ordering" value={stats.needsOrder} icon={ShoppingCart} tone={stats.needsOrder ? "warning" : "success"} loading={isLoading} />
        <StatCard label={`Out within ${RUNWAY_CRITICAL_DAYS} days`} value={stats.runningOut} icon={TrendingDown} tone={stats.runningOut ? "destructive" : "default"} loading={isLoading} />
        <StatCard label="Use before it expires" value={stats.useFirst} icon={Clock} tone={stats.useFirst ? "warning" : "default"} loading={isLoading} />
        <StatCard label="Expired on the shelf" value={stats.expired} icon={CalendarClock} tone={stats.expired ? "destructive" : "default"} loading={isLoading} />
      </div>

      {!isLoading && useFirst.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-warning" /> Use first</p>
            <p className="text-sm text-muted-foreground">Soonest first. Estimates use your current pace.</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {visibleUseFirst.map(({ item, proj, rank, hint }) => {
                const lot = proj.lot;
                const site = locName(item.locationId);
                return (
                  <li key={`${item.id}-${lot.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{item.name}{site ? <span className="font-normal text-muted-foreground"> · {site}</span> : null}</p>
                      <p className="text-muted-foreground">
                        {rank === 0 && <>Pull {lotName(lot)} — expired {formatDate(lot.expirationDate!)}. {qtyText(lot.quantityRemaining)} {item.unit} can’t be used.</>}
                        {rank === 1 && <>Use {lotName(lot)} first — about {qtyText(proj.projectedWaste ?? 0)} of {qtyText(lot.quantityRemaining)} {item.unit} will expire unused by {formatDate(lot.expirationDate!)}.</>}
                        {rank === 2 && <>{humanizeLabel(lotName(lot))} expires {formatDate(lot.expirationDate!)} ({proj.daysToExpiry}d). No usage recorded yet, so possible waste can’t be estimated — use it first.</>}
                      </p>
                      {hint && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-primary">
                          <ArrowRightLeft className="size-3.5" />
                          {locName(hint.other.locationId) || "Another site"} {hint.ratio ? `goes through this about ${Math.round(hint.ratio * 10) / 10}× faster` : "is using this and it isn’t being used here"} — consider moving some there.
                        </p>
                      )}
                    </div>
                    <Button size="sm" variant={rank === 0 ? "default" : "outline"} className="shrink-0"
                      onClick={() => setRecording({ item, preset: rank === 0 ? { mode: "remove", lotId: lot.id } : { mode: "use" } })}>
                      {rank === 0 ? "Pull it" : "Record use"}
                    </Button>
                  </li>
                );
              })}
            </ul>
            {useFirst.length > 4 && (
              <button type="button" onClick={() => setShowAllUseFirst((v) => !v)} className="mt-2 text-sm font-medium text-primary hover:underline">
                {showAllUseFirst ? "Show fewer" : `Show all ${useFirst.length}`}
              </button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-full pl-9" placeholder="Search name, item #, vendor, lot…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search medical supplies" />
            </div>
            {locations.length > 0 && (
              <select className="input h-9 py-0" value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} aria-label="Filter by location">
                <option value="all">All locations</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <select className="input h-9 py-0" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>
              {consumableCategories.map((c) => <option key={c} value={c}>{humanizeLabel(c)}</option>)}
            </select>
            <div className="flex flex-wrap gap-1">
              {(["all", "reorder", "use-first", "expiring"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${view === v ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
                  {v === "all" ? "All" : v === "reorder" ? "To order" : v === "use-first" ? "Use first" : "Expiring"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Syringe}
              title={view === "reorder" ? "Nothing to order" : view === "use-first" ? "Nothing at risk of expiring" : view === "expiring" ? "Nothing expiring soon" : "No medical supplies"}
              description={view !== "all" ? "You're all set for this view." : (search || filterCategory !== "all" || filterLocation !== "all" ? "Try adjusting your search or filters." : "Add your first supply — snap a photo and AI will read the lot & expiration.")}
              action={view === "all" ? <Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add supply</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Supply" sortKey="name" sort={sort} onToggle={toggle} />
                    <SortHeader label="On hand" sortKey="onhand" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Pace</th>
                    <th className="pb-2 font-medium">Runway</th>
                    <SortHeader label="Expiry" sortKey="expiration" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Location</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((i) => {
                    const s = stockById.get(i.id)!;
                    const rw = s.runway;
                    const daysLeft = rw.daysLeft != null ? Math.floor(rw.daysLeft) : null;
                    const activeLots = s.plan.lots.length;
                    const firstDated = s.plan.lots.find((p) => p.daysToExpiry !== null);
                    const pending = i.pendingOrderQty ?? 0;
                    const overdue = pending > 0 ? orderOverdue(i.lastOrderedAt) : null;
                    const unusable = s.plan.onHand - s.plan.usableOnHand;
                    return (
                      <tr key={i.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Supply" className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="size-9 shrink-0 overflow-hidden rounded border border-border">
                              {i.imageUrl ? <SignedImage path={i.imageUrl} alt={i.name} className="size-full" /> : <div className="flex size-full items-center justify-center bg-secondary/40 text-muted-foreground"><Syringe className="size-4" /></div>}
                            </div>
                            <div>
                              <p><button type="button" onClick={() => setEditing(i)} className="text-left font-medium text-primary hover:underline">{i.name}</button></p>
                              <p className="text-[11px] text-muted-foreground">{[humanizeLabel(i.category), i.vendor, i.sku ? `#${i.sku}` : ""].filter(Boolean).join(" · ")}</p>
                            </div>
                          </div>
                        </td>
                        <td data-label="On hand" className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{qtyText(s.plan.onHand)}</span>
                            <span className="text-xs text-muted-foreground">{i.unit}{i.parLevel > 0 ? ` · par ${i.parLevel}` : ""}</span>
                            {s.plan.onHand <= 0 ? <Badge variant="destructive">Out</Badge> : rw.belowPar ? <Badge variant="warning">Low</Badge> : null}
                          </div>
                          {activeLots > 1 && <p className="text-xs text-muted-foreground">{activeLots} lots</p>}
                          {unusable >= 1 && <p className="text-xs text-warning">{qtyText(s.plan.usableOnHand)} usable before expiry</p>}
                        </td>
                        <td data-label="Pace" className="py-3 pr-4">
                          <span className="text-muted-foreground">{paceLabel(s.pace, i.unit)}</span>
                          {s.pace.basis === "measured" && (
                            <span className="block text-xs text-muted-foreground/80">
                              {s.pace.confidence === "strong" ? "settled" : s.pace.confidence === "good" ? "tightening" : "early estimate"}
                              {trendNote(s.pace) ? ` · ${trendNote(s.pace)!.toLowerCase()}` : ""}
                            </span>
                          )}
                        </td>
                        <td data-label="Runway" className="py-3 pr-4">
                          {rw.status === "out" ? <Badge variant="destructive">{s.plan.onHand > 0 ? "Nothing usable" : "Out of stock"}</Badge>
                            : rw.status === "unknown" || daysLeft == null ? <span className="text-muted-foreground">—</span>
                            : <div className="flex flex-col gap-0.5">
                                <Badge variant={rw.status === "critical" ? "destructive" : rw.status === "watch" ? "warning" : "success"}>
                                  {daysLeft <= 0 ? "Out now" : daysLeft === 1 ? "1 day left" : `${daysLeft} days left`}
                                </Badge>
                                {rw.runsOutOn && <span className="text-xs text-muted-foreground">~{formatDate(rw.runsOutOn.toISOString())}</span>}
                              </div>}
                          {pending > 0 && (
                            <p className={`mt-1 text-xs ${overdue ? "text-warning" : "text-muted-foreground"}`}>
                              {qtyText(pending)} on order{overdue ? ` · ${overdue}d, not received` : ""}
                            </p>
                          )}
                        </td>
                        <td data-label="Expiry" className="py-3 pr-4">
                          {s.plan.expiredUnits > 0 ? (
                            <span className="text-destructive">{qtyText(s.plan.expiredUnits)} {i.unit} expired</span>
                          ) : (s.plan.projectedWaste ?? 0) >= 1 ? (
                            <span className="text-warning">~{qtyText(s.plan.projectedWaste!)} will expire unused</span>
                          ) : firstDated ? (
                            <span className={firstDated.daysToExpiry! <= EXPIRY_SOON_DAYS ? "text-warning" : "text-muted-foreground"}>
                              {formatDate(firstDated.lot.expirationDate!)}{firstDated.daysToExpiry! <= EXPIRY_SOON_DAYS ? ` · ${firstDated.daysToExpiry}d` : ""}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td data-label="Location" className="py-3 pr-4 text-muted-foreground">{[locName(i.locationId), i.room].filter(Boolean).join(" · ") || "—"}</td>
                        <td data-label="" className="py-3">
                          <div className="flex items-center gap-1 md:justify-end">
                            <Button size="sm" variant="ghost" title="Record use, delivery or count" onClick={() => setRecording({ item: i })}><PackageMinus className="size-4" /></Button>
                            <Button size="sm" variant={s.order.needed ? "default" : "ghost"} title="Order" onClick={() => setOrdering(i)}>
                              <ShoppingCart className="size-4" />{s.order.needed ? " Order" : ""}
                            </Button>
                            <Button size="sm" variant="ghost" title="Lots & history" onClick={() => setHistoryOf(i)}><History className="size-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>Edit</Button>
                            <AdminDeleteButton collection="medicalSupplies" id={i.id} label={i.name} noun="supply" onDeleted={() => void refetch()} />
                          </div>
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
    </div>
  );
}
