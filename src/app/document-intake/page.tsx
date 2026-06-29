"use client";

import { useState, useRef } from "react";
import { Upload, FileText, Bot, Check, X, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ClassificationResult {
  fileName: string;
  suggestedType: string;
  suggestedTitle: string;
  confidence: "high" | "medium" | "low";
  notes: string;
  accepted: boolean | null;
}


const CONFIDENCE_VARIANT: Record<ClassificationResult["confidence"], "success" | "warning" | "destructive"> = {
  high: "success",
  medium: "warning",
  low: "destructive",
};

export default function DocumentIntakePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ClassificationResult[]>([]);
  const [processing, setProcessing] = useState(false);

  async function classifyFile(file: File): Promise<Omit<ClassificationResult, "accepted">> {
    let textContent: string | undefined;
    if (file.type === "text/plain") {
      textContent = await file.text();
    }
    try {
      const res = await fetch("/api/ai/classify-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, textContent }),
      });
      const data = await res.json() as {
        suggestedType: string; suggestedTitle: string; confidence: "high" | "medium" | "low"; notes: string;
      };
      return { fileName: file.name, ...data };
    } catch {
      return { fileName: file.name, suggestedType: "reference", suggestedTitle: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "), confidence: "low", notes: "Classification failed — please review manually." };
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setProcessing(true);
    const fileArray = Array.from(files);
    Promise.all(fileArray.map(classifyFile)).then((classified) => {
      setResults((prev) => [...classified.map((c) => ({ ...c, accepted: null as boolean | null })), ...prev]);
      setProcessing(false);
      toast.success(`${fileArray.length} file${fileArray.length > 1 ? "s" : ""} classified`);
    }).catch(() => {
      setProcessing(false);
      toast.error("Classification failed");
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  function accept(idx: number) {
    setResults((prev) => prev.map((r, i) => i === idx ? { ...r, accepted: true } : r));
    toast.success("Document accepted and queued for SOP Library");
  }

  function reject(idx: number) {
    setResults((prev) => prev.map((r, i) => i === idx ? { ...r, accepted: false } : r));
  }

  function updateField(idx: number, field: keyof Pick<ClassificationResult, "suggestedType" | "suggestedTitle">, value: string) {
    setResults((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  const pending = results.filter((r) => r.accepted === null).length;
  const accepted = results.filter((r) => r.accepted === true).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Intake"
        description="Upload existing documents for AI-assisted classification. Review the suggestions and accept them into your SOP Library."
      />

      <div
        className="group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border p-12 text-center transition-colors hover:border-primary hover:bg-primary/5"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.txt"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
          <Upload className="size-6 text-primary" />
        </div>
        <div>
          <p className="font-semibold">Drop files here or click to upload</p>
          <p className="text-sm text-muted-foreground mt-1">PDF, DOC, DOCX, TXT — AI will classify each document automatically</p>
        </div>
        {processing && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Bot className="size-4 animate-pulse" />
            Classifying documents…
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{results.length} total</span>
          <span>·</span>
          <span className="text-warning">{pending} pending review</span>
          <span>·</span>
          <span className="text-success">{accepted} accepted</span>
        </div>
      )}

      {results.length === 0 && !processing && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <FileText className="size-10" />
            <p>Upload documents above to begin classification.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {results.map((r, idx) => (
          <Card key={idx} className={r.accepted === true ? "border-success/40" : r.accepted === false ? "opacity-50" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-sm text-muted-foreground truncate max-w-[240px]">{r.fileName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={CONFIDENCE_VARIANT[r.confidence]} className="capitalize">{r.confidence} confidence</Badge>
                  {r.accepted === true && <Badge variant="success"><Check className="size-3" /> Accepted</Badge>}
                  {r.accepted === false && <Badge variant="secondary"><X className="size-3" /> Rejected</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.confidence === "low" && (
                <div className="flex items-center gap-2 text-sm text-warning">
                  <AlertCircle className="size-4 shrink-0" />
                  Low confidence — please verify classification before accepting.
                </div>
              )}
              <div className="flex gap-1 items-start">
                <Bot className="size-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{r.notes}</p>
              </div>
              {r.accepted === null && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Document type</label>
                    <select className="input w-full text-sm" value={r.suggestedType} onChange={(e) => updateField(idx, "suggestedType", e.target.value)}>
                      <option value="policy">Policy</option>
                      <option value="sop">SOP / Procedure</option>
                      <option value="form">Form</option>
                      <option value="reference">Reference</option>
                      <option value="training_material">Training material</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Title</label>
                    <input className="input w-full text-sm" value={r.suggestedTitle} onChange={(e) => updateField(idx, "suggestedTitle", e.target.value)} />
                  </div>
                </div>
              )}
              {r.accepted === null && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => accept(idx)}>
                    <Check className="size-3" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reject(idx)}>
                    <X className="size-3" /> Reject
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
