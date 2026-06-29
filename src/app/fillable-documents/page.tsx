"use client";

import { useState } from "react";
import { FileText, ChevronRight, Check } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FormTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  estimatedMinutes: number;
  required: boolean;
  lastSubmitted?: string;
}

const TEMPLATES: FormTemplate[] = [
  { id: "f1", name: "HIPAA Privacy Notice Acknowledgment", description: "Patient acknowledgment of receipt of Notice of Privacy Practices.", category: "HIPAA", estimatedMinutes: 3, required: true, lastSubmitted: "2026-06-15" },
  { id: "f2", name: "Annual HIPAA Training Attestation", description: "Staff attestation of completing annual HIPAA training.", category: "HIPAA", estimatedMinutes: 2, required: true },
  { id: "f3", name: "OSHA Hazard Communication Training Record", description: "Document employee HazCom training completion.", category: "OSHA", estimatedMinutes: 5, required: true },
  { id: "f4", name: "Emergency Contact & Evacuation Role Assignment", description: "Designate emergency wardens and contact info.", category: "Emergency", estimatedMinutes: 5, required: true },
  { id: "f5", name: "Incident / Near Miss Report", description: "Document workplace incidents, near misses, or safety observations.", category: "OSHA", estimatedMinutes: 10, required: false },
  { id: "f6", name: "DEA 41 — Destruction of Controlled Substances", description: "Federal form for documenting controlled substance disposal.", category: "DEA", estimatedMinutes: 15, required: false },
  { id: "f7", name: "Background Check Authorization", description: "Employee consent for background check.", category: "HR", estimatedMinutes: 3, required: false },
  { id: "f8", name: "Credential Expiration Self-Report", description: "Staff self-report of expiring license or certification.", category: "Credentials", estimatedMinutes: 4, required: false },
];

interface FilledForm {
  templateId: string;
  submittedAt: string;
  fields: Record<string, string>;
}

export default function FillableDocumentsPage() {
  const [submitted, setSubmitted] = useState<FilledForm[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<FormTemplate | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [filterCategory, setFilterCategory] = useState("all");

  const categories = ["all", ...new Set(TEMPLATES.map((t) => t.category))];

  const filtered = TEMPLATES.filter(
    (t) => filterCategory === "all" || t.category === filterCategory,
  );

  const submittedIds = new Set(submitted.map((s) => s.templateId));

  function openForm(t: FormTemplate) {
    setFields({ submitterName: "", submitterRole: "", date: new Date().toISOString().slice(0, 10), signature: "" });
    setActiveTemplate(t);
  }

  function submitForm() {
    if (!fields.submitterName?.trim() || !fields.signature?.trim()) {
      toast.error("Name and signature are required");
      return;
    }
    setSubmitted((prev) => [
      { templateId: activeTemplate!.id, submittedAt: new Date().toISOString(), fields },
      ...prev,
    ]);
    setActiveTemplate(null);
    toast.success("Form submitted and recorded");
  }

  return (
    <div className="space-y-6">
      {activeTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setActiveTemplate(null)}
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">{activeTemplate.name}</h2>
              <button onClick={() => setActiveTemplate(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-muted-foreground">{activeTemplate.description}</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Submitter name *</label>
                  <input className="input w-full" value={fields.submitterName ?? ""} onChange={(e) => setFields((p) => ({ ...p, submitterName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role / title</label>
                  <input className="input w-full" value={fields.submitterRole ?? ""} onChange={(e) => setFields((p) => ({ ...p, submitterRole: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date</label>
                  <input type="date" className="input w-full" value={fields.date ?? ""} onChange={(e) => setFields((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="rounded-lg border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground mb-2">By typing your name below you are electronically signing this form.</p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">E-signature (type full name) *</label>
                    <input className="input w-full font-serif italic" placeholder="Full legal name" value={fields.signature ?? ""} onChange={(e) => setFields((p) => ({ ...p, signature: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setActiveTemplate(null)}>Cancel</Button>
              <Button onClick={submitForm} disabled={!fields.submitterName?.trim() || !fields.signature?.trim()}>Submit form</Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Fillable Documents"
        description="Submit required compliance forms with electronic signatures. All submissions are timestamped and stored in the audit trail."
      />

      <div className="flex gap-2 flex-wrap">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilterCategory(c)}
            className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
              filterCategory === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((t) => {
          const isSubmitted = submittedIds.has(t.id);
          return (
            <Card key={t.id} className={isSubmitted ? "border-success/30" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm leading-snug">{t.name}</CardTitle>
                  <div className="flex gap-1 shrink-0">
                    {t.required && <Badge variant="warning" className="text-xs">Required</Badge>}
                    {isSubmitted && <Badge variant="success" className="text-xs"><Check className="size-3" /> Done</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="outline">{t.category}</Badge>
                    <span>~{t.estimatedMinutes} min</span>
                    {t.lastSubmitted && !isSubmitted && <span>Last: {t.lastSubmitted}</span>}
                  </div>
                  <Button size="sm" variant={isSubmitted ? "outline" : "default"} onClick={() => openForm(t)}>
                    {isSubmitted ? "Submit again" : <>Fill out <ChevronRight className="size-3" /></>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {submitted.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Submissions this session</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {submitted.map((s, i) => {
                const t = TEMPLATES.find((t) => t.id === s.templateId);
                return (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Check className="size-4 text-success" />
                      {t?.name ?? s.templateId}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(s.submittedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
