import type { SDSRecord } from "./data/schema";

/**
 * One-click "full SDS" export: renders a complete, GHS 16-section Safety Data
 * Sheet layout from a stored SDS record, in a print/save-as-PDF window. Sections
 * we hold real data for are filled; the rest carry a clear "refer to the
 * manufacturer's SDS" note so the printout is honest about what's on file.
 *
 * The same section renderer powers the per-location MSDS binder — one document
 * that contains every product stocked at a site, so a location's full binder
 * prints in a single click (OSHA HazCom requires SDSs be readily accessible at
 * each workplace).
 */

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Turn a multi-line field into <li> items, or a placeholder when empty. */
function lines(v: string | null | undefined, placeholder: string): string {
  const items = (v ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (items.length === 0) return `<p class="muted">${esc(placeholder)}</p>`;
  return `<ul>${items.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

const REFER = "Refer to the manufacturer's Safety Data Sheet for this section.";

const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14141f; margin: 0; padding: 28px; background: #fff; }
  header { border-bottom: 2px solid #14141f; padding-bottom: 12px; margin-bottom: 16px; }
  header .k { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
  header h1 { margin: 2px 0; font-size: 20px; }
  header .meta { color: #6b7280; font-size: 11px; }
  section { margin-bottom: 14px; page-break-inside: avoid; }
  h2 { font-size: 13px; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
  h2 .num { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; border-radius: 5px; background: #14141f; color: #fff; font-size: 11px; }
  .lbl { font-weight: 600; margin: 8px 0 2px; font-size: 11px; color: #374151; }
  table.kv { width: 100%; border-collapse: collapse; }
  table.kv th { text-align: left; width: 190px; color: #6b7280; font-weight: 600; vertical-align: top; padding: 3px 8px 3px 0; }
  table.kv td { padding: 3px 0; }
  ul { margin: 2px 0; padding-left: 18px; }
  .muted { color: #9ca3af; }
  .signal { display: inline-block; font-weight: 700; padding: 1px 8px; border-radius: 4px; font-size: 11px; }
  .signal.danger { background: #fef2f2; color: #b91c1c; } .signal.warning { background: #fffbeb; color: #b45309; } .signal.caution { background: #eff6ff; color: #1d4ed8; }
  footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; }
  /* Binder-specific */
  .cover { page-break-after: always; }
  .cover h1 { font-size: 26px; margin: 4px 0; }
  .toc { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
  .toc th { text-align: left; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding: 4px 8px; font-weight: 600; }
  .toc td { padding: 4px 8px; border-bottom: 1px solid #f1f2f4; }
  .sheet { page-break-before: always; }
  .sheet:first-of-type { page-break-before: avoid; }
  @media print { body { padding: 0; } .noprint { display: none; } }
  .noprint { margin-bottom: 16px; } .btn { font: inherit; cursor: pointer; background: #14141f; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; }
`;

const signalCell = (sw: SDSRecord["signalWord"]): string =>
  sw && sw !== "NONE" ? `<span class="signal ${sw.toLowerCase()}">${esc(sw)}</span>` : '<span class="muted">None</span>';

/** The 16 GHS sections for a single record (header + sections, no page shell). */
function recordSectionsHtml(r: SDSRecord, generatedAt: Date): string {
  const section = (n: number, title: string, body: string) =>
    `<section><h2><span class="num">${n}</span> ${esc(title)}</h2>${body}</section>`;

  const idBody = `
    <table class="kv">
      <tr><th>Product name</th><td>${esc(r.productName)}</td></tr>
      <tr><th>Manufacturer / supplier</th><td>${esc(r.manufacturer || "—")}</td></tr>
      <tr><th>Product code / UPC</th><td>${esc(r.upc || "—")}</td></tr>
      <tr><th>CAS number</th><td>${esc(r.casNumber || "—")}</td></tr>
      <tr><th>Emergency contact</th><td>[emergency phone — fill in]</td></tr>
    </table>`;

  const hazardBody = `
    <table class="kv">
      <tr><th>Signal word</th><td>${signalCell(r.signalWord)}</td></tr>
    </table>
    <p class="lbl">Hazard summary</p>${r.hazardSummary ? `<p>${esc(r.hazardSummary)}</p>` : `<p class="muted">Not classified as hazardous, or not specified.</p>`}
    <p class="lbl">Hazard (H) statements</p>${lines(r.hazardStatements, "None on file.")}`;

  return `
  <header>
    <div class="k">Safety Data Sheet (GHS / OSHA HazCom 29 CFR 1910.1200)</div>
    <h1>${esc(r.productName)}</h1>
    <div class="meta">${esc(r.manufacturer || "")}${r.casNumber ? ` · CAS ${esc(r.casNumber)}` : ""} · SDS revision ${esc(r.revisionDate || "not specified")} · Generated ${esc(generatedAt.toLocaleDateString())}</div>
  </header>
  ${section(1, "Identification", idBody)}
  ${section(2, "Hazard(s) identification", hazardBody)}
  ${section(3, "Composition / information on ingredients", r.casNumber ? `<table class="kv"><tr><th>CAS number</th><td>${esc(r.casNumber)}</td></tr></table>` : `<p class="muted">${REFER}</p>`)}
  ${section(4, "First-aid measures", lines(r.firstAid, REFER))}
  ${section(5, "Fire-fighting measures", `<p class="muted">${REFER}</p>`)}
  ${section(6, "Accidental release measures", `<p class="muted">${REFER}</p>`)}
  ${section(7, "Handling and storage", lines(r.handling, REFER))}
  ${section(8, "Exposure controls / personal protection", r.ppe ? `<p class="lbl">PPE</p>${lines(r.ppe, REFER)}` : `<p class="muted">${REFER}</p>`)}
  ${section(9, "Physical and chemical properties", `<p class="muted">${REFER}</p>`)}
  ${section(10, "Stability and reactivity", `<p class="muted">${REFER}</p>`)}
  ${section(11, "Toxicological information", `<p class="muted">${REFER}</p>`)}
  ${section(12, "Ecological information", `<p class="muted">${REFER}</p>`)}
  ${section(13, "Disposal considerations", `<p class="muted">${REFER}</p>`)}
  ${section(14, "Transport information", `<p class="muted">${REFER}</p>`)}
  ${section(15, "Regulatory information", `<p class="muted">OSHA Hazard Communication Standard (29 CFR 1910.1200). ${REFER}</p>`)}
  ${section(16, "Other information", `<table class="kv"><tr><th>SDS revision date</th><td>${esc(r.revisionDate || "not specified")}</td></tr><tr><th>Record status</th><td>${esc(r.status)}</td></tr></table>`)}`;
}

function docShell(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLE}</style></head>
<body>
  <div class="noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
  ${inner}
</body></html>`;
}

export function buildSdsSheetHtml(r: SDSRecord): string {
  const now = new Date();
  const inner = `${recordSectionsHtml(r, now)}
  <footer>
    Generated from the practice's SDS record for ${esc(r.productName)} on ${esc(now.toLocaleString())}. Where a section says to refer to the manufacturer's SDS, the authoritative document (if attached) is the source of record. This layout aids access and posting; it does not replace the manufacturer's SDS.
  </footer>`;
  return docShell(`SDS — ${r.productName}`, inner);
}

/** Open the full SDS in a print-ready window. Returns false if pop-ups blocked. */
export function openSdsSheet(r: SDSRecord): boolean {
  const html = buildSdsSheetHtml(r);
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

/**
 * A full MSDS binder for a location (or the whole facility): a cover page with a
 * table of contents, then every product's 16-section sheet back to back, each
 * starting on a new page. One click prints the entire binder.
 */
export function buildSdsBinderHtml(records: SDSRecord[], binderTitle: string): string {
  const now = new Date();
  const sorted = [...records].sort((a, b) => a.productName.localeCompare(b.productName));

  const toc = sorted.length
    ? `<table class="toc">
        <thead><tr><th style="width:32px">#</th><th>Product</th><th>Manufacturer</th><th>Signal</th></tr></thead>
        <tbody>${sorted.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.productName)}</td><td>${esc(r.manufacturer || "—")}</td><td>${signalCell(r.signalWord)}</td></tr>`).join("")}</tbody>
       </table>`
    : `<p class="muted">No SDS records for this location yet.</p>`;

  const cover = `
    <div class="cover">
      <header>
        <div class="k">Master Safety Data Sheet Binder · OSHA HazCom 29 CFR 1910.1200</div>
        <h1>${esc(binderTitle)}</h1>
        <div class="meta">${sorted.length} product${sorted.length === 1 ? "" : "s"} · Generated ${esc(now.toLocaleString())}</div>
      </header>
      <p class="lbl">Contents</p>
      ${toc}
      <footer>
        This binder is generated from the practice's SDS records for the products stocked at this location. Where a product sheet says to refer to the manufacturer's SDS, the attached manufacturer document (if any) is the source of record. Keep this binder readily accessible to all staff at this workplace.
      </footer>
    </div>`;

  const sheets = sorted
    .map((r) => `<div class="sheet">${recordSectionsHtml(r, now)}</div>`)
    .join("");

  return docShell(binderTitle, `${cover}${sheets}`);
}

/** Open a location's full MSDS binder in a print-ready window. False if blocked. */
export function openSdsBinder(records: SDSRecord[], binderTitle: string): boolean {
  const html = buildSdsBinderHtml(records, binderTitle);
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
