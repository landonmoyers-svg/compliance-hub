"use client";

import { useState, useRef } from "react";
import {
  Upload, FileText, Bot, Check, X, AlertCircle, ExternalLink, ArrowRight,
  BadgeCheck, FlaskConical, ClipboardCheck, Shield, BookOpen, GraduationCap, FolderLock,
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCreate } from "@/lib/data/hooks";
import { uploadFile } from "@/lib/storage";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_MB = 25;

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
  const [results, setResults] = useState<IntakeResult[]>([]);
  const [processing, setProcessing] = useState(false);

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

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setProcessing(true);
    const fileArray = Array.from(files);
    Promise.all(fileArray.map(processFile))
      .then((classified) => {
        setResults((prev) => [...classified, ...prev]);
        toast.success(`${fileArray.length} file${fileArray.length > 1 ? "s" : ""} classified & routed`);
      })
      .catch(() => toast.error("Processing failed"))
      .finally(() => setProcessing(false));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  function setField<K extends keyof IntakeResult>(id: string, field: K, value: IntakeResult[K]) {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  /** File the record into its chosen destination collection. */
  async function fileRecord(r: IntakeResult) {
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
      toast.success(`Filed to ${DESTINATIONS[r.destination].label}`);
    } catch {
      setField(r.id, "status", "pending");
      toast.error("Filing failed — try again.");
    }
  }

  const pending = results.filter((r) => r.status === "pending").length;
  const filed = results.filter((r) => r.status === "filed").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Intake"
        description="Upload any compliance document — the AI detects what it is and routes it to the right module (SOP Library, Credentials, SDS, OSHA, Insurance, and more). Review the destination, then file it."
      />

      <div
        className="group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border p-12 text-center transition-colors hover:border-primary hover:bg-primary/5"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={(e) => handleFiles(e.target.files)} />
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
          <Upload className="size-6 text-primary" />
        </div>
        <div>
          <p className="font-semibold">Drop files here or click to upload</p>
          <p className="mt-1 text-sm text-muted-foreground">PDF, DOC, DOCX, TXT, images — AI classifies and routes each document automatically</p>
        </div>
        {processing && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Bot className="size-4 animate-pulse" /> Uploading & classifying…
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{results.length} total</span><span>·</span>
          <span className="text-warning">{pending} pending</span><span>·</span>
          <span className="text-success">{filed} filed</span>
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
                    {r.fileUrl && (
                      <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="size-3" /> view
                      </a>
                    )}
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
