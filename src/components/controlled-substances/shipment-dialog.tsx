"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, FileScan, Loader2, Plus, Trash2, X, AlertTriangle, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { normalizeImage } from "@/lib/images";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/* The shape the extractor returns (see /api/ai/cs-manifest). */
interface ExtractedBox {
  boxNumber: number | null; assignedLetter: string | null; gtin: string | null;
  serialNumber: string | null; lotNumber: string | null; expirationDate: string | null;
  expirationIsMonth: boolean; unitsInBox: number | null;
}
interface ExtractedLine {
  sku: string | null; description: string | null; packDescription: string | null; ndc: string | null;
  scheduleClass: "II" | "IIN" | "III" | "IV" | "V" | null; boxCount: number | null; unitsPerBox: number | null;
  unitVolume: number | null; unitVolumeUom: string | null; strengthPerUnit: string | null;
  lotNumber: string | null; lotNote: string | null; expirationDate: string | null;
}
export interface Extracted {
  documentKind?: string;
  supplierName: string | null; supplierDea: string | null; customerDea: string | null;
  shipToName: string | null; shipToAddress: string | null;
  poNumber: string | null; orderNumber: string | null; packingSlipNumber: string | null;
  orderDate: string | null; receivedDate: string | null;
  lines: ExtractedLine[]; boxes?: ExtractedBox[];
  handwrittenNotes: string | null; confidence: "high" | "medium" | "low"; summary: string;
}

export interface BoxRow {
  key: string;
  letter: string;
  boxNumber: number | null;
  serialNumber: string;
  gtin: string;
  lotNumber: string;
  expirationDate: string;   // YYYY-MM-DD
  expirationIsMonth: boolean;
  units: number;
}

export interface ShipmentPayload {
  files: File[];
  extracted: Extracted | null;
  locationId: string;
  prefix: string;
  header: {
    supplierName: string; supplierDea: string; customerDea: string; shipToName: string; shipToAddress: string;
    poNumber: string; orderNumber: string; packingSlipNumber: string; orderDate: string; receivedDate: string;
    expectedBoxCount: number | null; expectedUnitCount: number | null; notes: string;
  };
  product: {
    substanceName: string; scheduleClass: "II" | "IIN" | "III" | "IV" | "V"; ndc: string;
    strengthPerUnit: string; unitVolume: string; unitVolumeUom: string;
  };
  boxes: BoxRow[];
}

const todayInput = () => new Date().toISOString().slice(0, 10);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const label = "mb-1 block text-xs font-medium text-muted-foreground";

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = r.result as string; resolve(s.slice(s.indexOf(",") + 1)); };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Next free letters for this site, skipping ones already in use. */
function freeLetters(prefix: string, used: string[], count: number): string[] {
  const taken = new Set(used.filter((b) => b.toUpperCase().startsWith(`${prefix.toUpperCase()}-`)).map((b) => b.slice(prefix.length + 1).toUpperCase()));
  const out: string[] = [];
  for (const ch of LETTERS) {
    if (out.length >= count) break;
    if (!taken.has(ch)) out.push(ch);
  }
  return out;
}

/**
 * Log a whole controlled-substance delivery from its paperwork: photograph the
 * packing slip and the boxes, check what was read, and mint every vial with its
 * box and manifest attached. Nothing is saved until the user presses the button —
 * anything the reader couldn't make out is left blank for a person to fill in.
 */
