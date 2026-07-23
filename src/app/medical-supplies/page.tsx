"use client";

import { useState, useMemo, useRef } from "react";
import { Syringe, Plus, Search, Sparkles, Upload, X, Camera, PackagePlus, PackageMinus, History, AlertTriangle, CalendarClock } from "lucide-react";
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
import type { MedicalSupply, MedicalSupplyLog, WorkLocation } from "@/lib/data/schema";
import { consumableCategories } from "@/lib/data/schema";
import { humanizeLabel } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { toast } from "sonner";

const MAX_IMG_MB = 12;
const AI_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const UNITS = ["each", "box", "case", "pair", "roll", "pack", "bag", "bottle"] as const;
const EXPIRY_SOON_DAYS = 45;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function daysUntil(date?: string | null): number | null {
  if (!date) return null;
  const t = new Date(date.length <= 10 ? date + "T00:00:00" : date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / 86_400_000);
}
type StockLevel = "out" | "low" | "ok";
function stockLevel(i: MedicalSupply): StockLevel {
  if (i.quantityOnHand <= 0) return "out";
  if (i.parLevel > 0 && i.quantityOnHand <= i.parLevel) return "low";
  return "ok";
}

/* ------------------------------ item dialog ------------------------------ */

interface SupplyForm {
  name: string; category: MedicalSupply["category"]; unit: string; sku: string;
  locationId: string; room: string; quantityOnHand: string; parLevel: string;
  reorderQuantity: string; lotNumber: string; expirationDate: string; vendor: string; notes: string;
}
function emptyForm(): SupplyForm {
  return { name: "", category: "ppe", unit: "box", sku: "", locationId: "", room: "", quantityOnHand: "0", parLevel: "0", reorderQuantity: "", lotNumber: "", expirationDate: "", vendor: "", notes: "" };
}

