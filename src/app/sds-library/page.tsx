"use client";

import { useState, useMemo, useRef } from "react";
import { FlaskConical, Plus, Search, Barcode, Camera, Bot, AlertCircle, X, Check, Upload, Printer, Database, ExternalLink } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { CameraCapture } from "@/components/shared/camera-capture";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { DuplicateFinder, dupNorm } from "@/components/shared/duplicate-finder";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { AdminDeleteButton } from "@/components/shared/admin-delete-button";
import { FileLink } from "@/components/shared/file-link";
import { uploadFile } from "@/lib/storage";
import { openSdsSheet } from "@/lib/sds-sheet";
import type { SDSRecord } from "@/lib/data/schema";
import { toast } from "sonner";

const STATUS_VARIANT = {
  active: "success",
  missing: "destructive",
  needs_review: "warning",
  archived: "secondary",
} as const;

const SIGNAL_VARIANT = {
  DANGER: "destructive",
  WARNING: "warning",
  CAUTION: "secondary",
  NONE: "outline",
} as const;

/* ─── types ─────────────────────────────────────────────────── */

interface SDSForm {
  productName: string;
  manufacturer: string;
  upc: string;
  casNumber: string;
  signalWord: SDSRecord["signalWord"];
  status: SDSRecord["status"];
  hazardSummary: string;
  hazardStatements: string;
  firstAid: string;
  handling: string;
  ppe: string;
  revisionDate: string;
  fileUrl: string;
}

const EMPTY: SDSForm = {
  productName: "", manufacturer: "", upc: "", casNumber: "", signalWord: "NONE", status: "active",
  hazardSummary: "", hazardStatements: "", firstAid: "", handling: "", ppe: "", revisionDate: "", fileUrl: "",
};

/** Deep-link to the CPID consumer-product SDS database (whatsinproducts.com) for
 *  a product. It has no GET search endpoint, so we scope a web search to the
 *  site, which reliably lands on the product's SDS page. */
function cpidSearchUrl(product: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:whatsinproducts.com ${product} SDS`)}`;
}
function openCpid(product: string) {
  if (!product.trim()) { toast.error("Enter a product name first."); return; }
  window.open(cpidSearchUrl(product.trim()), "_blank", "noopener,noreferrer");
}

interface LookupResult {
  productName: string;
  manufacturer: string;
  upc: string;
  casNumber?: string;
  signalWord: string;
  hazardSummary: string;
  hazardStatements?: string;
  firstAid?: string;
  handling?: string;
  ppe?: string;
  confidence: "high" | "medium" | "low";
}

/* ─── AI lookup dialog ──────────────────────────────────────── */

