"use client";

import { useState, useMemo, useRef } from "react";
import { FlaskConical, Plus, Search, Barcode, Camera, Bot, AlertCircle, X, Check, Upload } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { CameraCapture } from "@/components/shared/camera-capture";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
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
  signalWord: SDSRecord["signalWord"];
  status: SDSRecord["status"];
}

const EMPTY: SDSForm = { productName: "", manufacturer: "", upc: "", signalWord: "NONE", status: "active" };

interface LookupResult {
  productName: string;
  manufacturer: string;
  upc: string;
  signalWord: string;
  hazardSummary: string;
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
  const [mode, setMode] = useState<"choose" | "barcode" | "image">("choose");
  const [upcInput, setUpcInput] = useState("");
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

  const canLookup = mode === "barcode" ? upcInput.trim().length > 0 : imageBase64 !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
                Scan a barcode or upload a photo of the product label. Claude will identify the product and fill in SDS details automatically.
              </p>
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
                <><Bot className="size-3 animate-pulse" /> Looking up…</>
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
      ? { productName: initial.productName, manufacturer: initial.manufacturer ?? "", upc: initial.upc ?? "", signalWord: initial.signalWord, status: initial.status }
      : { ...EMPTY, ...prefill },
  );

  const set = (k: keyof SDSForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium">UPC / Product ID</label>
            <input className="input w-full" value={form.upc} onChange={set("upc")} placeholder="Barcode or product ID" />
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
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.productName.trim() || saving}>
            {saving ? "Saving…" : <><Check className="size-3" /> Save</>}
          </Button>
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
        signalWord,
        status: "active",
      },
      hazardSummary: result.hazardSummary ?? "",
      confidence: result.confidence ?? "medium",
    });
    setEditing("new");
    toast.success("Product identified — review and save");
  }

  async function handleSave(form: SDSForm) {
    setSaving(true);
    try {
      const payload = {
        productName: form.productName.trim(),
        manufacturer: form.manufacturer.trim() || undefined,
        upc: form.upc.trim() || undefined,
        signalWord: form.signalWord,
        status: form.status,
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
          <div className="flex gap-2">
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Product</th>
                    <th className="pb-2 pr-4 font-medium">Manufacturer</th>
                    <th className="pb-2 pr-4 font-medium">UPC / ID</th>
                    <th className="pb-2 pr-4 font-medium">Signal</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-3 pr-4 font-medium">{r.productName}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{r.manufacturer ?? "—"}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{r.upc ?? "—"}</td>
                      <td className="py-3 pr-4">
                        {r.signalWord !== "NONE" ? (
                          <Badge variant={SIGNAL_VARIANT[r.signalWord]}>{r.signalWord}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={STATUS_VARIANT[r.status]}>
                          {r.status === "needs_review" ? "Needs review" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Button size="sm" variant="ghost" onClick={() => { setAiPrefill(null); setEditing(r); }}>Edit</Button>
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
