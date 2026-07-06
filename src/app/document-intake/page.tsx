"use client";

import { useState, useRef } from "react";
import {
  Upload, FileText, Bot, Check, X, AlertCircle, ArrowRight, Folder, FileArchive,
  BadgeCheck, FlaskConical, ClipboardCheck, Shield, BookOpen, GraduationCap, FolderLock,
} from "lucide-react";
import JSZip from "jszip";
import { useAuth } from "@/lib/auth/context";
import { useCreate } from "@/lib/data/hooks";
import { uploadFile } from "@/lib/storage";
import { FileLink } from "@/components/shared/file-link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_MB = 25;
const MAX_BATCH = 60; // cap files processed per drop to keep the AI/storage load sane

const ACCEPTED_RE = /\.(pdf|docx?|txt|png|jpe?g|webp|csv|rtf)$/i;

function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain", csv: "text/csv", rtf: "application/rtf",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}

function isJunk(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  return !base || base.startsWith(".") || name.includes("__MACOSX") || name.endsWith("/");
}

/** Expand a set of dropped inputs: unzip any .zip archives, keep supported files. */
async function expandInputs(inputs: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of inputs) {
    const isZip = /\.zip$/i.test(f.name) || f.type.includes("zip");
    if (isZip) {
      try {
        const zip = await JSZip.loadAsync(f);
        for (const entry of Object.values(zip.files)) {
          if (entry.dir || isJunk(entry.name)) continue;
          const base = entry.name.split("/").pop() as string;
          if (!ACCEPTED_RE.test(base)) continue;
          const blob = await entry.async("blob");
          out.push(new File([blob], base, { type: guessMime(base) }));
        }
      } catch {
        toast.error(`Couldn't read the archive ${f.name}`);
      }
    } else if (!isJunk(f.name) && ACCEPTED_RE.test(f.name)) {
      out.push(f);
    }
  }
  return out;
}

