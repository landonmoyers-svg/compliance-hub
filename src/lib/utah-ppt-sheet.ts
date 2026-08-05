import type { InventoryItem } from "./data/schema";
import {
  pptValue, PPT_CLASSES, PPT_COUNTY_EXEMPTION_CENTS, SCHEDULE_YEAR,
  PPT_TAX_DUE, PPT_ASSESSMENT_DATE, type PptClass,
} from "./utah-ppt";

/**
 * Print-ready Utah Business Personal Property worksheet (Pub 20). Groups the
 * clinical inventory by location (≈ county), lists each TAXABLE item with its
 * class, acquisition year/cost and depreciated value, subtotals per location,
 * and flags whether each location is over the small-taxpayer exemption. This is
 * a worksheet to prepare the county Signed Statement — the county assessor's
 * figures govern.
 */

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const usd = (cents: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export function buildPptStatementHtml(
  items: InventoryItem[],
  locationName: (id: string | null | undefined) => string,
  orgName: string,
  assessmentYear = SCHEDULE_YEAR,
): string {
  const now = new Date();

  // Group by location.
  const byLoc = new Map<string, InventoryItem[]>();
  for (const it of items) {
    const key = it.locationId ?? "__none__";
    (byLoc.get(key) ?? byLoc.set(key, []).get(key)!).push(it);
  }

  let grandTaxable = 0;
  let exemptCount = 0;
  let needsInput = 0;

  const sections = [...byLoc.entries()].map(([key, list]) => {
    const locName = key === "__none__" ? "Unassigned location" : locationName(key);
    const rows: string[] = [];
    let subtotal = 0;
    let locExempt = 0;
    let locNeeds = 0;
    const sorted = [...list].sort((a, b) => a.itemName.localeCompare(b.itemName));
    for (const it of sorted) {
      const r = pptValue(it, assessmentYear);
      if (r.needsInput) { locNeeds++; needsInput++; }
      if (!r.taxable) { locExempt++; continue; }
      subtotal += r.fmvCents;
      rows.push(`<tr>
        <td>${esc(it.itemName)}${it.assetTag ? `<div class="sub">${esc(it.assetTag)}</div>` : ""}</td>
        <td>${esc(PPT_CLASSES[r.cls as PptClass].label)}</td>
        <td class="num">${esc(it.acquisitionYear ?? "—")}</td>
        <td class="num">${it.acquisitionCostCents != null ? usd(it.acquisitionCostCents) : "—"}</td>
        <td class="num">${r.percentGood != null ? Math.round(r.percentGood * 100) + "%" : "—"}</td>
        <td class="num strong">${usd(r.fmvCents)}</td>
      </tr>`);
    }
    grandTaxable += subtotal;
    exemptCount += locExempt;
    const over = subtotal > PPT_COUNTY_EXEMPTION_CENTS;
    const flag = over
      ? `<span class="over">Over the ${usd(PPT_COUNTY_EXEMPTION_CENTS)} exemption — a Signed Statement / tax is likely due.</span>`
      : `<span class="under">At/under the ${usd(PPT_COUNTY_EXEMPTION_CENTS)} exemption — apply for the small-taxpayer exemption on the county's Signed Statement.</span>`;
    return `<section>
      <h2>${esc(locName)}</h2>
      ${rows.length ? `<table class="items">
        <thead><tr><th>Item</th><th>Class</th><th>Yr acq.</th><th>Acq. cost</th><th>% good</th><th>Taxable value</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
        <tfoot><tr><td colspan="5" class="strong">Taxable subtotal (${rows.length} item${rows.length === 1 ? "" : "s"})</td><td class="num strong">${usd(subtotal)}</td></tr></tfoot>
      </table>` : `<p class="muted">No taxable items at this location.</p>`}
      <p class="note">${flag}${locExempt ? ` · ${locExempt} exempt item${locExempt === 1 ? "" : "s"}.` : ""}${locNeeds ? ` · <span class="warn">${locNeeds} classified item${locNeeds === 1 ? "" : "s"} missing cost/year — not counted.</span>` : ""}</p>
    </section>`;
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Personal Property Tax Worksheet — ${esc(orgName)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14141f; margin: 0; padding: 28px; background: #fff; }
  header { border-bottom: 2px solid #14141f; padding-bottom: 12px; margin-bottom: 16px; }
  header .k { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
  header h1 { margin: 2px 0; font-size: 20px; }
  header .meta { color: #6b7280; font-size: 11px; }
  section { margin-bottom: 18px; page-break-inside: avoid; }
  h2 { font-size: 14px; margin: 0 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding: 4px 8px; }
  table.items td { padding: 5px 8px; border-bottom: 1px solid #f1f2f4; vertical-align: top; }
  table.items tfoot td { border-top: 2px solid #14141f; border-bottom: 0; padding-top: 6px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 700; }
  .sub { color: #9ca3af; font-size: 10px; font-family: ui-monospace, monospace; }
  .muted { color: #9ca3af; }
  .note { font-size: 11px; margin: 6px 0 0; }
  .over { color: #b91c1c; font-weight: 600; } .under { color: #15803d; } .warn { color: #b45309; }
  .totals { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; margin: 4px 0 14px; background: #f9fafb; }
  footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #6b7280; }
  @media print { body { padding: 0; } .noprint { display: none; } }
  .noprint { margin-bottom: 16px; } .btn { font: inherit; cursor: pointer; background: #14141f; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; }
</style></head>
<body>
  <div class="noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
  <header>
    <div class="k">Business Personal Property — Utah Pub 20 Worksheet</div>
    <h1>${esc(orgName)}</h1>
    <div class="meta">${assessmentYear} assessment year · Generated ${esc(now.toLocaleString())}</div>
  </header>
  <div class="totals">
    <strong>Total estimated taxable value (all locations): ${usd(grandTaxable)}</strong>
    &nbsp;·&nbsp; ${exemptCount} exempt item${exemptCount === 1 ? "" : "s"}${needsInput ? ` ·&nbsp; <span class="warn">${needsInput} classified item${needsInput === 1 ? "" : "s"} missing cost/year</span>` : ""}
  </div>
  ${sections.join("")}
  <footer>
    <strong>How Utah taxes this:</strong> most tangible business personal property is assessed as of <strong>${PPT_ASSESSMENT_DATE}</strong> each year; the county sends a Signed Statement to complete; taxes are due <strong>${PPT_TAX_DUE}</strong>. Value = acquisition cost (incl. install, shipping, sales tax) × the Tax Commission's percent-good factor for the item's class and age. <strong>Exempt:</strong> supplies, inventory held for resale, items under $500 that aren't critical, and — per taxpayer per county — an aggregate taxable value at/under ${usd(PPT_COUNTY_EXEMPTION_CENTS)} (must apply). Non-filing penalty: $25 or 10% of tax due.
    <br><br>
    This worksheet is generated from the practice's inventory records using the ${assessmentYear} Recommended Personal Property Valuation Schedules (Admin Rule R884-24P-33) and is an <strong>estimate to help prepare the county Signed Statement</strong> — the county assessor's figures govern. Source: Utah State Tax Commission Publication 20.
  </footer>
</body></html>`;
}

/** Open the Pub 20 worksheet in a print-ready window. False if pop-ups blocked. */
export function openPptStatement(
  items: InventoryItem[],
  locationName: (id: string | null | undefined) => string,
  orgName: string,
  assessmentYear = SCHEDULE_YEAR,
): boolean {
  const html = buildPptStatementHtml(items, locationName, orgName, assessmentYear);
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
