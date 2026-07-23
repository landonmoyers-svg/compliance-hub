"use client";

import { useState, useMemo, useRef } from "react";
import { Boxes, Plus, Search, Sparkles, Upload, X, MapPin, Camera, ArrowRightLeft, History, DoorOpen } from "lucide-react";
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
import type { SupplyItem, SupplyMovement, WorkLocation } from "@/lib/data/schema";
import { humanizeLabel } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { toast } from "sonner";

const MAX_IMG_MB = 12;
const AI_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const ITEM_TYPES = ["keyboard", "mouse", "monitor", "cable", "adapter", "dock", "headset", "webcam", "phone", "laptop", "tablet", "printer", "furniture", "other"] as const;

const STATUS_VARIANT: Record<SupplyItem["status"], "success" | "secondary" | "warning" | "destructive" | "outline"> = {
  in_storage: "secondary",
  in_use: "success",
  checked_out: "warning",
  missing: "destructive",
  retired: "outline",
};
const STATUS_LABEL: Record<SupplyItem["status"], string> = {
  in_storage: "In storage", in_use: "In use", checked_out: "Checked out", missing: "Missing", retired: "Retired",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ------------------------------ item dialog ------------------------------ */

interface SupplyForm {
  name: string;
  itemType: string;
  itemNumber: string;
  quantity: string;
  homeLocationId: string;
  homeRoom: string;
  status: SupplyItem["status"];
  currentRoom: string;
  currentHolder: string;
  notes: string;
}

function emptyForm(): SupplyForm {
  return { name: "", itemType: "cable", itemNumber: "", quantity: "1", homeLocationId: "", homeRoom: "", status: "in_storage", currentRoom: "", currentHolder: "", notes: "" };
}

function SupplyDialog({
  initial, locations, rooms, onClose, onSave, saving,
}: {
  initial?: SupplyItem;
  locations: WorkLocation[];
  rooms: string[];
  onClose: () => void;
  onSave: (data: SupplyForm, image: { file: File; capturedAt?: string; lat?: number; lng?: number } | null, ai: { identified: boolean; confidence?: string }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<SupplyForm>(
    initial
      ? {
          name: initial.name, itemType: initial.itemType, itemNumber: initial.itemNumber ?? "",
          quantity: String(initial.quantity ?? 1), homeLocationId: initial.homeLocationId ?? "",
          homeRoom: initial.homeRoom ?? "", status: initial.status, currentRoom: initial.currentRoom ?? "",
          currentHolder: initial.currentHolder ?? "", notes: initial.notes ?? "",
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
    if (gpsGuess) {
      setForm((p) => ({ ...p, homeLocationId: p.homeLocationId || gpsGuess.location.id }));
      locNote = ` Location set from photo GPS: “${gpsGuess.location.name}”.`;
    }

    if (!AI_MIMES.includes(norm.file.type)) {
      setAiNote(`Photo attached${norm.converted ? " (converted to JPG)" : ""}. Fill the details manually.${locNote}`);
      setAnalyzing(false);
      return;
    }

    try {
      const base64 = await fileToBase64(norm.file);
      const res = await fetch("/api/ai/supply-identify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: norm.file.type, locationNames: locations.map((l) => l.name) }),
      });
      if (!res.ok) throw new Error("identify failed");
      const r = await res.json() as { name: string; itemType: string; itemNumber: string | null; suggestedRoom: string | null; suggestedLocationName: string | null; confidence: string };
      const visualMatch = !gpsGuess && r.suggestedLocationName
        ? locations.find((l) => l.name.toLowerCase() === r.suggestedLocationName!.toLowerCase())
        : undefined;
      setForm((p) => ({
        ...p,
        name: r.name || p.name,
        itemType: (ITEM_TYPES as readonly string[]).includes(r.itemType) ? r.itemType : p.itemType,
        itemNumber: p.itemNumber || r.itemNumber || "",
        homeRoom: p.homeRoom || r.suggestedRoom || "",
        homeLocationId: gpsGuess ? p.homeLocationId : (visualMatch?.id ?? p.homeLocationId),
      }));
      setAiState({ identified: true, confidence: r.confidence });
      setAiNote(`AI identified this as “${r.name}” (${r.confidence} confidence).${r.itemNumber ? ` Read label “${r.itemNumber}”.` : ""}${locNote}`);
    } catch {
      setAiNote(`Couldn't auto-identify the photo. Enter the details manually — the photo is still attached.${locNote}`);
    } finally {
      setAnalyzing(false);
    }
  }

  const qtyNum = parseInt(form.quantity, 10);
  const qtyValid = !isNaN(qtyNum) && qtyNum >= 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit item" : "Add supply item"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">Photo {!initial && <span className="text-muted-foreground">— identify with AI</span>}</label>
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
                  <div className="flex size-full items-center justify-center bg-secondary/40 text-muted-foreground"><Boxes className="size-6" /></div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={() => setCamOpen(true)} disabled={analyzing}>
                    {analyzing ? <><Sparkles className="size-4 animate-pulse" /> Analyzing…</> : <><Camera className="size-4" /> Take photo</>}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={analyzing} title="Upload from library">
                    <Upload className="size-4" /> Upload
                  </Button>
                </div>
                {aiNote && <p className="rounded-md bg-secondary/40 p-2 text-xs text-muted-foreground">{aiNote}</p>}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Item name *</label>
            <input className="input w-full" value={form.name} onChange={set("name")} placeholder="e.g. Logitech USB Keyboard" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <select className="input w-full" value={form.itemType} onChange={set("itemType")}>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{humanizeLabel(t)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Item / asset # <span className="text-muted-foreground">(if any)</span></label>
              <input className="input w-full" value={form.itemNumber} onChange={set("itemNumber")} placeholder="Asset tag / serial" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantity</label>
              <input type="number" min={1} className="input w-full" value={form.quantity} onChange={set("quantity")} />
              {!qtyValid && <p className="text-xs text-destructive">Enter a whole number ≥ 1.</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select className="input w-full" value={form.status} onChange={set("status")}>
                {(Object.keys(STATUS_LABEL) as SupplyItem["status"][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><DoorOpen className="size-3.5" /> Home storage — where it normally lives</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Location</label>
                <select className="input w-full" value={form.homeLocationId} onChange={set("homeLocationId")}>
                  <option value="">— None —</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Room / storage spot</label>
                <input className="input w-full" list="supply-rooms" value={form.homeRoom} onChange={set("homeRoom")} placeholder="e.g. IT Closet, Shelf 2" />
                <datalist id="supply-rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <textarea className="input w-full" rows={2} value={form.notes} onChange={set("notes")} placeholder="Anything worth noting" />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSave(form, file ? { file, capturedAt: exif.capturedAt, lat: exif.lat, lng: exif.lng } : null, aiState)}
            disabled={!form.name.trim() || !qtyValid || saving || analyzing}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ move dialog ------------------------------ */

function MoveDialog({
  item, locations, rooms, byName, onClose, onSave, saving,
}: {
  item: SupplyItem;
  locations: WorkLocation[];
  rooms: string[];
  byName: string;
  onClose: () => void;
  onSave: (patch: Partial<SupplyItem>, movement: Omit<SupplyMovement, "id" | "createdDate">) => void;
  saving: boolean;
}) {
  const [action, setAction] = useState<SupplyMovement["action"]>("checked_out");
  const [toLocationId, setToLocationId] = useState(item.currentLocationId ?? item.homeLocationId ?? "");
  const [toRoom, setToRoom] = useState("");
  const [toHolder, setToHolder] = useState("");
  const [note, setNote] = useState("");

  const locName = (id?: string | null) => locations.find((l) => l.id === id)?.name ?? "";
  const isReturn = action === "returned";

  function submit() {
    // Compute the item's new whereabouts + status from the action.
    let patch: Partial<SupplyItem>;
    let mvTo: { toLocationId?: string | null; toRoom?: string | null; toHolder?: string | null };
    if (isReturn) {
      patch = { status: "in_storage", currentLocationId: item.homeLocationId ?? null, currentRoom: null, currentHolder: null };
      mvTo = { toLocationId: item.homeLocationId ?? null, toRoom: item.homeRoom ?? null, toHolder: null };
    } else {
      const status: SupplyItem["status"] = action === "checked_out" ? "checked_out" : "in_use";
      patch = { status, currentLocationId: toLocationId || null, currentRoom: toRoom || null, currentHolder: toHolder || null };
      mvTo = { toLocationId: toLocationId || null, toRoom: toRoom || null, toHolder: toHolder || null };
    }
    onSave(patch, {
      itemId: item.id,
      action,
      fromLocationId: item.currentLocationId ?? item.homeLocationId ?? null,
      fromRoom: item.currentRoom ?? item.homeRoom ?? null,
      byName: byName || null,
      note: note.trim() || null,
      ...mvTo,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold flex items-center gap-2"><ArrowRightLeft className="size-4 text-primary" /> Log movement</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{item.name}</span> — currently{" "}
            {item.currentRoom || item.currentHolder || locName(item.currentLocationId)
              ? [locName(item.currentLocationId), item.currentRoom, item.currentHolder].filter(Boolean).join(" · ")
              : "in storage"}.
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Action</label>
            <select className="input w-full" value={action} onChange={(e) => setAction(e.target.value as SupplyMovement["action"])}>
              <option value="checked_out">Take from storage / check out</option>
              <option value="moved">Move to another spot</option>
              <option value="returned">Return to storage</option>
            </select>
          </div>

          {!isReturn && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">To location</label>
                  <select className="input w-full" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                    <option value="">— None —</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">To room / desk</label>
                  <input className="input w-full" list="supply-rooms" value={toRoom} onChange={(e) => setToRoom(e.target.value)} placeholder="e.g. Exam Room 3" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Given to <span className="text-muted-foreground">(staff / desk, optional)</span></label>
                <input className="input w-full" value={toHolder} onChange={(e) => setToHolder(e.target.value)} placeholder="e.g. Jordan R. / front desk" />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Note <span className="text-muted-foreground">(optional)</span></label>
            <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / condition" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Log movement"}</Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ history dialog --------------------------- */

function HistoryDialog({ item, movements, locations, onClose }: {
  item: SupplyItem; movements: SupplyMovement[]; locations: WorkLocation[]; onClose: () => void;
}) {
  const locName = (id?: string | null) => locations.find((l) => l.id === id)?.name ?? "";
  const rows = movements.filter((m) => m.itemId === item.id).sort((a, b) => (a.createdDate < b.createdDate ? 1 : -1));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold flex items-center gap-2"><History className="size-4 text-primary" /> Movement history</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          <p className="mb-3 text-sm font-medium">{item.name}</p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements logged yet.</p>
          ) : (
            <ol className="space-y-3">
              {rows.map((m) => (
                <li key={m.id} className="border-l-2 border-border pl-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{humanizeLabel(m.action)}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(m.createdDate)}</span>
                  </div>
                  <p className="mt-1 text-sm">
                    {[locName(m.fromLocationId), m.fromRoom].filter(Boolean).join(" · ") || "storage"}
                    {" → "}
                    {[locName(m.toLocationId), m.toRoom, m.toHolder].filter(Boolean).join(" · ") || "storage"}
                  </p>
                  {(m.byName || m.note) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{[m.byName ? `by ${m.byName}` : "", m.note].filter(Boolean).join(" — ")}</p>
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

export default function StaffSuppliesPage() {
  const { data, isLoading, isError, refetch } = useCollection("supplyItems");
  const { data: moveData, refetch: refetchMoves } = useCollection("supplyMovements");
  const { data: locationData } = useCollection("locations");
  const { user } = useAuth();
  const createItem = useCreate("supplyItems");
  const updateItem = useUpdate("supplyItems");
  const createMove = useCreate("supplyMovements");

  const [search, setSearch] = useState("");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editing, setEditing] = useState<SupplyItem | null | "new">(null);
  const [moving, setMoving] = useState<SupplyItem | null>(null);
  const [historyOf, setHistoryOf] = useState<SupplyItem | null>(null);
  const [saving, setSaving] = useState(false);

  const items = useMemo(() => data ?? [], [data]);
  const movements = useMemo(() => moveData ?? [], [moveData]);
  const locations = useMemo(() => (locationData ?? []).filter((l) => l.active !== false), [locationData]);
  const locName = useMemo(() => {
    const m = new Map(locations.map((l) => [l.id, l.name] as const));
    return (id?: string | null) => (id ? m.get(id) ?? "" : "");
  }, [locations]);
  const rooms = useMemo(
    () => Array.from(new Set(items.flatMap((i) => [i.homeRoom, i.currentRoom]).filter((r): r is string => !!r))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => {
      if (filterType !== "all" && i.itemType !== filterType) return false;
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (filterLocation !== "all" && (i.homeLocationId ?? "") !== filterLocation && (i.currentLocationId ?? "") !== filterLocation) return false;
      if (q && !i.name.toLowerCase().includes(q) && !(i.itemNumber ?? "").toLowerCase().includes(q) && !(i.homeRoom ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, filterType, filterStatus, filterLocation]);

  const { sorted, sort, toggle } = useSort(filtered, {
    name: (r) => r.name,
    type: (r) => r.itemType,
    home: (r) => `${locName(r.homeLocationId)} ${r.homeRoom ?? ""}`,
    status: (r) => r.status,
  });

  const stats = useMemo(() => ({
    total: items.length,
    inStorage: items.filter((i) => i.status === "in_storage").length,
    out: items.filter((i) => i.status === "checked_out" || i.status === "in_use").length,
    missing: items.filter((i) => i.status === "missing").length,
  }), [items]);

  async function handleSave(form: SupplyForm, image: { file: File; capturedAt?: string; lat?: number; lng?: number } | null, ai: { identified: boolean; confidence?: string }) {
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (image) {
        try { imageUrl = await uploadFile(image.file, "supplies"); }
        catch { toast.error("Photo upload failed."); setSaving(false); return; }
      }
      const payload = {
        name: form.name.trim(),
        itemType: form.itemType,
        itemNumber: form.itemNumber.trim() || null,
        quantity: parseInt(form.quantity, 10) || 1,
        homeLocationId: form.homeLocationId || null,
        homeRoom: form.homeRoom.trim() || null,
        status: form.status,
        currentRoom: form.currentRoom.trim() || null,
        currentHolder: form.currentHolder.trim() || null,
        notes: form.notes.trim() || null,
        aiIdentified: imageUrl ? ai.identified : (editing && editing !== "new" ? editing.aiIdentified : false),
        ...(imageUrl ? { imageUrl, capturedAt: image?.capturedAt ?? null, capturedLat: image?.lat ?? null, capturedLng: image?.lng ?? null, aiConfidence: ai.confidence ?? null } : {}),
      };
      if (editing && editing !== "new") {
        await updateItem.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Item updated");
      } else {
        const created = await createItem.mutateAsync(payload);
        await createMove.mutateAsync({ itemId: created.id, action: "added", toLocationId: form.homeLocationId || null, toRoom: form.homeRoom.trim() || null, byName: user?.fullName ?? null, note: "Added to inventory" });
        toast.success("Item added");
      }
      setEditing(null);
      void refetchMoves();
    } catch {
      toast.error("Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(patch: Partial<SupplyItem>, movement: Omit<SupplyMovement, "id" | "createdDate">) {
    if (!moving) return;
    setSaving(true);
    try {
      await updateItem.mutateAsync({ id: moving.id, patch });
      await createMove.mutateAsync(movement);
      toast.success("Movement logged");
      setMoving(null);
      void refetchMoves();
    } catch {
      toast.error("Failed to log movement");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Staff Supplies" />
        <ErrorState message="We couldn't load supply items." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <SupplyDialog
          initial={editing === "new" ? undefined : editing}
          locations={locations}
          rooms={rooms}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
      {moving && (
        <MoveDialog item={moving} locations={locations} rooms={rooms} byName={user?.fullName ?? ""} onClose={() => setMoving(null)} onSave={handleMove} saving={saving} />
      )}
      {historyOf && (
        <HistoryDialog item={historyOf} movements={movements} locations={locations} onClose={() => setHistoryOf(null)} />
      )}

      <PageHeader
        title="Staff Supplies"
        description="Movable, lower-value office items (keyboards, mice, cables, adapters…). Track where each is stored and where it goes when it leaves storage."
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add item</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total items" value={stats.total} icon={Boxes} loading={isLoading} />
        <StatCard label="In storage" value={stats.inStorage} icon={DoorOpen} tone="success" loading={isLoading} />
        <StatCard label="Out / in use" value={stats.out} icon={ArrowRightLeft} tone={stats.out ? "warning" : "default"} loading={isLoading} />
        <StatCard label="Missing" value={stats.missing} icon={MapPin} tone={stats.missing ? "destructive" : "default"} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-full pl-9" placeholder="Search name, asset #, room…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search supplies" />
            </div>
            {locations.length > 0 && (
              <select className="input h-9 py-0" value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} aria-label="Filter by location">
                <option value="all">All locations</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <select className="input h-9 py-0" value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Filter by type">
              <option value="all">All types</option>
              {ITEM_TYPES.map((t) => <option key={t} value={t}>{humanizeLabel(t)}</option>)}
            </select>
            <select className="input h-9 py-0" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_LABEL) as SupplyItem["status"][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No supply items"
              description={search || filterType !== "all" || filterStatus !== "all" || filterLocation !== "all" ? "Try adjusting your search or filters." : "Add your first item — snap a photo and AI will identify it."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add item</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Item</th>
                    <SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortHeader label="Home storage" sortKey="home" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Currently</th>
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((i) => (
                    <tr key={i.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td data-label="Item" className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="size-9 shrink-0 overflow-hidden rounded border border-border">
                            {i.imageUrl ? <SignedImage path={i.imageUrl} alt={i.name} className="size-full" /> : <div className="flex size-full items-center justify-center bg-secondary/40 text-muted-foreground"><Boxes className="size-4" /></div>}
                          </div>
                          <div>
                            <p className="font-medium">{i.name}{i.quantity > 1 ? <span className="text-muted-foreground"> ×{i.quantity}</span> : null}</p>
                            {i.itemNumber && <p className="font-mono text-[11px] text-muted-foreground">{i.itemNumber}</p>}
                          </div>
                        </div>
                      </td>
                      <td data-label="Type" className="py-3 pr-4 text-muted-foreground">{humanizeLabel(i.itemType)}</td>
                      <td data-label="Home storage" className="py-3 pr-4 text-muted-foreground">
                        {[locName(i.homeLocationId), i.homeRoom].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td data-label="Currently" className="py-3 pr-4 text-muted-foreground">
                        {i.status === "in_storage" ? <span className="text-muted-foreground">In storage</span>
                          : [locName(i.currentLocationId), i.currentRoom, i.currentHolder].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td data-label="Status" className="py-3 pr-4"><Badge variant={STATUS_VARIANT[i.status]}>{STATUS_LABEL[i.status]}</Badge></td>
                      <td data-label="" className="py-3">
                        <div className="flex items-center gap-1 md:justify-end">
                          <Button size="sm" variant="ghost" title="Log movement" onClick={() => setMoving(i)}><ArrowRightLeft className="size-4" /></Button>
                          <Button size="sm" variant="ghost" title="Movement history" onClick={() => setHistoryOf(i)}><History className="size-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>Edit</Button>
                          <AdminDeleteButton collection="supplyItems" id={i.id} label={i.name} noun="supply item" onDeleted={() => void refetch()} />
                        </div>
                      </td>
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