/** Run async work over items with a concurrency limit. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type DestinationKey =
  | "sop_library"
  | "credentialing"
  | "employee_vault"
  | "sds_library"
  | "osha"
  | "insurance"
  | "regulatory_sources"
  | "training";

const DESTINATIONS: Record<DestinationKey, { label: string; icon: LucideIcon; route: string; storesFile: boolean }> = {
  sop_library: { label: "SOP Library", icon: FileText, route: "/sop-library", storesFile: true },
  credentialing: { label: "Credentials", icon: BadgeCheck, route: "/credentials", storesFile: true },
  employee_vault: { label: "Employee Vault", icon: FolderLock, route: "/employee-vault", storesFile: true },
  sds_library: { label: "SDS Library", icon: FlaskConical, route: "/sds-library", storesFile: false },
  osha: { label: "OSHA Tracker", icon: ClipboardCheck, route: "/osha-tracker", storesFile: false },
  insurance: { label: "Insurance Vault", icon: Shield, route: "/insurance-vault", storesFile: false },
  regulatory_sources: { label: "Regulatory Sources", icon: BookOpen, route: "/regulatory-sources", storesFile: true },
  training: { label: "Training Academy", icon: GraduationCap, route: "/training-academy", storesFile: false },
};

const DESTINATION_KEYS = Object.keys(DESTINATIONS) as DestinationKey[];

interface IntakeResult {
  id: string;
  fileName: string;
  fileUrl: string | null;
  suggestedType: string;
  suggestedTitle: string;
  complianceArea: string | null;
  destination: DestinationKey;
  destinationReason: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  notes: string;
  status: "pending" | "filing" | "filed" | "rejected";
}

const CONFIDENCE_VARIANT: Record<IntakeResult["confidence"], "success" | "warning" | "destructive"> = {
  high: "success",
  medium: "warning",
  low: "destructive",
};

let idCounter = 0;
function makeId() { idCounter += 1; return `intake-${idCounter}`; }

function coerceDestination(v: string): DestinationKey {
  return (DESTINATION_KEYS as string[]).includes(v) ? (v as DestinationKey) : "sop_library";
}

export default function DocumentIntakePage() {
  const { profile, user } = useAuth();
  const actorName = profile?.fullName ?? user?.fullName ?? "Intake";

  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<IntakeResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // One create hook per destination collection (hooks must be top-level).
  const createDocument = useCreate("documents");
  const createCredential = useCreate("credentials");
  const createEmployeeDoc = useCreate("employeeDocuments");
  const createSds = useCreate("sdsRecords");
  const createOsha = useCreate("oshaRecords");
  const createInsurance = useCreate("insurancePolicies");
  const createRegulatory = useCreate("regulatorySources");
  const createTraining = useCreate("trainingModules");

  async function processFile(file: File): Promise<IntakeResult> {
    let fileUrl: string | null = null;
    try {
      if (file.size <= MAX_FILE_MB * 1024 * 1024) {
        fileUrl = await uploadFile(file, "intake");
      }
    } catch {
      fileUrl = null; // upload best-effort; classification still proceeds
    }

    let textContent: string | undefined;
    if (file.type === "text/plain") {
      try { textContent = await file.text(); } catch { /* ignore */ }
    }

    try {
      const res = await fetch("/api/ai/classify-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, textContent }),
      });
      const data = await res.json() as {
        suggestedType: string; suggestedTitle: string; complianceArea: string | null;
        suggestedDestination: string; destinationReason: string; summary: string;
        confidence: "high" | "medium" | "low"; notes: string;
      };
      return {
        id: makeId(), fileName: file.name, fileUrl,
        suggestedType: data.suggestedType, suggestedTitle: data.suggestedTitle,
        complianceArea: data.complianceArea,
        destination: coerceDestination(data.suggestedDestination),
        destinationReason: data.destinationReason ?? "",
        summary: data.summary ?? "", confidence: data.confidence ?? "low",
        notes: data.notes ?? "", status: "pending",
      };
    } catch {
      return {
        id: makeId(), fileName: file.name, fileUrl,
        suggestedType: "reference", suggestedTitle: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        complianceArea: null, destination: "sop_library", destinationReason: "Defaulted — classification failed.",
        summary: "", confidence: "low", notes: "Classification failed — review manually.", status: "pending",
      };
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setProcessing(true);
    setProgress(null);
    try {
      let expanded = await expandInputs(Array.from(files));
      if (expanded.length === 0) {
        toast.error("No supported documents found (PDF, DOC/DOCX, TXT, images, CSV).");
        return;
      }
      let capped = false;
      if (expanded.length > MAX_BATCH) { expanded = expanded.slice(0, MAX_BATCH); capped = true; }

      setProgress({ done: 0, total: expanded.length });
      let done = 0;
      // Process ~4 at a time to stay gentle on the AI + storage.
      const classified = await mapLimit(expanded, 4, async (f) => {
        const r = await processFile(f);
        done += 1;
        setProgress({ done, total: expanded.length });
        return r;
      });
      setResults((prev) => [...classified, ...prev]);
      toast.success(`${classified.length} document${classified.length > 1 ? "s" : ""} classified & routed${capped ? ` (first ${MAX_BATCH} of a larger set)` : ""}`);
    } catch {
      toast.error("Processing failed");
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    void handleFiles(e.dataTransfer.files);
  }

  function setField<K extends keyof IntakeResult>(id: string, field: K, value: IntakeResult[K]) {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  /** File the record into its chosen destination collection. */
  async function fileRecord(r: IntakeResult, silent = false): Promise<boolean> {
    setField(r.id, "status", "filing");
    const title = r.suggestedTitle.trim() || r.fileName;
    try {
      switch (r.destination) {
        case "sop_library":
          await createDocument.mutateAsync({
            title, documentType: r.suggestedType === "sop" ? "sop" : "policy",
            complianceArea: r.complianceArea ?? undefined, summary: r.summary || undefined,
            status: "active", accessLevel: "all_staff", version: "1.0",
            requiresAcknowledgment: false, fileUrl: r.fileUrl,
          });
          break;
        case "credentialing":
          await createCredential.mutateAsync({
            employeeName: "Unassigned — set employee",
            credentialName: title,
            credentialType: r.complianceArea === "dea" ? "dea" : "license",
            documentUrl: r.fileUrl,
          });
          break;
        case "employee_vault":
          await createEmployeeDoc.mutateAsync({
            employeeName: "Unassigned — set employee", documentType: "other",
            title, fileUrl: r.fileUrl, sensitive: true,
            uploadedByName: actorName, notes: r.summary || undefined,
          });
          break;
        case "sds_library":
          await createSds.mutateAsync({ productName: title, signalWord: "NONE", status: "needs_review" });
          break;
        case "osha":
          await createOsha.mutateAsync({
            recordTitle: title, recordType: "inspection",
            description: r.summary || undefined, status: "open",
            recordabilityStatus: "not_reviewed",
          });
          break;
        case "insurance":
          await createInsurance.mutateAsync({ policyName: title, policyType: "malpractice" });
          break;
        case "regulatory_sources":
          await createRegulatory.mutateAsync({
            title, issuingBody: r.complianceArea ? r.complianceArea.toUpperCase() : undefined,
            sourceType: "regulation", reviewStatus: "needs_review", officialUrl: r.fileUrl,
          });
          break;
        case "training":
          await createTraining.mutateAsync({
            title, description: r.summary || undefined, trainingType: "compliance",
            passingScore: 80, active: true,
          });
          break;
      }
      setField(r.id, "status", "filed");
      if (!silent) toast.success(`Filed to ${DESTINATIONS[r.destination].label}`);
      return true;
    } catch {
      setField(r.id, "status", "pending");
      if (!silent) toast.error("Filing failed — try again.");
      return false;
    }
  }

  const [filingAll, setFilingAll] = useState(false);

  /** File every pending item to its (AI-suggested or user-chosen) destination. */
  async function fileAllPending() {
    const toFile = results.filter((r) => r.status === "pending");
    if (toFile.length === 0) return;
    setFilingAll(true);
    try {
      const outcomes = await mapLimit(toFile, 4, (r) => fileRecord(r, true));
      const ok = outcomes.filter(Boolean).length;
      const failed = outcomes.length - ok;
      toast.success(`Filed ${ok} document${ok !== 1 ? "s" : ""}${failed ? ` · ${failed} failed` : ""}`);
    } finally {
      setFilingAll(false);
    }
  }

  const pending = results.filter((r) => r.status === "pending").length;
  const filed = results.filter((r) => r.status === "filed").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Intake & Migration"
        description="Bulk-migrate documents in one place — drop individual files, a whole folder, or a .zip archive. The AI detects what each document is and routes it to the right module (SOP Library, Credentials, SDS, OSHA, Insurance, and more). Review each destination, then file it."
      />

      <div
        className="group relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary hover:bg-primary/5"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp,.csv,.rtf,.zip" onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }} />
        {/* @ts-expect-error webkitdirectory is a non-standard but widely supported attribute */}
        <input ref={folderRef} type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
          <Upload className="size-6 text-primary" />
        </div>
        <div>
          <p className="font-semibold">Drop files or a .zip here</p>
          <p className="mt-1 text-sm text-muted-foreground">PDF, DOC/DOCX, TXT, CSV, RTF, images, or a .zip archive — up to {MAX_BATCH} documents at a time</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={processing}>
            <FileArchive className="size-4" /> Choose files or .zip
          </Button>
          <Button variant="outline" onClick={() => folderRef.current?.click()} disabled={processing}>
            <Folder className="size-4" /> Choose a folder
          </Button>
        </div>
        {processing && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Bot className="size-4 animate-pulse" />
            {progress ? `Uploading & classifying… ${progress.done}/${progress.total}` : "Reading & expanding…"}
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{results.length} total</span><span>·</span>
            <span className="text-warning">{pending} pending</span><span>·</span>
            <span className="text-success">{filed} filed</span>
          </div>
          {pending > 0 && (
            <Button onClick={fileAllPending} disabled={filingAll}>
              <Check className="size-4" /> {filingAll ? "Filing…" : `File all ${pending} to suggested destinations`}
            </Button>
          )}
        </div>
      )}

      {results.length === 0 && !processing && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <FileText className="size-10" />
            <p>Upload documents above to begin classification and routing.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {results.map((r) => {
          const Dest = DESTINATIONS[r.destination];
          const DestIcon = Dest.icon;
          return (
            <Card key={r.id} className={r.status === "filed" ? "border-success/40" : r.status === "rejected" ? "opacity-50" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono text-sm text-muted-foreground">{r.fileName}</span>
                    {r.fileUrl && <FileLink path={r.fileUrl} label="view" />}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={CONFIDENCE_VARIANT[r.confidence]} className="capitalize">{r.confidence}</Badge>
                    {r.status === "filed" && <Badge variant="success"><Check className="size-3" /> Filed</Badge>}
                    {r.status === "rejected" && <Badge variant="secondary"><X className="size-3" /> Dismissed</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Routing recommendation */}
                <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <DestIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="text-sm">
                    <p className="flex items-center gap-1.5 font-medium">
                      Route to <span className="text-primary">{Dest.label}</span>
                      <ArrowRight className="size-3 text-muted-foreground" />
                    </p>
                    {r.destinationReason && <p className="text-xs text-muted-foreground">{r.destinationReason}</p>}
                  </div>
                </div>

                {r.confidence === "low" && (
                  <div className="flex items-center gap-2 text-sm text-warning">
                    <AlertCircle className="size-4 shrink-0" /> Low confidence — verify the destination before filing.
                  </div>
                )}

                {r.summary && <p className="text-sm text-muted-foreground">{r.summary}</p>}

                {r.status === "pending" && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Title</label>
                        <input className="input w-full text-sm" value={r.suggestedTitle} onChange={(e) => setField(r.id, "suggestedTitle", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Destination</label>
                        <select className="input w-full text-sm" value={r.destination} onChange={(e) => setField(r.id, "destination", e.target.value as DestinationKey)}>
                          {DESTINATION_KEYS.map((k) => <option key={k} value={k}>{DESTINATIONS[k].label}</option>)}
                        </select>
                      </div>
                    </div>
                    {!Dest.storesFile && r.fileUrl && (
                      <p className="text-xs text-muted-foreground">Note: {Dest.label} records don&apos;t store an attached file — the uploaded file stays accessible via the “view” link above.</p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void fileRecord(r)} disabled={r.status !== "pending"}>
                        <Check className="size-3" /> File to {Dest.label}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setField(r.id, "status", "rejected")}>
                        <X className="size-3" /> Dismiss
                      </Button>
                    </div>
                  </>
                )}

                {r.status === "filing" && <p className="text-sm text-primary">Filing…</p>}

                {r.status === "filed" && (
                  <a href={Dest.route} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    Open {Dest.label} <ArrowRight className="size-3" />
                  </a>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
