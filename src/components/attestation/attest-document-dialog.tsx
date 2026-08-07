"use client";

import { useState } from "react";
import { X, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileLink } from "@/components/shared/file-link";
import { useCreate } from "@/lib/data/hooks";
import { documentFingerprint } from "@/lib/attestation";
import type { ComplianceDocument } from "@/lib/data/schema";
import { toast } from "sonner";

/**
 * Read-and-sign attestation. The person sees the ACTUAL policy (its body content
 * and/or attached file), confirms they've read it, and signs. The signature
 * permanently captures a snapshot of exactly what was signed — content, version,
 * and a fingerprint — so if the policy is later changed a fresh attestation is
 * required. Reused by the staff portal and the admin attestation page.
 */
export function AttestDocumentDialog({
  doc, userId, userName, onClose, onSigned,
}: {
  doc: ComplianceDocument;
  userId: string;
  userName: string;
  onClose: () => void;
  onSigned?: () => void;
}) {
  const createAck = useCreate("policyAcks");
  const [read, setRead] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasContent = !!(doc.content && doc.content.trim().length > 0);

  async function sign() {
    if (!read || saving) return;
    setSaving(true);
    try {
      const now = new Date();
      const expires = new Date(now); expires.setFullYear(expires.getFullYear() + 1);
      await createAck.mutateAsync({
        userId, userName,
        documentId: doc.id,
        documentTitle: doc.title,
        status: "acknowledged",
        acknowledgedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        // Immutable snapshot of exactly what was attested to.
        documentVersion: doc.version ?? null,
        documentFingerprint: documentFingerprint(doc),
        signedContent: doc.content ?? null,
        signedFileUrl: doc.fileUrl ?? null,
      });
      toast.success(`Signed: ${doc.title}`);
      onSigned?.();
      onClose();
    } catch {
      toast.error("Couldn't record your attestation. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Read &amp; sign</p>
            <h2 className="font-semibold leading-tight">{doc.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Version {doc.version || "1.0"} · your signature records this exact version</p>
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-md p-1 text-muted-foreground hover:bg-secondary"><X className="size-4" /></button>
        </div>

        {/* The document itself */}
        <div className="min-h-[120px] flex-1 overflow-y-auto px-5 py-4">
          {doc.summary && <p className="mb-3 text-sm text-muted-foreground">{doc.summary}</p>}
          {hasContent ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{doc.content}</div>
          ) : doc.fileUrl ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-secondary/30 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium"><FileText className="size-4 text-primary" /> This policy is an attached document.</div>
              <p className="text-muted-foreground">Open and read it in full before you sign.</p>
              <FileLink path={doc.fileUrl} label="Open the document"
                audit={{ entityType: "documents", entityId: doc.id, entityLabel: doc.title, details: `Opened for attestation: ${doc.title}` }}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This policy has no content or attached file yet. Ask an administrator to add the document text before attesting.</p>
          )}
        </div>

        {/* Sign */}
        <div className="border-t border-border px-5 py-4">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-0.5 size-4" disabled={saving || (!hasContent && !doc.fileUrl)} />
            <span>I have read and understand <span className="font-medium">{doc.title}</span> (version {doc.version || "1.0"}), and I attest to it. My name, the date, and this version are recorded.</span>
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={sign} disabled={!read || saving || (!hasContent && !doc.fileUrl)}>
              <Check className="size-4" /> {saving ? "Signing…" : "Sign attestation"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
