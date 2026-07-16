"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileLink } from "@/components/shared/file-link";
import { humanizeLabel } from "@/lib/format";
import type { FillableFormTemplate, FormCategory, FormField } from "@/lib/data/schema";

/**
 * Read-only preview of a form — either a BLANK template (field placeholders) or
 * a FILLED submission (values + signature). Used by the Forms page (click a
 * title) and the Form Gap Matrix (review a draft before approving). Pass
 * `footer` to add action buttons (e.g. Approve, Edit in Forms) beside Close.
 */
export function FormPreview({ template, values, meta, linkedPolicy, footer, onClose }: {
  template?: FillableFormTemplate;
  /** Field key → value. Absent for a blank-template preview. */
  values?: Record<string, string>;
  meta?: { title: string; category?: FormCategory; subtitle?: string; signedByName?: string; completedAt?: string | null };
  /** The governing policy/SOP this form attests to (resolved from template.linkedDocumentId). */
  linkedPolicy?: { title: string; fileUrl?: string | null } | null;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  const filled = !!values;
  const fields = template?.fields ?? [];
  const title = meta?.title ?? template?.title ?? "Form";
  const category = meta?.category ?? template?.category;
  // If the template was deleted, fall back to the raw stored values.
  const orphanKeys = filled && fields.length === 0 ? Object.keys(values as Record<string, string>) : [];

  const renderValue = (f: FormField) => {
    const v = values?.[f.key] ?? "";
    if (f.type === "checkbox") {
      const on = v === "true";
      return <span className="inline-flex items-center gap-2"><span className={`flex size-4 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{on ? "✓" : ""}</span><span className="text-sm">{on ? "Yes" : filled ? "No" : ""}</span></span>;
    }
    if (!filled) {
      return <div className={`rounded-md border border-dashed border-border bg-secondary/10 px-3 ${f.type === "textarea" ? "py-6" : "py-2"} text-sm text-muted-foreground`}>{f.type === "select" && f.options.length ? f.options.join(" / ") : ` `}</div>;
    }
    return <div className={`whitespace-pre-wrap rounded-md border border-border bg-card px-3 py-2 text-sm ${v ? "" : "text-muted-foreground"}`}>{v || "—"}</div>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{title}</h2>
              <Badge variant={filled ? "success" : "secondary"}>{filled ? "Filled" : "Blank"}</Badge>
              {template?.isDraft && <Badge variant="warning">Draft</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {[category ? humanizeLabel(category) : null, meta?.subtitle].filter(Boolean).join(" · ") || (filled ? "Submitted form" : "Blank template preview")}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {template?.description && <p className="text-sm text-muted-foreground">{template.description}</p>}

          {template?.bodyText && (
            <div className="rounded-lg border border-border bg-secondary/20 p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Statement</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{template.bodyText}</p>
              {linkedPolicy && (
                linkedPolicy.fileUrl ? (
                  <FileLink path={linkedPolicy.fileUrl} label={`Read the policy: ${linkedPolicy.title}`} className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline" />
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Governing policy: {linkedPolicy.title}</p>
                )
              )}
            </div>
          )}

          {template?.fileUrl && (
            <FileLink path={template.fileUrl} label="Open original document" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" />
          )}

          {fields.length === 0 && orphanKeys.length === 0 && (
            <p className="text-sm text-muted-foreground">This form has no fields yet.</p>
          )}

          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-sm font-medium">{f.label}{f.required && <span className="text-destructive"> *</span>}</label>
              {renderValue(f)}
            </div>
          ))}

          {orphanKeys.map((k) => (
            <div key={k} className="space-y-1.5">
              <label className="text-sm font-medium">{humanizeLabel(k)}</label>
              <div className="whitespace-pre-wrap rounded-md border border-border bg-card px-3 py-2 text-sm">{(values as Record<string, string>)[k] || "—"}</div>
            </div>
          ))}

          {(template?.requiresSignature || meta?.signedByName) && (
            <div className="mt-2 border-t border-border pt-4">
              <label className="text-xs font-medium text-muted-foreground">Signature</label>
              {meta?.signedByName ? (
                <p className="mt-1 text-sm"><span className="font-medium italic">{meta.signedByName}</span>{meta.completedAt ? <span className="text-muted-foreground"> · {new Date(meta.completedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span> : null}</p>
              ) : (
                <div className="mt-1 h-8 max-w-xs border-b border-border" />
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-3">
          {footer}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
