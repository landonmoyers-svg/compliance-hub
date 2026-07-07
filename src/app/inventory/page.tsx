"use client";

import { useState, useMemo, useRef } from "react";
import { Package, Plus, Search, Sparkles, MessageSquare, Send, Upload, X, MapPin } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { uploadFile } from "@/lib/storage";
import { normalizeImage } from "@/lib/images";
import { guessLocation } from "@/lib/geo";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SignedImage } from "@/components/shared/signed-image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import type { InventoryItem, WorkLocation } from "@/lib/data/schema";
import { toast } from "sonner";

const MAX_IMG_MB = 12;
const AI_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const STATUS_VARIANT = { active: "success", broken: "destructive", removed: "secondary" } as const;
const CONDITION_VARIANT = { new: "success", good: "success", fair: "warning", poor: "destructive" } as const;

function usd(cents?: number | null): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ----------------------------- item dialog ------------------------------- */

interface ItemForm {
  itemName: string;
  itemType: string;
  status: InventoryItem["status"];
  condition: InventoryItem["condition"];
  locationId: string;
  sublocation: string;
  quantity: string;
  estimatedValue: string; // dollars
  description: string;
}

function emptyForm(): ItemForm {
  return { itemName: "", itemType: "equipment", status: "active", condition: "good", locationId: "", sublocation: "", quantity: "1", estimatedValue: "", description: "" };
}