function ItemDialog({
  initial, locations, rooms, onClose, onSave, saving,
}: {
  initial?: MedicalSupply;
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
          lotNumber: initial.lotNumber ?? "", expirationDate: initial.expirationDate ?? "", vendor: initial.vendor ?? "", notes: initial.notes ?? "",
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

  const numOk = (v: string) => v === "" || (!isNaN(parseInt(v, 10)) && parseInt(v, 10) >= 0);

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

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">On hand</label>
              <input type="number" min={0} className="input w-full" value={form.quantityOnHand} onChange={set("quantityOnHand")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Par level</label>
              <input type="number" min={0} className="input w-full" value={form.parLevel} onChange={set("parLevel")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reorder qty</label>
              <input type="number" min={0} className="input w-full" value={form.reorderQuantity} onChange={set("reorderQuantity")} placeholder="—" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Par level is the minimum on-hand before you reorder. Items at or below par are flagged “Low”.</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Lot # <span className="text-muted-foreground">(optional)</span></label>
              <input className="input w-full" value={form.lotNumber} onChange={set("lotNumber")} placeholder="Lot / batch" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Expiration <span className="text-muted-foreground">(optional)</span></label>
              <input type="date" className="input w-full" value={form.expirationDate} onChange={set("expirationDate")} />
            </div>
          </div>

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
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Vendor <span className="text-muted-foreground">(optional)</span></label>
              <input className="input w-full" value={form.vendor} onChange={set("vendor")} placeholder="Supplier / distributor" />
            </div>
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
            disabled={!form.name.trim() || !numOk(form.quantityOnHand) || !numOk(form.parLevel) || saving || analyzing}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ count dialog ----------------------------- */

function CountDialog({ item, byName, onClose, onSave, saving }: {
  item: MedicalSupply;
  byName: string;
  onClose: () => void;
  onSave: (patch: Partial<MedicalSupply>, log: Omit<MedicalSupplyLog, "id" | "createdDate">) => void;
  saving: boolean;
}) {
  const [action, setAction] = useState<MedicalSupplyLog["action"]>("used");
  const [amount, setAmount] = useState("1");
  const [lot, setLot] = useState(item.lotNumber ?? "");
  const [note, setNote] = useState("");

  const amt = parseInt(amount, 10);
  const amtOk = !isNaN(amt) && amt >= 0;
  const isSet = action === "adjusted"; // "adjusted" sets a new absolute count
  const balanceAfter = isSet ? amt : action === "received" ? item.quantityOnHand + amt : Math.max(0, item.quantityOnHand - amt);
  const delta = balanceAfter - item.quantityOnHand;

  function submit() {
    const patch: Partial<MedicalSupply> = { quantityOnHand: balanceAfter };
    if (action === "received" && lot.trim() && lot.trim() !== (item.lotNumber ?? "")) patch.lotNumber = lot.trim();
    onSave(patch, {
      supplyId: item.id, action, quantityDelta: delta, balanceAfter,
      lotNumber: lot.trim() || null, byName: byName || null, note: note.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold flex items-center gap-2"><PackagePlus className="size-4 text-primary" /> Update count</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{item.name}</span> — on hand: <span className="font-medium text-foreground">{item.quantityOnHand} {item.unit}</span>
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Action</label>
              <select className="input w-full" value={action} onChange={(e) => setAction(e.target.value as MedicalSupplyLog["action"])}>
                <option value="received">Receive stock (+)</option>
                <option value="used">Use / dispense (−)</option>
                <option value="discarded">Discard / expired (−)</option>
                <option value="adjusted">Set exact count</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{isSet ? "New count" : "Amount"}</label>
              <input type="number" min={0} className="input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </div>
          </div>
          <p className="rounded-md bg-secondary/40 px-3 py-2 text-sm">New on-hand: <span className="font-semibold">{amtOk ? balanceAfter : "—"} {item.unit}</span></p>
          {action === "received" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Lot # <span className="text-muted-foreground">(of received stock)</span></label>
              <input className="input w-full" value={lot} onChange={(e) => setLot(e.target.value)} placeholder="Lot / batch" />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Note <span className="text-muted-foreground">(optional)</span></label>
            <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!amtOk || saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ history dialog --------------------------- */

function HistoryDialog({ item, logs, onClose }: { item: MedicalSupply; logs: MedicalSupplyLog[]; onClose: () => void }) {
  const rows = logs.filter((l) => l.supplyId === item.id).sort((a, b) => (a.createdDate < b.createdDate ? 1 : -1));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold flex items-center gap-2"><History className="size-4 text-primary" /> Stock history</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          <p className="mb-3 text-sm font-medium">{item.name}</p>
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
                    <span className="ml-auto text-xs text-muted-foreground">{formatDate(l.createdDate)}</span>
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
  );
}

/* --------------------------------- page ---------------------------------- */

export default function MedicalSuppliesPage() {
  const { data, isLoading, isError, refetch } = useCollection("medicalSupplies");
  const { data: logData, refetch: refetchLogs } = useCollection("medicalSupplyLogs");
  const { data: locationData } = useCollection("locations");
  const { user } = useAuth();
  const createItem = useCreate("medicalSupplies");
  const updateItem = useUpdate("medicalSupplies");
  const createLog = useCreate("medicalSupplyLogs");

  const [search, setSearch] = useState("");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [view, setView] = useState<"all" | "reorder" | "expiring">("all");
  const [editing, setEditing] = useState<MedicalSupply | null | "new">(null);
  const [counting, setCounting] = useState<MedicalSupply | null>(null);
  const [historyOf, setHistoryOf] = useState<MedicalSupply | null>(null);
  const [saving, setSaving] = useState(false);

  const items = useMemo(() => data ?? [], [data]);
  const logs = useMemo(() => logData ?? [], [logData]);
  const locations = useMemo(() => (locationData ?? []).filter((l) => l.active !== false), [locationData]);
  const locName = useMemo(() => {
    const m = new Map(locations.map((l) => [l.id, l.name] as const));
    return (id?: string | null) => (id ? m.get(id) ?? "" : "");
  }, [locations]);
  const rooms = useMemo(() => Array.from(new Set(items.map((i) => i.room).filter((r): r is string => !!r))).sort(), [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => {
      if (filterCategory !== "all" && i.category !== filterCategory) return false;
      if (filterLocation !== "all" && (i.locationId ?? "") !== filterLocation) return false;
      if (view === "reorder" && stockLevel(i) === "ok") return false;
      if (view === "expiring") { const d = daysUntil(i.expirationDate); if (d == null || d > EXPIRY_SOON_DAYS) return false; }
      if (q && !i.name.toLowerCase().includes(q) && !(i.sku ?? "").toLowerCase().includes(q) && !(i.lotNumber ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, filterCategory, filterLocation, view]);

  const { sorted, sort, toggle } = useSort(filtered, {
    name: (r) => r.name,
    category: (r) => r.category,
    onhand: (r) => r.quantityOnHand,
    expiration: (r) => r.expirationDate ?? "9999",
  });

  const stats = useMemo(() => ({
    total: items.length,
    low: items.filter((i) => stockLevel(i) !== "ok").length,
    expiring: items.filter((i) => { const d = daysUntil(i.expirationDate); return d != null && d >= 0 && d <= EXPIRY_SOON_DAYS; }).length,
    expired: items.filter((i) => { const d = daysUntil(i.expirationDate); return d != null && d < 0; }).length,
  }), [items]);

  async function handleSave(form: SupplyForm, image: { file: File; capturedAt?: string; lat?: number; lng?: number } | null, ai: { identified: boolean; confidence?: string }) {
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (image) {
        try { imageUrl = await uploadFile(image.file, "medical-supplies"); }
        catch { toast.error("Photo upload failed."); setSaving(false); return; }
      }
      const onHand = parseInt(form.quantityOnHand, 10) || 0;
      const payload = {
        name: form.name.trim(),
        category: form.category,
        unit: form.unit.trim() || "each",
        sku: form.sku.trim() || null,
        locationId: form.locationId || null,
        room: form.room.trim() || null,
        quantityOnHand: onHand,
        parLevel: parseInt(form.parLevel, 10) || 0,
        reorderQuantity: form.reorderQuantity.trim() ? parseInt(form.reorderQuantity, 10) : null,
        lotNumber: form.lotNumber.trim() || null,
        expirationDate: form.expirationDate || null,
        vendor: form.vendor.trim() || null,
        notes: form.notes.trim() || null,
        aiIdentified: imageUrl ? ai.identified : (editing && editing !== "new" ? editing.aiIdentified : false),
        ...(imageUrl ? { imageUrl, capturedAt: image?.capturedAt ?? null, capturedLat: image?.lat ?? null, capturedLng: image?.lng ?? null, aiConfidence: ai.confidence ?? null } : {}),
      };
      if (editing && editing !== "new") {
        await updateItem.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Supply updated");
      } else {
        const created = await createItem.mutateAsync(payload);
        if (onHand > 0) await createLog.mutateAsync({ supplyId: created.id, action: "received", quantityDelta: onHand, balanceAfter: onHand, lotNumber: form.lotNumber.trim() || null, byName: user?.fullName ?? null, note: "Initial stock" });
        toast.success("Supply added");
      }
      setEditing(null);
      void refetchLogs();
    } catch {
      toast.error("Failed to save supply");
    } finally {
      setSaving(false);
    }
  }

  async function handleCount(patch: Partial<MedicalSupply>, log: Omit<MedicalSupplyLog, "id" | "createdDate">) {
    if (!counting) return;
    setSaving(true);
    try {
      await updateItem.mutateAsync({ id: counting.id, patch });
      await createLog.mutateAsync(log);
      toast.success("Count updated");
      setCounting(null);
      void refetchLogs();
    } catch {
      toast.error("Failed to update count");
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

  return (
    <div className="space-y-6">
      {editing && (
        <ItemDialog initial={editing === "new" ? undefined : editing} locations={locations} rooms={rooms} onClose={() => setEditing(null)} onSave={handleSave} saving={saving} />
      )}
      {counting && (
        <CountDialog item={counting} byName={user?.fullName ?? ""} onClose={() => setCounting(null)} onSave={handleCount} saving={saving} />
      )}
      {historyOf && (
        <HistoryDialog item={historyOf} logs={logs} onClose={() => setHistoryOf(null)} />
      )}

      <PageHeader
        title="Medical Supplies"
        description="Consumable clinical supplies (gloves, syringes, gauze…). Track on-hand counts against par levels, with lot & expiration and a full usage/restock log."
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add supply</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Products" value={stats.total} icon={Syringe} loading={isLoading} />
        <StatCard label="At/below par" value={stats.low} icon={AlertTriangle} tone={stats.low ? "warning" : "success"} loading={isLoading} />
        <StatCard label={`Expiring ≤${EXPIRY_SOON_DAYS}d`} value={stats.expiring} icon={CalendarClock} tone={stats.expiring ? "warning" : "default"} loading={isLoading} />
        <StatCard label="Expired" value={stats.expired} icon={CalendarClock} tone={stats.expired ? "destructive" : "default"} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-full pl-9" placeholder="Search name, SKU, lot…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search medical supplies" />
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
            <div className="flex gap-1">
              {(["all", "reorder", "expiring"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${view === v ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
                  {v === "all" ? "All" : v === "reorder" ? "Reorder list" : "Expiring"}
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
              title={view === "reorder" ? "Nothing to reorder" : view === "expiring" ? "Nothing expiring soon" : "No medical supplies"}
              description={view !== "all" ? "You're all set for this view." : (search || filterCategory !== "all" || filterLocation !== "all" ? "Try adjusting your search or filters." : "Add your first supply — snap a photo and AI will read the lot & expiration.")}
              action={view === "all" ? <Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add supply</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Supply</th>
                    <SortHeader label="Category" sortKey="category" sort={sort} onToggle={toggle} />
                    <SortHeader label="On hand" sortKey="onhand" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Location</th>
                    <SortHeader label="Expiration" sortKey="expiration" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((i) => {
                    const lvl = stockLevel(i);
                    const d = daysUntil(i.expirationDate);
                    return (
                      <tr key={i.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Supply" className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="size-9 shrink-0 overflow-hidden rounded border border-border">
                              {i.imageUrl ? <SignedImage path={i.imageUrl} alt={i.name} className="size-full" /> : <div className="flex size-full items-center justify-center bg-secondary/40 text-muted-foreground"><Syringe className="size-4" /></div>}
                            </div>
                            <div>
                              <p className="font-medium">{i.name}</p>
                              {(i.sku || i.lotNumber) && <p className="font-mono text-[11px] text-muted-foreground">{[i.sku, i.lotNumber ? `lot ${i.lotNumber}` : ""].filter(Boolean).join(" · ")}</p>}
                            </div>
                          </div>
                        </td>
                        <td data-label="Category" className="py-3 pr-4 text-muted-foreground">{humanizeLabel(i.category)}</td>
                        <td data-label="On hand" className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{i.quantityOnHand}</span>
                            <span className="text-xs text-muted-foreground">{i.unit}{i.parLevel > 0 ? ` · par ${i.parLevel}` : ""}</span>
                            {lvl === "out" ? <Badge variant="destructive">Out</Badge> : lvl === "low" ? <Badge variant="warning">Low</Badge> : null}
                          </div>
                        </td>
                        <td data-label="Location" className="py-3 pr-4 text-muted-foreground">{[locName(i.locationId), i.room].filter(Boolean).join(" · ") || "—"}</td>
                        <td data-label="Expiration" className="py-3 pr-4">
                          {i.expirationDate ? (
                            <span className={d != null && d < 0 ? "text-destructive" : d != null && d <= EXPIRY_SOON_DAYS ? "text-warning" : "text-muted-foreground"}>
                              {formatDate(i.expirationDate)}{d != null && d < 0 ? " · expired" : d != null && d <= EXPIRY_SOON_DAYS ? ` · ${d}d` : ""}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td data-label="" className="py-3">
                          <div className="flex items-center gap-1 md:justify-end">
                            <Button size="sm" variant="ghost" title="Update count" onClick={() => setCounting(i)}><PackageMinus className="size-4" /></Button>
                            <Button size="sm" variant="ghost" title="Stock history" onClick={() => setHistoryOf(i)}><History className="size-4" /></Button>
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