function AILookupDialog({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (result: LookupResult) => void;
}) {
  const [mode, setMode] = useState<"choose" | "database" | "barcode" | "image">("choose");
  const [upcInput, setUpcInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>("image/jpeg");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [camOpen, setCamOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageFile(file: File) {
    setImageMime(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      // Strip the data:...;base64, prefix
      setImageBase64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  }

  async function lookup() {
    setError("");
    setLoading(true);
    try {
      if (mode === "database") {
        const res = await fetch("/api/sds/pubchem", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: nameInput.trim() }),
        });
        const data = await res.json() as { notFound?: boolean; message?: string; error?: string } & Partial<LookupResult>;
        if (data.error) { setError(data.error); return; }
        if (data.notFound) { setError(data.message ?? "Not found in PubChem. Try AI lookup instead."); return; }
        onResult({
          productName: nameInput.trim(),
          manufacturer: "",
          upc: "",
          casNumber: data.casNumber ?? "",
          signalWord: data.signalWord ?? "NONE",
          hazardSummary: data.hazardSummary ?? "",
          hazardStatements: data.hazardStatements ?? "",
          confidence: "high",
        });
        return;
      }

      const body = mode === "barcode"
        ? { upc: upcInput.trim() }
        : { imageBase64, mimeType: imageMime };

      const res = await fetch("/api/ai/sds-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Lookup failed");
      const data = await res.json() as LookupResult;
      onResult(data);
    } catch {
      setError("Could not identify the product. Try entering details manually.");
    } finally {
      setLoading(false);
    }
  }

  const canLookup = mode === "database" ? nameInput.trim().length > 0
    : mode === "barcode" ? upcInput.trim().length > 0 : imageBase64 !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <h2 className="font-semibold">AI Product Lookup</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {mode === "choose" && (
            <>
              <p className="text-sm text-muted-foreground">
                Import the SDS from the <span className="font-medium text-foreground">PubChem</span> chemical database by name or CAS number, or identify a product by barcode/photo with AI.
              </p>
              <button
                onClick={() => setMode("database")}
                className="flex w-full items-center gap-3 rounded-lg border border-border p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Database className="size-7 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Search a database (PubChem)</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">By chemical name or CAS # — pulls the real GHS classification</p>
                </div>
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode("barcode")}
                  className="flex flex-col items-center gap-3 rounded-lg border border-border p-5 hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <Barcode className="size-8 text-primary" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Barcode / UPC</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Enter or scan a barcode</p>
                  </div>
                </button>
                <button
                  onClick={() => setMode("image")}
                  className="flex flex-col items-center gap-3 rounded-lg border border-border p-5 hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <Camera className="size-8 text-primary" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Product photo</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Take or upload a photo</p>
                  </div>
                </button>
              </div>
            </>
          )}

          {mode === "database" && (
            <div className="space-y-3">
              <button onClick={() => setMode("choose")} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Chemical name or CAS number</label>
                <input
                  className="input w-full"
                  placeholder="e.g. Isopropyl alcohol  or  67-63-0"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && nameInput.trim()) void lookup(); }}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Pulls the authoritative GHS hazard classification (signal word + H-statements) from PubChem (NIH). Best for chemicals and CAS numbers.</p>
                <button type="button" onClick={() => openCpid(nameInput)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="size-3" /> Branded consumer product? Find its SDS on CPID (whatsinproducts.com)
                </button>
              </div>
            </div>
          )}

          {mode === "barcode" && (
            <div className="space-y-3">
              <button onClick={() => setMode("choose")} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">UPC / Barcode number</label>
                <input
                  className="input w-full font-mono"
                  placeholder="e.g. 012345678901"
                  value={upcInput}
                  onChange={(e) => setUpcInput(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Enter the barcode number from the product. Claude will look up the SDS data.</p>
              </div>
            </div>
          )}

          {mode === "image" && (
            <div className="space-y-3">
              <button onClick={() => setMode("choose")} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }}
              />
              <CameraCapture open={camOpen} onCapture={(f) => { setCamOpen(false); handleImageFile(f); }} onClose={() => setCamOpen(false)} />
              {imagePreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Product" className="w-full max-h-48 object-contain rounded-lg border border-border" />
                  <button
                    onClick={() => { setImagePreview(null); setImageBase64(null); }}
                    className="absolute top-2 right-2 rounded-full bg-background/80 p-1 hover:bg-background"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button className="w-full" onClick={() => setCamOpen(true)}><Camera className="size-4" /> Take photo</Button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <Upload className="size-6 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">or upload an image of the label / SDS sheet</p>
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {mode !== "choose" && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button onClick={lookup} disabled={!canLookup || loading}>
              {loading ? (
                <>{mode === "database" ? <Database className="size-3 animate-pulse" /> : <Bot className="size-3 animate-pulse" />} {mode === "database" ? "Searching…" : "Looking up…"}</>
              ) : mode === "database" ? (
                <><Database className="size-3" /> Search PubChem</>
              ) : (
                <><Bot className="size-3" /> Look up with AI</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── SDS form dialog ───────────────────────────────────────── */

function SDSDialog({
  initial,
  prefill,
  hazardSummary,
  confidence,
  onClose,
  onSave,
  saving,
}: {
  initial?: SDSRecord;
  prefill?: Partial<SDSForm>;
  hazardSummary?: string;
  confidence?: string;
  onClose: () => void;
  onSave: (data: SDSForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<SDSForm>(
    initial
      ? {
          productName: initial.productName, manufacturer: initial.manufacturer ?? "", upc: initial.upc ?? "",
          casNumber: initial.casNumber ?? "", signalWord: initial.signalWord, status: initial.status,
          hazardSummary: initial.hazardSummary ?? "", hazardStatements: initial.hazardStatements ?? "",
          firstAid: initial.firstAid ?? "", handling: initial.handling ?? "", ppe: initial.ppe ?? "",
          revisionDate: initial.revisionDate ?? "", fileUrl: initial.fileUrl ?? "",
        }
      : { ...EMPTY, ...prefill },
  );
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [finding, setFinding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof SDSForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleSaveClick() {
    let fileUrl = form.fileUrl;
    if (file) {
      setUploading(true);
      try { fileUrl = await uploadFile(file, "sds"); }
      catch { toast.error("SDS file upload failed."); setUploading(false); return; }
      setUploading(false);
    }
    onSave({ ...form, fileUrl });
  }

  async function findSdsPdf() {
    if (!form.productName.trim()) { toast.error("Enter a product name first."); return; }
    setFinding(true);
    try {
      const res = await fetch("/api/sds/find-pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: form.productName, manufacturer: form.manufacturer, upc: form.upc }),
      });
      const data = await res.json() as {
        found?: boolean; fileUrl?: string; sourceName?: string; message?: string; error?: string;
        manufacturer?: string; casNumber?: string; signalWord?: SDSRecord["signalWord"];
        hazardStatements?: string; revisionDate?: string;
      };
      if (data.error) { toast.error(data.error); return; }
      if (!data.found || !data.fileUrl) { toast.error(data.message || "No SDS PDF found. Try the CPID search below."); return; }
      const foundUrl = data.fileUrl;
      setFile(null);
      // Store the fetched PDF; fill any hazard fields the user hasn't set yet.
      setForm((p) => ({
        ...p,
        fileUrl: foundUrl,
        manufacturer: p.manufacturer || data.manufacturer || "",
        casNumber: p.casNumber || data.casNumber || "",
        signalWord: p.signalWord && p.signalWord !== "NONE" ? p.signalWord : (data.signalWord || p.signalWord),
        hazardStatements: p.hazardStatements || data.hazardStatements || "",
        revisionDate: p.revisionDate || data.revisionDate || "",
      }));
      toast.success(data.sourceName ? `SDS PDF fetched from ${data.sourceName}.` : "SDS PDF fetched and attached.");
    } catch {
      toast.error("SDS search failed. Try again, or use the CPID search below.");
    } finally {
      setFinding(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit SDS record" : "Add SDS record"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        {hazardSummary && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
            <Bot className="size-4 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="text-muted-foreground">{hazardSummary}</p>
              {confidence && confidence !== "high" && (
                <p className="text-xs text-warning mt-1 flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  {confidence === "medium" ? "Medium confidence — please verify fields below." : "Low confidence — manual review recommended."}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Product name *</label>
            <input className="input w-full" value={form.productName} onChange={set("productName")} placeholder="Chemical / product name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Manufacturer</label>
            <input className="input w-full" value={form.manufacturer} onChange={set("manufacturer")} placeholder="Manufacturer name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">UPC / Product ID</label>
              <input className="input w-full" value={form.upc} onChange={set("upc")} placeholder="Barcode or product ID" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">CAS number</label>
              <input className="input w-full" value={form.casNumber} onChange={set("casNumber")} placeholder="e.g. 64-17-5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Signal word</label>
              <select className="input w-full" value={form.signalWord} onChange={set("signalWord")}>
                {(["DANGER", "WARNING", "CAUTION", "NONE"] as const).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select className="input w-full" value={form.status} onChange={set("status")}>
                <option value="active">Active</option>
                <option value="missing">Missing</option>
                <option value="needs_review">Needs review</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* The actual SDS content */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Hazard summary</label>
            <textarea className="input w-full" rows={2} value={form.hazardSummary} onChange={set("hazardSummary")} placeholder="Main hazards in plain language" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Hazard (H) statements</label>
            <textarea className="input w-full" rows={2} value={form.hazardStatements} onChange={set("hazardStatements")} placeholder="e.g. H225 Highly flammable liquid and vapor" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">First aid</label>
            <textarea className="input w-full" rows={2} value={form.firstAid} onChange={set("firstAid")} placeholder="Eyes / skin / inhalation / ingestion" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Handling & storage</label>
              <textarea className="input w-full" rows={2} value={form.handling} onChange={set("handling")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">PPE</label>
              <textarea className="input w-full" rows={2} value={form.ppe} onChange={set("ppe")} placeholder="Gloves; safety glasses; ventilation" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">SDS revision date</label>
            <input type="date" className="input w-full" value={form.revisionDate} onChange={set("revisionDate")} />
          </div>

          {/* The actual SDS document */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Actual SDS document (PDF)</label>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }} />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="size-4" /> {file ? file.name : (form.fileUrl ? "Replace SDS file" : "Attach SDS file")}
              </Button>
              {file && <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>}
            </div>
            {form.fileUrl && !file && <FileLink path={form.fileUrl} label="Current SDS file" className="text-primary hover:underline" />}
            <p className="text-xs text-muted-foreground">Upload the manufacturer&apos;s Safety Data Sheet so the real document is on file (OSHA HazCom).</p>
            {!file && (
              <Button type="button" variant="secondary" className="w-full" onClick={findSdsPdf} disabled={finding || uploading}>
                <Bot className={`size-4 ${finding ? "animate-pulse" : ""}`} />
                {finding ? "Searching the web for the SDS…" : (form.fileUrl ? "Find a newer SDS PDF automatically" : "Find & attach the SDS PDF automatically")}
              </Button>
            )}
            {!form.fileUrl && !file && (
              <button type="button" onClick={() => openCpid(form.productName)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="size-3" /> Prefer to do it by hand? Search CPID (whatsinproducts.com)
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          {initial ? (
            <Button variant="ghost" onClick={() => { if (!openSdsSheet(initial)) toast.error("Allow pop-ups to print the MSDS."); }}>
              <Printer className="size-4" /> Print full MSDS
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving || uploading}>Cancel</Button>
            <Button onClick={() => void handleSaveClick()} disabled={!form.productName.trim() || saving || uploading}>
              {uploading ? "Uploading…" : saving ? "Saving…" : <><Check className="size-3" /> Save</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── page ──────────────────────────────────────────────────── */

export default function SDSLibraryPage() {
  const { data, isLoading, isError, refetch } = useCollection("sdsRecords");
  const createMut = useCreate("sdsRecords");
  const updateMut = useUpdate("sdsRecords");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<SDSRecord["status"] | "all">("all");
  const [editing, setEditing] = useState<SDSRecord | null | "new">(null);
  const [saving, setSaving] = useState(false);
  const [showAILookup, setShowAILookup] = useState(false);
  const [aiPrefill, setAiPrefill] = useState<{ form: Partial<SDSForm>; hazardSummary: string; confidence: string } | null>(null);

  const records = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (q && !r.productName.toLowerCase().includes(q) && !(r.manufacturer ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [records, search, filterStatus]);

  const { sorted, sort, toggle } = useSort(filtered, {
    product: (r) => r.productName,
    manufacturer: (r) => r.manufacturer,
    upc: (r) => r.upc,
    signal: (r) => r.signalWord,
    status: (r) => r.status,
  });

  const stats = useMemo(() => ({
    active: records.filter((r) => r.status === "active").length,
    missing: records.filter((r) => r.status === "missing").length,
    needsReview: records.filter((r) => r.status === "needs_review").length,
    danger: records.filter((r) => r.signalWord === "DANGER").length,
  }), [records]);

  function handleAIResult(result: LookupResult) {
    setShowAILookup(false);
    const signalWord = (["DANGER", "WARNING", "CAUTION", "NONE"] as const).includes(result.signalWord as SDSRecord["signalWord"])
      ? (result.signalWord as SDSRecord["signalWord"])
      : "NONE";
    setAiPrefill({
      form: {
        productName: result.productName ?? "",
        manufacturer: result.manufacturer ?? "",
        upc: result.upc ?? "",
        casNumber: result.casNumber ?? "",
        signalWord,
        status: "active",
        hazardSummary: result.hazardSummary ?? "",
        hazardStatements: result.hazardStatements ?? "",
        firstAid: result.firstAid ?? "",
        handling: result.handling ?? "",
        ppe: result.ppe ?? "",
        revisionDate: "",
        fileUrl: "",
      },
      hazardSummary: result.hazardSummary ?? "",
      confidence: result.confidence ?? "medium",
    });
    setEditing("new");
    toast.success("SDS details filled in — review, attach the SDS PDF, and save");
  }

  async function handleSave(form: SDSForm) {
    setSaving(true);
    try {
      const payload = {
        productName: form.productName.trim(),
        manufacturer: form.manufacturer.trim() || undefined,
        upc: form.upc.trim() || undefined,
        casNumber: form.casNumber.trim() || null,
        signalWord: form.signalWord,
        status: form.status,
        hazardSummary: form.hazardSummary.trim() || null,
        hazardStatements: form.hazardStatements.trim() || null,
        firstAid: form.firstAid.trim() || null,
        handling: form.handling.trim() || null,
        ppe: form.ppe.trim() || null,
        revisionDate: form.revisionDate || null,
        fileUrl: form.fileUrl || null,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("SDS record updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("SDS record added");
      }
      setEditing(null);
      setAiPrefill(null);
    } catch {
      toast.error("Failed to save SDS record");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="SDS Library" />
        <ErrorState message="We couldn't load SDS records." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showAILookup && (
        <AILookupDialog onClose={() => setShowAILookup(false)} onResult={handleAIResult} />
      )}
      {editing && (
        <SDSDialog
          initial={editing === "new" ? undefined : editing}
          prefill={editing === "new" ? aiPrefill?.form : undefined}
          hazardSummary={editing === "new" ? aiPrefill?.hazardSummary : undefined}
          confidence={editing === "new" ? aiPrefill?.confidence : undefined}
          onClose={() => { setEditing(null); setAiPrefill(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="SDS Library"
        description="Safety Data Sheets for all chemical and hazardous products used in your facility."
        actions={
          <div className="flex flex-wrap gap-2">
            <DuplicateFinder
              items={records}
              collection="sdsRecords"
              keyOf={(s) => { const k = dupNorm(s.productName); return k ? `${k}::${dupNorm(s.upc) || dupNorm(s.manufacturer)}` : null; }}
              describe={(s) => ({ title: s.productName, subtitle: [s.manufacturer, s.upc ? `UPC ${s.upc}` : ""].filter(Boolean).join(" · ") })}
              score={(s) => (s.upc ? 1 : 0) + (s.manufacturer ? 1 : 0)}
            />
            <Button variant="outline" onClick={() => setShowAILookup(true)}>
              <Bot className="size-4" /> Add with AI
            </Button>
            <Button onClick={() => { setAiPrefill(null); setEditing("new"); }}>
              <Plus className="size-4" /> Add manually
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Active" value={stats.active} icon={FlaskConical} tone="success" loading={isLoading} />
        <StatCard label="Missing SDS" value={stats.missing} icon={FlaskConical} tone={stats.missing ? "destructive" : "default"} loading={isLoading} />
        <StatCard label="Needs review" value={stats.needsReview} icon={FlaskConical} tone={stats.needsReview ? "warning" : "default"} loading={isLoading} />
        <StatCard label="DANGER signal" value={stats.danger} icon={FlaskConical} tone={stats.danger ? "warning" : "default"} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search product or manufacturer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search SDS records"
              />
            </div>
            {(["all", "active", "missing", "needs_review", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {s === "all" ? "All" : s === "needs_review" ? "Needs review" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="No SDS records found"
              description={search || filterStatus !== "all" ? "Try adjusting your search or filter." : "Add your first SDS record using AI lookup or manually."}
              action={
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAILookup(true)}><Bot className="size-4" /> Add with AI</Button>
                  <Button onClick={() => { setAiPrefill(null); setEditing("new"); }}><Plus className="size-4" /> Add manually</Button>
                </div>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Product" sortKey="product" sort={sort} onToggle={toggle} />
                    <SortHeader label="Manufacturer" sortKey="manufacturer" sort={sort} onToggle={toggle} />
                    <SortHeader label="UPC / ID" sortKey="upc" sort={sort} onToggle={toggle} />
                    <SortHeader label="Signal" sortKey="signal" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">SDS</th>
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td data-label="Product" className="py-3 pr-4 font-medium">{r.productName}</td>
                      <td data-label="Manufacturer" className="py-3 pr-4 text-muted-foreground">{r.manufacturer ?? "—"}</td>
                      <td data-label="UPC / ID" className="py-3 pr-4 font-mono text-xs text-muted-foreground">{r.upc ?? "—"}</td>
                      <td data-label="Signal" className="py-3 pr-4">
                        {r.signalWord !== "NONE" ? (
                          <Badge variant={SIGNAL_VARIANT[r.signalWord]}>{r.signalWord}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td data-label="SDS" className="py-3 pr-4">
                        {r.fileUrl ? (
                          <FileLink path={r.fileUrl} label="View SDS" className="inline-flex items-center gap-1 text-primary hover:underline" />
                        ) : (r.hazardSummary || r.hazardStatements) ? (
                          <span className="text-xs text-muted-foreground">Details · no PDF</span>
                        ) : (
                          <span className="text-xs text-warning">Not on file</span>
                        )}
                      </td>
                      <td data-label="Status" className="py-3 pr-4">
                        <button type="button" onClick={() => { setAiPrefill(null); setEditing(r); }} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                          <Badge variant={STATUS_VARIANT[r.status]}>
                            {r.status === "needs_review" ? "Needs review" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                          </Badge>
                        </button>
                      </td>
                      <td data-label="" className="py-3">
                        <div className="flex items-center gap-1 md:justify-end">
                          {!r.fileUrl && (
                            <Button size="sm" variant="ghost" title="Find the SDS PDF on CPID (whatsinproducts.com)" onClick={() => openCpid(r.productName)}>
                              <ExternalLink className="size-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" title="Print full MSDS" onClick={() => { if (!openSdsSheet(r)) toast.error("Allow pop-ups to print the MSDS."); }}>
                            <Printer className="size-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setAiPrefill(null); setEditing(r); }}>Edit</Button>
                          <AdminDeleteButton collection="sdsRecords" id={r.id} label={r.productName} noun="SDS record" onDeleted={() => void refetch()} />
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