function ItemDialog({
  initial,
  locations,
  onClose,
  onSave,
  saving,
}: {
  initial?: InventoryItem;
  locations: WorkLocation[];
  onClose: () => void;
  onSave: (data: ItemForm, image: { file: File; capturedAt?: string; lat?: number; lng?: number } | null, ai: { identified: boolean; confidence?: string }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ItemForm>(
    initial
      ? {
          itemName: initial.itemName,
          itemType: initial.itemType,
          status: initial.status,
          condition: initial.condition,
          locationId: initial.locationId ?? "",
          sublocation: initial.sublocation ?? "",
          quantity: String(initial.quantity ?? 1),
          estimatedValue: initial.estimatedValueCents != null ? String(initial.estimatedValueCents / 100) : "",
          description: initial.description ?? "",
        }
      : emptyForm(),
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [exif, setExif] = useState<{ capturedAt?: string; lat?: number; lng?: number }>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiState, setAiState] = useState<{ identified: boolean; confidence?: string }>({ identified: initial?.aiIdentified ?? false, confidence: initial?.aiConfidence ?? undefined });
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof ItemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleImage(picked: File) {
    if (picked.size > MAX_IMG_MB * 1024 * 1024) {
      toast.error(`Image too large (max ${MAX_IMG_MB}MB).`);
      return;
    }
    setAnalyzing(true);
    setAiNote(null);

    // Convert HEIC→JPEG (if needed) and read EXIF capture time + GPS.
    const norm = await normalizeImage(picked);
    setFile(norm.file);
    setPreview(URL.createObjectURL(norm.file));
    setExif({ capturedAt: norm.capturedAt, lat: norm.lat, lng: norm.lng });

    // Guess the location from the photo's GPS (nearest known location).
    const gpsGuess = guessLocation(norm.lat, norm.lng, locations);
    let locNote = "";
    if (gpsGuess) {
      setForm((p) => ({ ...p, locationId: gpsGuess.location.id }));
      locNote = ` Location set from photo GPS: “${gpsGuess.location.name}” (~${gpsGuess.distanceM} m) — confirm or change below.`;
    }

    if (!AI_MIMES.includes(norm.file.type)) {
      setAiNote(`Photo attached${norm.converted ? " (converted to JPG)" : ""}. AI identification supports JPG/PNG/WebP — fill the item details manually.${locNote}`);
      setAnalyzing(false);
      return;
    }

    // AI identification.
    try {
      const base64 = await fileToBase64(norm.file);
      const res = await fetch("/api/ai/inventory-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: norm.file.type, locationNames: locations.map((l) => l.name) }),
      });
      if (!res.ok) throw new Error("identify failed");
      const r = await res.json() as {
        itemName: string; itemType: string; condition: InventoryItem["condition"];
        description: string; estimatedValueUsd: number; valueRationale: string;
        suggestedLocationName: string | null; suggestedSublocation: string | null; confidence: string;
      };
      // GPS guess wins; otherwise fall back to the AI's visual location suggestion.
      const visualMatch = !gpsGuess && r.suggestedLocationName
        ? locations.find((l) => l.name.toLowerCase() === r.suggestedLocationName!.toLowerCase())
        : undefined;
      setForm((p) => ({
        ...p,
        itemName: r.itemName || p.itemName,
        itemType: r.itemType || p.itemType,
        condition: r.condition || p.condition,
        description: r.description || p.description,
        estimatedValue: r.estimatedValueUsd != null ? String(r.estimatedValueUsd) : p.estimatedValue,
        sublocation: r.suggestedSublocation || p.sublocation,
        locationId: gpsGuess ? p.locationId : (visualMatch?.id ?? p.locationId),
      }));
      setAiState({ identified: true, confidence: r.confidence });
      const visualNote = gpsGuess ? "" : visualMatch ? "" : r.suggestedLocationName ? ` Suggested location “${r.suggestedLocationName}” — assign it below.` : "";
      setAiNote(`AI identified this as “${r.itemName}” (${r.confidence} confidence). ${r.valueRationale}${locNote}${visualNote}`);
    } catch {
      setAiNote(`Couldn't auto-identify the photo${norm.converted ? " (converted to JPG)" : ""}. Enter the details manually — the photo is still attached.${locNote}`);
    } finally {
      setAnalyzing(false);
    }
  }

  const valueNum = parseFloat(form.estimatedValue);
  const valueValid = form.estimatedValue === "" || (!isNaN(valueNum) && valueNum >= 0);
  const qtyNum = parseInt(form.quantity, 10);
  const qtyValid = !isNaN(qtyNum) && qtyNum >= 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit item" : "Add inventory item"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="space-y-4 p-5">
          {/* Photo / AI */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Photo {!initial && <span className="text-muted-foreground">— identify with AI</span>}</label>
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" capture="environment" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImage(f); }} />
            <div className="flex items-start gap-3">
              <div className="size-24 shrink-0 overflow-hidden rounded-lg border border-border">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Preview" className="size-full object-cover" />
                ) : initial?.imageUrl ? (
                  <SignedImage path={initial.imageUrl} alt={initial.itemName} className="size-full" />
                ) : (
                  <div className="flex size-full items-center justify-center bg-secondary/40 text-muted-foreground"><Package className="size-6" /></div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={analyzing}>
                  {analyzing ? <><Sparkles className="size-4 animate-pulse" /> Analyzing…</> : <><Upload className="size-4" /> {preview || initial?.imageUrl ? "Replace photo" : "Take / upload photo"}</>}
                </Button>
                {aiNote && <p className="rounded-md bg-secondary/40 p-2 text-xs text-muted-foreground">{aiNote}</p>}
                {(exif.capturedAt || exif.lat != null) && (
                  <p className="text-[11px] text-muted-foreground">
                    {exif.capturedAt ? `Captured ${new Date(exif.capturedAt).toLocaleDateString()}` : ""}
                    {exif.lat != null ? `${exif.capturedAt ? " · " : ""}GPS ${exif.lat.toFixed(4)}, ${exif.lng?.toFixed(4)}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Item name *</label>
            <input className="input w-full" value={form.itemName} onChange={set("itemName")} placeholder="e.g. Blood Pressure Monitor" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <input className="input w-full" value={form.itemType} onChange={set("itemType")} placeholder="equipment, furniture…" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Est. value (USD)</label>
              <input className={`input w-full ${valueValid ? "" : "border-destructive"}`} value={form.estimatedValue} onChange={set("estimatedValue")} placeholder="e.g. 250" inputMode="decimal" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Location</label>
              <select className="input w-full" value={form.locationId} onChange={set("locationId")}>
                <option value="">— Unassigned —</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sub-location</label>
              <input className="input w-full" value={form.sublocation} onChange={set("sublocation")} placeholder="Closet A, Shelf 2" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantity</label>
              <input className={`input w-full ${qtyValid ? "" : "border-destructive"}`} value={form.quantity} onChange={set("quantity")} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Condition</label>
              <select className="input w-full" value={form.condition} onChange={set("condition")}>
                <option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select className="input w-full" value={form.status} onChange={set("status")}>
                <option value="active">Active</option><option value="broken">Broken</option><option value="removed">Removed</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <textarea className="input w-full resize-none" rows={2} value={form.description} onChange={set("description")} placeholder="Brand, model, distinguishing details" />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSave(form, file ? { file, ...exif } : null, aiState)}
            disabled={!form.itemName.trim() || !valueValid || !qtyValid || saving || analyzing}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- inventory chat ------------------------------- */

interface ChatMsg { id: string; role: "user" | "assistant"; content: string; }

function InventoryChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: "w", role: "assistant", content: "Ask me what inventory is in a location, what an item is worth, or the total value of a room. I answer from your catalogued inventory." },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send() {
    const q = input.trim();
    if (!q || thinking) return;
    setInput("");
    const next = [...messages, { id: `u${Date.now()}`, role: "user" as const, content: q }];
    setMessages(next);
    setThinking(true);
    try {
      const res = await fetch("/api/ai/inventory-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => m.id !== "w").map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json() as { text?: string; error?: string };
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: "assistant", content: data.text ?? data.error ?? "Something went wrong." }]);
    } catch {
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: "assistant", content: "Network error — please try again." }]);
    } finally {
      setThinking(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-[600px] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><MessageSquare className="size-4 text-primary" /> Inventory Assistant</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>{m.content}</div>
            </div>
          ))}
          {thinking && <div className="flex justify-start"><div className="rounded-xl bg-secondary px-4 py-3"><div className="flex gap-1"><span className="size-2 animate-bounce rounded-full bg-muted-foreground" /><span className="size-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} /><span className="size-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} /></div></div></div>}
          <div ref={endRef} />
        </div>
        <div className="border-t border-border p-3">
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2">
            <input className="input flex-1" placeholder="e.g. What's in the front office?" value={input} onChange={(e) => setInput(e.target.value)} disabled={thinking} />
            <Button type="submit" disabled={!input.trim() || thinking} aria-label="Send"><Send className="size-4" /></Button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- batch dialog ------------------------------- */

const MAX_BATCH = 40;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let idx = 0;
  const run = async () => {
    while (idx < items.length) {
      const cur = idx++;
      await fn(items[cur], cur);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: "analyzing" | "ready" | "error";
  itemName: string;
  itemType: string;
  condition: InventoryItem["condition"];
  estimatedValue: string;
  quantity: string;
  description: string;
  capturedAt?: string;
  lat?: number;
  lng?: number;
  aiIdentified: boolean;
  aiConfidence?: string;
}

function BatchDialog({
  locations,
  createMut,
  onClose,
}: {
  locations: WorkLocation[];
  createMut: ReturnType<typeof useCreate<"inventory">>;
  onClose: () => void;
}) {
  const [locationId, setLocationId] = useState("");
  const [sublocation, setSublocation] = useState("");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const batchLocSetRef = useRef(false);

  const analyzing = items.some((i) => i.status === "analyzing");
  const patch = (id: string, p: Partial<BatchItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));

  async function analyze(item: BatchItem) {
    try {
      // Convert HEIC→JPEG (if needed) + read EXIF; use the normalized file for
      // preview, AI, and upload.
      const norm = await normalizeImage(item.file);
      patch(item.id, { file: norm.file, preview: URL.createObjectURL(norm.file), capturedAt: norm.capturedAt, lat: norm.lat, lng: norm.lng });

      // Guess the batch location from the first GPS-tagged photo, if unset.
      const guess = guessLocation(norm.lat, norm.lng, locations);
      if (guess && !batchLocSetRef.current) {
        batchLocSetRef.current = true;
        setLocationId((prev) => prev || guess.location.id);
        toast.info(`Location guessed from photo GPS: ${guess.location.name} (~${guess.distanceM} m). Change it above if needed.`);
      }

      if (!AI_MIMES.includes(norm.file.type)) {
        patch(item.id, { status: "ready", itemName: item.file.name.replace(/\.[^.]+$/, "") });
        return;
      }
      const base64 = await fileToBase64(norm.file);
      const res = await fetch("/api/ai/inventory-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: norm.file.type, locationNames: [] }),
      });
      if (!res.ok) throw new Error("identify failed");
      const r = await res.json() as {
        itemName: string; itemType: string; condition: InventoryItem["condition"];
        description: string; estimatedValueUsd: number; confidence: string;
      };
      patch(item.id, {
        status: "ready",
        itemName: r.itemName || item.file.name,
        itemType: r.itemType || "equipment",
        condition: r.condition || "good",
        description: r.description || "",
        estimatedValue: r.estimatedValueUsd != null ? String(r.estimatedValueUsd) : "",
        aiIdentified: true,
        aiConfidence: r.confidence,
      });
    } catch {
      patch(item.id, { status: "error", itemName: item.itemName || item.file.name.replace(/\.[^.]+$/, "") });
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name));
    const room = MAX_BATCH - items.length;
    if (picked.length > room) toast.warning(`Batch capped at ${MAX_BATCH}; adding the first ${room}.`);
    // preview is set after normalizeImage() in analyze() (HEIC can't render until converted).
    const next = picked.slice(0, room).map((file) => ({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 7)}`,
      file, preview: "", status: "analyzing" as const,
      itemName: "", itemType: "equipment", condition: "good" as const,
      estimatedValue: "", quantity: "1", description: "", aiIdentified: false,
    }));
    if (next.length === 0) return;
    setItems((prev) => [...prev, ...next]);
    void mapLimit(next, 3, (it) => analyze(it));
  }

  async function saveAll() {
    setSaving(true);
    setProgress(0);
    let saved = 0, failed = 0;
    for (const it of items) {
      try {
        const path = await uploadFile(it.file, "inventory");
        const cents = it.estimatedValue.trim() === "" ? null : Math.round(parseFloat(it.estimatedValue) * 100);
        await createMut.mutateAsync({
          itemName: it.itemName.trim() || "Unnamed item",
          itemType: it.itemType.trim() || "equipment",
          status: "active",
          condition: it.condition,
          locationId: locationId || null,
          sublocation: sublocation.trim() || null,
          quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
          estimatedValueCents: cents,
          description: it.description.trim() || null,
          removedFromInventory: false,
          imageUrl: path,
          capturedAt: it.capturedAt ?? null,
          capturedLat: it.lat ?? null,
          capturedLng: it.lng ?? null,
          aiIdentified: it.aiIdentified,
          aiConfidence: it.aiConfidence ?? null,
        });
        saved++;
      } catch { failed++; }
      setProgress(saved + failed);
    }
    setSaving(false);
    toast.success(`Added ${saved} item${saved === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Batch add inventory</h2>
          <button onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-foreground disabled:opacity-50">✕</button>
        </div>

        {/* Batch-wide location applied to every item */}
        <div className="grid gap-4 border-b border-border px-5 py-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Location for this batch</label>
            <select className="input w-full" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Sub-location / room / closet</label>
            <input className="input w-full" value={sublocation} onChange={(e) => setSublocation(e.target.value)} placeholder="e.g. Supply Closet A, Shelf 2" />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Applies to every item added below. You can fine-tune each item’s details before saving.</p>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-5">
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          {/* @ts-expect-error non-standard directory attributes for folder picking */}
          <input id="batch-folder" type="file" accept="image/*,.heic,.heif" multiple webkitdirectory="" directory="" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Package className="mx-auto mb-2 size-8 text-muted-foreground" />
              <p className="mb-3 text-sm text-muted-foreground">Add photos of the items in this location. AI identifies each one.</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4" /> Choose photos</Button>
                <Button variant="outline" onClick={() => document.getElementById("batch-folder")?.click()}><Upload className="size-4" /> Choose folder</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}{analyzing ? " · analyzing…" : ""}</span>
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={saving}><Upload className="size-3.5" /> Add more</Button>
              </div>
              {items.map((it) => (
                <div key={it.id} className="flex items-start gap-3 rounded-lg border border-border p-2">
                  {it.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.preview} alt="" className="size-14 shrink-0 rounded-md border border-border object-cover" />
                  ) : (
                    <div className="flex size-14 shrink-0 animate-pulse items-center justify-center rounded-md border border-border bg-secondary/40"><Package className="size-5 text-muted-foreground" /></div>
                  )}
                  <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <input className="input w-full" value={it.itemName} placeholder={it.status === "analyzing" ? "Analyzing…" : "Item name"} onChange={(e) => patch(it.id, { itemName: e.target.value })} />
                    <input className="input w-24" value={it.estimatedValue} placeholder="$ value" inputMode="decimal" onChange={(e) => patch(it.id, { estimatedValue: e.target.value })} />
                    <select className="input w-24" value={it.condition} onChange={(e) => patch(it.id, { condition: e.target.value as InventoryItem["condition"] })}>
                      <option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option>
                    </select>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-3">
                      <input className="input w-16" value={it.quantity} inputMode="numeric" onChange={(e) => patch(it.id, { quantity: e.target.value })} title="Quantity" />
                      <span className="capitalize">{it.itemType}</span>
                      {it.aiIdentified && <span className="inline-flex items-center gap-0.5 text-primary"><Sparkles className="size-3" />AI {it.aiConfidence}</span>}
                      {it.status === "error" && <span className="text-destructive">AI failed — enter manually</span>}
                    </div>
                  </div>
                  <button onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))} disabled={saving} className="text-muted-foreground hover:text-destructive disabled:opacity-50"><X className="size-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground">{saving ? `Saving ${progress}/${items.length}…` : items.length > 0 ? `${items.length} ready` : ""}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={saveAll} disabled={items.length === 0 || analyzing || saving}>
              {saving ? "Saving…" : `Save ${items.length || ""} item${items.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function InventoryPage() {
  const { data, isLoading, isError, refetch } = useCollection("inventory");
  const locationsQ = useCollection("locations");
  const createMut = useCreate("inventory");
  const updateMut = useUpdate("inventory");

  const [search, setSearch] = useState("");
  const [filterLoc, setFilterLoc] = useState<string>("all");
  const [editing, setEditing] = useState<InventoryItem | null | "new">(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const items = useMemo(() => data ?? [], [data]);
  const locations = useMemo(() => (locationsQ.data ?? []).filter((l) => l.active), [locationsQ.data]);
  const locName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => {
      if (filterLoc !== "all") {
        if (filterLoc === "none" ? i.locationId : i.locationId !== filterLoc) return false;
      }
      if (q && !i.itemName.toLowerCase().includes(q) && !i.itemType.toLowerCase().includes(q) && !(i.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, filterLoc]);

  const stats = useMemo(() => {
    const active = items.filter((i) => i.status !== "removed");
    const totalValue = active.reduce((s, i) => s + (i.estimatedValueCents ?? 0) * (i.quantity ?? 1), 0);
    return { count: active.length, totalValue, locations: new Set(active.map((i) => i.locationId).filter(Boolean)).size };
  }, [items]);

  async function handleSave(
    form: ItemForm,
    image: { file: File; capturedAt?: string; lat?: number; lng?: number } | null,
    ai: { identified: boolean; confidence?: string },
  ) {
    setSaving(true);
    try {
      let imageUrl = editing && editing !== "new" ? editing.imageUrl ?? null : null;
      if (image) {
        try { imageUrl = await uploadFile(image.file, "inventory"); }
        catch { toast.error("Image upload failed — saving without the photo."); }
      }
      const cents = form.estimatedValue.trim() === "" ? null : Math.round(parseFloat(form.estimatedValue) * 100);
      const payload = {
        itemName: form.itemName.trim(),
        itemType: form.itemType.trim() || "equipment",
        status: form.status,
        condition: form.condition,
        locationId: form.locationId || null,
        sublocation: form.sublocation.trim() || null,
        quantity: Math.max(1, parseInt(form.quantity, 10) || 1),
        estimatedValueCents: cents,
        description: form.description.trim() || null,
        removedFromInventory: form.status === "removed",
        imageUrl,
        ...(image ? { capturedAt: image.capturedAt ?? null, capturedLat: image.lat ?? null, capturedLng: image.lng ?? null } : {}),
        aiIdentified: ai.identified,
        aiConfidence: ai.confidence ?? null,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Item updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Item added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Inventory" />
        <ErrorState message="We couldn't load inventory." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <ItemDialog
          initial={editing === "new" ? undefined : editing}
          locations={locations}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
      {chatOpen && <InventoryChat onClose={() => setChatOpen(false)} />}
      {batchOpen && <BatchDialog locations={locations} createMut={createMut} onClose={() => setBatchOpen(false)} />}

      <PageHeader
        title="Inventory"
        description="Track assets across locations. Snap a photo and AI identifies the item, estimates its value, and suggests where it lives."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setChatOpen(true)}><MessageSquare className="size-4" /> Ask AI</Button>
            <Button variant="outline" onClick={() => setBatchOpen(true)}><Upload className="size-4" /> Batch add</Button>
            <Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add item</Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Items tracked" value={stats.count} icon={Package} tone="success" loading={isLoading} />
        <StatCard label="Est. total value" value={usd(stats.totalValue)} icon={Sparkles} loading={isLoading} />
        <StatCard label="Locations in use" value={stats.locations} icon={MapPin} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-full pl-9" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="input" value={filterLoc} onChange={(e) => setFilterLoc(e.target.value)}>
              <option value="all">All locations</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              <option value="none">Unassigned</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No items found"
              description={search || filterLoc !== "all" ? "Try adjusting your filter." : "Add your first item — snap a photo and let AI catalog it."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add item</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Item</th>
                    <th className="pb-2 pr-4 font-medium">Location</th>
                    <th className="pb-2 pr-4 font-medium">Qty</th>
                    <th className="pb-2 pr-4 font-medium">Est. value</th>
                    <th className="pb-2 pr-4 font-medium">Condition</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => (
                    <tr key={i.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <SignedImage path={i.imageUrl} alt={i.itemName} className="size-10 shrink-0 rounded-md border border-border" />
                          <div>
                            <div className="font-medium">{i.itemName}</div>
                            <div className="text-xs capitalize text-muted-foreground">
                              {i.itemType}{i.aiIdentified && <span className="ml-1 inline-flex items-center gap-0.5 text-primary"><Sparkles className="size-3" />AI</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {i.locationId ? (
                          <div>
                            <div>{locName.get(i.locationId) ?? "—"}</div>
                            {i.sublocation && <div className="text-xs text-muted-foreground">{i.sublocation}</div>}
                          </div>
                        ) : <span className="text-muted-foreground">Unassigned</span>}
                      </td>
                      <td className="py-3 pr-4">{i.quantity ?? 1}</td>
                      <td className="py-3 pr-4">{usd(i.estimatedValueCents)}</td>
                      <td className="py-3 pr-4"><Badge variant={CONDITION_VARIANT[i.condition]} className="capitalize">{i.condition}</Badge></td>
                      <td className="py-3 pr-4"><Badge variant={STATUS_VARIANT[i.status]} className="capitalize">{i.status}</Badge></td>
                      <td className="py-3"><Button size="sm" variant="ghost" onClick={() => setEditing(i)}>Edit</Button></td>
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
