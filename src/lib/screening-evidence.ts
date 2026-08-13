// Printable exclusion-screening evidence report. An automated screening only
// counts as compliance proof if it documents WHAT was checked (which official
// lists, which version/size, when) and the RESULT for each subject. This
// generates a dated, printable/savable certificate an auditor accepts as evidence
// — the automated equivalent of the screenshot you'd otherwise upload.

export interface EvidenceRow { name: string; type: string; result: "clear" | "potential_match"; detail?: string; }

export interface EvidenceInput {
  orgName: string;
  runBy: string;
  screenedDate: string;          // YYYY-MM-DD
  leieCount: number;
  leieRetrievedAt: string;       // ISO
  leieSource: string;
  samEnabled: boolean;
  samStatus?: string;
  rows: EvidenceRow[];
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function buildScreeningEvidenceHtml(d: EvidenceInput): string {
  const now = new Date();
  const clears = d.rows.filter((r) => r.result === "clear");
  const matches = d.rows.filter((r) => r.result === "potential_match");
  const samLine = !d.samEnabled
    ? "Not checked (SAM.gov API key not configured)."
    : d.samStatus === "ok"
      ? "Checked via the SAM.gov Exclusions API."
      : "Not automated — SAM.gov's API restricts server-side requests; any potential matches were verified directly on SAM.gov.";

  const rowsHtml = d.rows.map((r) => `<tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.type)}</td>
      <td class="${r.result === "clear" ? "ok" : "flag"}">${r.result === "clear" ? "No match — clear" : "Potential match — verify"}</td>
      <td>${esc(r.detail ?? (r.result === "clear" ? "Not found on the screened lists." : ""))}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exclusion Screening Evidence — ${esc(d.orgName)} — ${esc(d.screenedDate)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14141f; margin: 0; padding: 28px; background: #fff; }
  header { border-bottom: 2px solid #14141f; padding-bottom: 12px; margin-bottom: 16px; }
  header .k { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
  header h1 { margin: 2px 0; font-size: 20px; }
  header .meta { color: #6b7280; font-size: 11px; }
  .method { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; background: #f9fafb; }
  .method dt { font-weight: 700; }
  .method .grid { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; }
  .summary { display: flex; gap: 10px; margin-bottom: 12px; }
  .pill { border: 1px solid #e5e7eb; border-radius: 999px; padding: 4px 12px; font-size: 12px; }
  .pill b { font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding: 5px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f2f4; vertical-align: top; }
  td.ok { color: #15803d; font-weight: 600; } td.flag { color: #b45309; font-weight: 700; }
  footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #6b7280; }
  @media print { body { padding: 0; } .noprint { display: none; } }
  .noprint { margin-bottom: 16px; } .btn { font: inherit; cursor: pointer; background: #14141f; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; }
</style></head>
<body>
  <div class="noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
  <header>
    <div class="k">Exclusion Screening — Evidence of Verification</div>
    <h1>${esc(d.orgName)}</h1>
    <div class="meta">Screening date ${esc(d.screenedDate)} · Generated ${esc(now.toLocaleString())} · Performed by ${esc(d.runBy)}</div>
  </header>

  <div class="method">
    <div class="grid">
      <dt>OIG-LEIE</dt><dd>Full downloadable database, <b>${d.leieCount.toLocaleString()}</b> records, retrieved ${esc(new Date(d.leieRetrievedAt).toLocaleString())} from ${esc(d.leieSource)}. Matched by last + first name, business name, and NPI.</dd>
      <dt>SAM.gov</dt><dd>${samLine}</dd>
      <dt>Method</dt><dd>Automated name/identifier match against the official list(s) above. A returned name is flagged as a <em>potential</em> match for human identity verification (DOB/NPI) — it is not treated as a confirmed exclusion.</dd>
    </div>
  </div>

  <div class="summary">
    <span class="pill">Subjects screened: <b>${d.rows.length}</b></span>
    <span class="pill">Clear: <b>${clears.length}</b></span>
    <span class="pill">Potential matches: <b>${matches.length}</b></span>
  </div>

  <table>
    <thead><tr><th>Subject</th><th>Type</th><th>Result</th><th>Detail</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <footer>
    This report is contemporaneous evidence that the named subjects were screened against the U.S. Department of Health &amp; Human Services OIG List of Excluded Individuals/Entities (LEIE)${d.samEnabled ? " and the SAM.gov exclusion database" : ""} on the date shown. Screening federal-program exclusions is expected at hire and monthly thereafter. <strong>Potential matches must be individually verified against the official record (by date of birth or NPI) before any adverse action; a name match alone is not a confirmed exclusion.</strong> Generated by Compliance Hub.
  </footer>
</body></html>`;
}

/** Open the evidence report in a print-ready window. Returns false if pop-ups are blocked. */
export function openScreeningEvidence(d: EvidenceInput): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(buildScreeningEvidenceHtml(d));
  win.document.close();
  return true;
}
