// Generates a LOCAL copy of a document entirely in the browser — the content is
// written straight to a new print window and never sent to the server, so a
// record that contains PHI can be produced and filed in the patient's chart /
// the practice's HIPAA-compliant records WITHOUT ever being saved in Compliance
// Hub. The user saves it as a PDF or prints it. Shared by the incidents module
// and the fillable-forms filler.

export interface LocalDocRow { label: string; value: string }

export interface LocalDocument {
  docLabel: string;          // e.g. "Incident Report" / "Form"
  title: string;
  subtitle?: string;         // e.g. "Type: … · Severity: …"
  rows: LocalDocRow[];
  orgName?: string;
  requiresSignature?: boolean;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Open a print-ready local copy. Returns false if pop-ups are blocked. */
export function openLocalDocumentCopy(d: LocalDocument): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  const now = new Date();
  const rowsHtml = d.rows.map((r) => `<div class="row"><div class="lbl">${esc(r.label)}</div><div class="val">${esc(r.value) || "—"}</div></div>`).join("");
  const sigHtml = d.requiresSignature
    ? `<div class="sig"><div>Signature (print &amp; sign)</div><div>Date</div></div>`
    : `<div class="sig"><div>Completed by (print &amp; sign)</div><div>Date</div></div>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.docLabel)}${d.title ? " — " + esc(d.title) : ""}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 13px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14141f; margin: 0; padding: 32px; background: #fff; }
  header { border-bottom: 2px solid #14141f; padding-bottom: 12px; margin-bottom: 18px; }
  header .k { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
  header h1 { margin: 3px 0 0; font-size: 20px; }
  header .meta { color: #6b7280; font-size: 11px; margin-top: 4px; }
  .row { margin: 10px 0; } .row .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
  .row .val { white-space: pre-wrap; margin-top: 2px; }
  .banner { border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; font-size: 12px; }
  .sig { margin-top: 40px; display: flex; gap: 40px; }
  .sig div { flex: 1; border-top: 1px solid #9ca3af; padding-top: 4px; font-size: 11px; color: #6b7280; }
  footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #6b7280; }
  @media print { body { padding: 0; } .noprint { display: none; } }
  .noprint { margin-bottom: 18px; } .btn { font: inherit; cursor: pointer; background: #14141f; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; }
</style></head>
<body>
  <div class="noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
  <div class="banner"><strong>Local copy — not saved in Compliance Hub.</strong> This document was generated on your device and was never stored in the app. Because it may contain protected health information, file it in the patient's chart / your HIPAA-compliant records, and log only a de-identified summary in Compliance Hub.</div>
  <header>
    <div class="k">${esc(d.docLabel)}${d.orgName ? " — " + esc(d.orgName) : ""}</div>
    <h1>${esc(d.title) || "(untitled)"}</h1>
    ${d.subtitle ? `<div class="meta">${esc(d.subtitle)} · Generated ${esc(now.toLocaleString())}</div>` : `<div class="meta">Generated ${esc(now.toLocaleString())}</div>`}
  </header>
  ${rowsHtml}
  ${sigHtml}
  <footer>Generated locally by Compliance Hub for filing in your HIPAA-compliant records. The app itself does not store patient PHI.</footer>
</body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