export function ShipmentDialog({ locations, existingBoxLabels, saving, onClose, onSave }: {
  locations: { id: string; name: string }[];
  existingBoxLabels: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (p: ShipmentPayload) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [reading, setReading] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);

  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [prefix, setPrefix] = useState((locations[0]?.name ?? "").match(/[a-zA-Z]/)?.[0]?.toUpperCase() ?? "");
  const [header, setHeader] = useState<ShipmentPayload["header"]>({
    supplierName: "", supplierDea: "", customerDea: "", shipToName: "", shipToAddress: "",
    poNumber: "", orderNumber: "", packingSlipNumber: "", orderDate: "", receivedDate: todayInput(),
    expectedBoxCount: null, expectedUnitCount: null, notes: "",
  });
  const [product, setProduct] = useState<ShipmentPayload["product"]>({
    substanceName: "", scheduleClass: "III", ndc: "", strengthPerUnit: "", unitVolume: "", unitVolumeUom: "mL",
  });
  const [boxes, setBoxes] = useState<BoxRow[]>([]);

  const addFiles = async (picked: FileList | null) => {
    if (!picked?.length) return;
    const next: { file: File; url: string }[] = [];
    for (const f of Array.from(picked).slice(0, 6)) {
      // HEIC straight off an iPhone can't be shown or read by the model — convert first.
      const norm = await normalizeImage(f).catch(() => ({ file: f }));
      next.push({ file: norm.file, url: URL.createObjectURL(norm.file) });
    }
    setFiles((p) => [...p, ...next].slice(0, 6));
  };

  const read = async () => {
    if (!files.length) return;
    setReading(true);
    try {
      const payload = await Promise.all(files.map(async ({ file }) => ({ base64: await fileToBase64(file), mediaType: file.type })));
      const res = await fetch("/api/ai/cs-manifest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: payload }) });
      const d = await res.json() as Extracted & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Couldn't read the paperwork");
      applyExtraction(d);
      setExtracted(d);
      toast.success("Read the delivery — check every number before logging.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read the paperwork.");
    } finally { setReading(false); }
  };

  /** Fill the form from what was read, leaving anything unreadable blank. */
  function applyExtraction(d: Extracted) {
    const line = d.lines?.[0];
    // Match the ship-to address to one of our sites so the vials land in the right place.
    const hay = `${d.shipToAddress ?? ""} ${d.shipToName ?? ""}`.toLowerCase();
    const matched = locations.find((l) => {
      const num = (l.name.match(/\d+/) ?? [])[0];
      return hay.includes(l.name.toLowerCase()) || (!!num && hay.includes(num) && hay.includes((l.name.split(" ")[0] ?? "").toLowerCase()));
    });
    const site = matched ?? locations.find((l) => l.id === locationId) ?? locations[0];
    const pfx = (site?.name ?? "").match(/[a-zA-Z]/)?.[0]?.toUpperCase() ?? prefix;
    if (site) { setLocationId(site.id); setPrefix(pfx); }

    setHeader((p) => ({
      ...p,
      supplierName: d.supplierName ?? p.supplierName,
      supplierDea: d.supplierDea ?? p.supplierDea,
      customerDea: d.customerDea ?? p.customerDea,
      shipToName: d.shipToName ?? p.shipToName,
      shipToAddress: d.shipToAddress ?? p.shipToAddress,
      poNumber: d.poNumber ?? p.poNumber,
      orderNumber: d.orderNumber ?? p.orderNumber,
      packingSlipNumber: d.packingSlipNumber ?? p.packingSlipNumber,
      orderDate: d.orderDate ?? p.orderDate,
      receivedDate: d.receivedDate ?? p.receivedDate,
      expectedBoxCount: line?.boxCount ?? p.expectedBoxCount,
      expectedUnitCount: line?.boxCount && line?.unitsPerBox ? line.boxCount * line.unitsPerBox : p.expectedUnitCount,
      notes: d.handwrittenNotes ?? p.notes,
    }));
    setProduct((p) => ({
      ...p,
      substanceName: line?.description ?? p.substanceName,
      scheduleClass: line?.scheduleClass ?? p.scheduleClass,
      ndc: line?.ndc ?? p.ndc,
      strengthPerUnit: line?.strengthPerUnit ?? p.strengthPerUnit,
      unitVolume: line?.unitVolume != null ? String(line.unitVolume) : p.unitVolume,
      unitVolumeUom: line?.unitVolumeUom ?? p.unitVolumeUom,
    }));

    const perBox = line?.unitsPerBox ?? 0;
    const labelled = (d.boxes ?? []).filter((b) => b.serialNumber || b.assignedLetter || b.boxNumber != null);
    const count = Math.max(labelled.length, line?.boxCount ?? 0);
    const suggested = freeLetters(pfx, existingBoxLabels, count);
    const rows: BoxRow[] = Array.from({ length: count }, (_, i) => {
      const b = labelled[i];
      return {
        key: `${i}-${Math.random().toString(36).slice(2, 7)}`,
        letter: (b?.assignedLetter ?? suggested[i] ?? "").toUpperCase(),
        boxNumber: b?.boxNumber ?? i + 1,
        serialNumber: b?.serialNumber ?? "",
        gtin: b?.gtin ?? "",
        lotNumber: b?.lotNumber ?? line?.lotNumber ?? "",
        expirationDate: b?.expirationDate ?? line?.expirationDate ?? "",
        expirationIsMonth: b?.expirationIsMonth ?? false,
        units: b?.unitsInBox ?? perBox,
      };
    });
    setBoxes(rows);
  }

  const setBox = (key: string, patch: Partial<BoxRow>) => setBoxes((p) => p.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const addBox = () => setBoxes((p) => [...p, {
    key: `${p.length}-${Math.random().toString(36).slice(2, 7)}`,
    letter: freeLetters(prefix, [...existingBoxLabels, ...p.map((b) => `${prefix}-${b.letter}`)], 1)[0] ?? "",
    boxNumber: p.length + 1, serialNumber: "", gtin: "", lotNumber: p[0]?.lotNumber ?? "",
    expirationDate: p[0]?.expirationDate ?? "", expirationIsMonth: p[0]?.expirationIsMonth ?? false, units: p[0]?.units ?? 10,
  }]);

  const totalVials = boxes.reduce((n, b) => n + (Number(b.units) || 0), 0);
  const sortedBoxes = [...boxes].sort((a, b) => a.letter.localeCompare(b.letter));
  const firstId = sortedBoxes[0] ? `${prefix}-${sortedBoxes[0].letter}1` : "";
  const lastBox = sortedBoxes[sortedBoxes.length - 1];
  const lastId = lastBox ? `${prefix}-${lastBox.letter}${lastBox.units}` : "";

  const problems = useMemo(() => {
    const out: string[] = [];
    const letters = boxes.map((b) => b.letter.toUpperCase()).filter(Boolean);
    if (new Set(letters).size !== letters.length) out.push("Two boxes have the same letter.");
    const clash = letters.filter((l) => existingBoxLabels.some((e) => e.toUpperCase() === `${prefix.toUpperCase()}-${l}`));
    if (clash.length) out.push(`Box ${clash.join(", ")} already exists at this site — pick another letter.`);
    const serials = boxes.map((b) => b.serialNumber.trim()).filter(Boolean);
    if (new Set(serials).size !== serials.length) out.push("Two boxes have the same serial number — check the photo.");
    if (boxes.some((b) => !b.lotNumber.trim())) out.push("A box has no lot number.");
    if (boxes.some((b) => !b.expirationDate)) out.push("A box has no expiry — it's on the box label, not the slip.");
    if (boxes.some((b) => !b.units || b.units < 1)) out.push("A box has no vial count.");
    if (header.expectedBoxCount && header.expectedBoxCount !== boxes.length) out.push(`The paperwork says ${header.expectedBoxCount} boxes; you have ${boxes.length}.`);
    return out;
  }, [boxes, existingBoxLabels, prefix, header.expectedBoxCount]);

  const canSave = !!locationId && !!prefix && boxes.length > 0 && !!product.substanceName.trim()
    && boxes.every((b) => b.letter.trim() && b.units > 0) && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:max-w-5xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><PackageCheck className="size-4 text-primary" /> Receive a shipment</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* 1 — the paperwork */}
          <section>
            <p className="text-sm font-medium">1. Photograph the paperwork</p>
            <p className="mb-2 text-xs text-muted-foreground">
              The packing slip <em>and</em> the boxes. The box labels carry the serial numbers and the expiry date, which the slip doesn&apos;t — and your handwriting is read too (lot numbers, &quot;each box = 10 vials&quot;, and lettering like &quot;1 = A&quot;, which means that box is <strong>A</strong>).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept="application/pdf,image/*,.heic,.heif" multiple className="hidden"
                onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={reading}><Camera /> Add photos</Button>
              {files.length > 0 && (
                <Button size="sm" onClick={read} disabled={reading}>
                  {reading ? <Loader2 className="animate-spin" /> : <FileScan />} {reading ? "Reading…" : `Read ${files.length} file${files.length === 1 ? "" : "s"}`}
                </Button>
              )}
            </div>
            {files.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {files.map(({ file, url }, i) => (
                  <div key={i} className="relative">
                    {file.type.startsWith("image/")
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={url} alt={file.name} className="size-20 rounded-md border border-border object-cover" />
                      : <div className="flex size-20 items-center justify-center rounded-md border border-border text-xs text-muted-foreground">PDF</div>}
                    <button onClick={() => setFiles((p) => p.filter((_, n) => n !== i))} aria-label="Remove"
                      className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-card p-0.5 text-muted-foreground hover:text-foreground"><X className="size-3" /></button>
                  </div>
                ))}
              </div>
            )}
            {extracted && (
              <p className="mt-3 flex items-start gap-2 rounded-md bg-secondary px-3 py-2 text-sm">
                <Badge variant={extracted.confidence === "high" ? "success" : extracted.confidence === "medium" ? "warning" : "destructive"}>
                  {extracted.confidence} confidence
                </Badge>
                <span>{extracted.summary}</span>
              </p>
            )}
          </section>

          {/* 2 — the delivery */}
          <section>
            <p className="mb-2 text-sm font-medium">2. The delivery</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className={label} htmlFor="sp-site">Goes to</label>
                <select id="sp-site" className={input} value={locationId} onChange={(e) => {
                  const l = locations.find((x) => x.id === e.target.value);
                  setLocationId(e.target.value);
                  if (l) setPrefix(l.name.match(/[a-zA-Z]/)?.[0]?.toUpperCase() ?? prefix);
                }}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div><label className={label} htmlFor="sp-prefix">Box label prefix</label>
                <input id="sp-prefix" className={`${input} uppercase`} maxLength={3} value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} /></div>
              <div><label className={label} htmlFor="sp-received">Received</label>
                <input id="sp-received" type="date" className={input} value={header.receivedDate} onChange={(e) => setHeader((p) => ({ ...p, receivedDate: e.target.value }))} /></div>
              <div><label className={label} htmlFor="sp-supplier">Supplier</label>
                <input id="sp-supplier" className={input} value={header.supplierName} onChange={(e) => setHeader((p) => ({ ...p, supplierName: e.target.value }))} /></div>
              <div><label className={label} htmlFor="sp-po">PO number</label>
                <input id="sp-po" className={input} value={header.poNumber} onChange={(e) => setHeader((p) => ({ ...p, poNumber: e.target.value }))} /></div>
              <div><label className={label} htmlFor="sp-slip">Packing slip / order</label>
                <input id="sp-slip" className={input} value={header.packingSlipNumber} onChange={(e) => setHeader((p) => ({ ...p, packingSlipNumber: e.target.value }))} /></div>
            </div>
          </section>

          {/* 3 — the product */}
          <section>
            <p className="mb-2 text-sm font-medium">3. What arrived</p>
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-2"><label className={label} htmlFor="sp-name">Substance</label>
                <input id="sp-name" className={input} value={product.substanceName} onChange={(e) => setProduct((p) => ({ ...p, substanceName: e.target.value }))} placeholder="Ketamine HCl" /></div>
              <div><label className={label} htmlFor="sp-sched">Schedule</label>
                <select id="sp-sched" className={input} value={product.scheduleClass} onChange={(e) => setProduct((p) => ({ ...p, scheduleClass: e.target.value as ShipmentPayload["product"]["scheduleClass"] }))}>
                  {["II", "IIN", "III", "IV", "V"].map((s) => <option key={s}>{s}</option>)}
                </select></div>
              <div><label className={label} htmlFor="sp-ndc">NDC</label>
                <input id="sp-ndc" className={input} value={product.ndc} onChange={(e) => setProduct((p) => ({ ...p, ndc: e.target.value }))} /></div>
              <div><label className={label} htmlFor="sp-strength">Strength / vial</label>
                <input id="sp-strength" className={input} value={product.strengthPerUnit} onChange={(e) => setProduct((p) => ({ ...p, strengthPerUnit: e.target.value }))} placeholder="500 mg" /></div>
              <div><label className={label} htmlFor="sp-vol">Size / vial</label>
                <div className="flex gap-1">
                  <input id="sp-vol" className={input} value={product.unitVolume} onChange={(e) => setProduct((p) => ({ ...p, unitVolume: e.target.value }))} placeholder="5" />
                  <input aria-label="Unit" className={`${input} w-16`} value={product.unitVolumeUom} onChange={(e) => setProduct((p) => ({ ...p, unitVolumeUom: e.target.value }))} />
                </div></div>
            </div>
          </section>

          {/* 4 — the boxes */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">4. The boxes</p>
              <Button size="sm" variant="outline" onClick={addBox}><Plus /> Add a box</Button>
            </div>
            {boxes.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Read the paperwork above, or add boxes by hand.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Box</th><th className="px-2 py-2">Vials</th>
                      <th className="px-2 py-2">Lot</th><th className="px-2 py-2">Expiry</th>
                      <th className="px-2 py-2">Serial number</th><th className="px-2 py-2">Vial IDs</th><th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {boxes.map((b) => (
                      <tr key={b.key}>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{prefix}-</span>
                            <input aria-label="Box letter" className={`${input} w-14 font-mono uppercase`} maxLength={2} value={b.letter} onChange={(e) => setBox(b.key, { letter: e.target.value.toUpperCase() })} />
                          </div>
                          {b.boxNumber != null && <span className="text-[11px] text-muted-foreground">written on the box as {b.boxNumber}</span>}
                        </td>
                        <td className="px-2 py-1.5"><input aria-label="Vials in box" type="number" min={1} max={50} className={`${input} w-16`} value={b.units} onChange={(e) => setBox(b.key, { units: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1.5"><input aria-label="Lot" className={`${input} w-28 font-mono`} value={b.lotNumber} onChange={(e) => setBox(b.key, { lotNumber: e.target.value })} /></td>
                        <td className="px-2 py-1.5"><input aria-label="Expiry" type="date" className={`${input} w-36`} value={b.expirationDate} onChange={(e) => setBox(b.key, { expirationDate: e.target.value, expirationIsMonth: false })} /></td>
                        <td className="px-2 py-1.5"><input aria-label="Serial number" className={`${input} w-44 font-mono`} value={b.serialNumber} onChange={(e) => setBox(b.key, { serialNumber: e.target.value })} /></td>
                        <td className="px-2 py-1.5 whitespace-nowrap font-mono text-xs text-muted-foreground">{b.letter ? `${prefix}-${b.letter}1–${b.units}` : "—"}</td>
                        <td className="px-2 py-1.5"><button aria-label="Remove box" onClick={() => setBoxes((p) => p.filter((x) => x.key !== b.key))} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {problems.length > 0 && (
              <ul className="mt-2 space-y-1">
                {problems.map((p, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-warning"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {p}</li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className={cn("text-sm", boxes.length ? "text-foreground" : "text-muted-foreground")}>
            {boxes.length
              ? <>Logs <strong>{boxes.length}</strong> box{boxes.length === 1 ? "" : "es"} and <strong>{totalVials}</strong> vials — <span className="font-mono">{firstId}</span> … <span className="font-mono">{lastId}</span></>
              : "Nothing to log yet."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => onSave({ files: files.map((f) => f.file), extracted, locationId, prefix, header, product, boxes })} disabled={!canSave}>
              {saving ? <Loader2 className="animate-spin" /> : <PackageCheck />} Log shipment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
