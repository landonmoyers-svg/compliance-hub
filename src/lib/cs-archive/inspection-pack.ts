"use client";

/**
 * Everything kept under one DEA registration, as one printable document.
 *
 * A DEA inspector comes to the address on the registration and asks the
 * registrant for the records kept under that number — including doses given
 * elsewhere, if they were ordered on it. Assembling that from several screens
 * while someone waits is the wrong thing to be doing, so this does it in one
 * action: the logs, what they reconcile to, what was recovered, and what is
 * genuinely missing.
 *
 * TWO DELIBERATE CHOICES.
 *
 * The gaps are IN the pack. A period with no records is stated plainly, with
 * its dates and what was done to try to recover it. An inspector finding a
 * hole you have already written down and worked on is a different conversation
 * from one finding a hole you appear not to have noticed.
 *
 * The pack carries NO patient identifiers. It is built from the de-identified
 * entries the Hub holds, so it can be printed, emailed or left on a desk
 * without becoming a disclosure. The identified pages live in SharePoint and
 * are produced separately, by someone with access, when actually asked for.
 */

import type { DeaRecord, DeaRegistration, RecordRecoveryItem } from "@/lib/data/schema";
import { buildChains } from "@/lib/cs-archive/amendments";
import { reconcile } from "@/lib/cs-archive/reconcile";
import { recoveryPicture } from "@/lib/cs-archive/recovery";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

export interface PackInput {
  registration: DeaRegistration;
  locationName: string;
  /** Every DEA record kept under this registration. */
  records: DeaRecord[];
  recovery: RecordRecoveryItem[];
  locationNameFor: (locationId: string | null | undefined) => string;
  preparedBy: string;
  /** Today, as yyyy-mm-dd — what an open registration is accounted for up to. */
  today: string;
}

const STYLE = `
  @page { size: letter; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 19pt; margin: 0 0 2mm; }
  h2 { font-size: 13pt; margin: 9mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1.5px solid #111; }
  h3 { font-size: 11pt; margin: 5mm 0 2mm; }
  .k { font-size: 8.5pt; letter-spacing: .09em; text-transform: uppercase; color: #555; }
  .muted { color: #555; }
  .meta { font-size: 9.5pt; color: #444; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.5pt; }
  th, td { border: 0.5px solid #bbb; padding: 1.6mm 2mm; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2mm 8mm; margin: 3mm 0 5mm; }
  .grid div { border-bottom: 0.5px dotted #bbb; padding-bottom: 1mm; font-size: 10pt; }
  .flag { border-left: 3px solid #b45309; background: #fff8ed; padding: 2.5mm 3mm; margin: 2mm 0; font-size: 9.5pt; }
  .ok { border-left: 3px solid #15803d; background: #f2fbf4; padding: 2.5mm 3mm; margin: 2mm 0; font-size: 9.5pt; }
  .note { font-size: 8.5pt; color: #444; margin-top: 2mm; }
  footer { margin-top: 10mm; padding-top: 3mm; border-top: 0.5px solid #bbb; font-size: 8.5pt; color: #555; }
  .break { page-break-before: always; }
  ul { margin: 1.5mm 0 0 5mm; padding: 0; }
  li { margin: 0.8mm 0; }
`;

export function buildInspectionPackHtml(input: PackInput): string {
  const { registration: reg, records, recovery, locationNameFor, preparedBy, today } = input;
  const generated = new Date().toLocaleString();

  const chains = buildChains(records);
  const current = chains.map((c) => c.current);
  const paperLogs = current.filter((r) => ["vial_log", "administration_log", "count_sheet"].includes(r.recordType));
  const otherRecords = current.filter((r) => !["vial_log", "administration_log", "count_sheet"].includes(r.recordType));

  /* ------------------------------------------------------------ header */

  const header = `
    <div class="k">DEA registration record pack</div>
    <h1>DEA ${esc(reg.deaNumber)}</h1>
    <div class="meta">${esc(reg.registrantName)} · ${esc(input.locationName)}</div>
    <div class="grid">
      <div><span class="k">Registrant</span><br>${esc(reg.registrantName)} (${reg.registrantType === "location" ? "the practice" : "individual"})</div>
      <div><span class="k">Registered address</span><br>${esc(input.locationName)}</div>
      <div><span class="k">In use</span><br>${day(reg.effectiveFrom)} – ${reg.retiredOn ? day(reg.retiredOn) : "present"}</div>
      <div><span class="k">Schedules</span><br>${esc(reg.schedules || "—")}</div>
      <div><span class="k">Prepared by</span><br>${esc(preparedBy)}</div>
      <div><span class="k">Generated</span><br>${esc(generated)}</div>
    </div>`;

  /* ------------------------------------------------------- the records */

  const logRows = paperLogs
    .slice()
    .sort((a, b) => (a.periodStart ?? a.recordDate ?? "").localeCompare(b.periodStart ?? b.recordDate ?? ""))
    .map((r) => {
      const result = reconcile(r.entries ?? [], { opening: r.openingBalance, closing: r.closingBalance });
      const balance = result.period.difference === null
        ? "not balanced"
        : result.period.balances ? "balances" : `off by ${result.period.difference > 0 ? "+" : ""}${result.period.difference}`;
      const usedAt = locationNameFor(r.locationId);
      const elsewhere = r.locationId && r.locationId !== reg.locationId;
      const chain = chains.find((c) => c.current.id === r.id);
      return `<tr>
        <td>${esc(r.periodStart && r.periodEnd ? `${day(r.periodStart)} – ${day(r.periodEnd)}` : day(r.recordDate))}</td>
        <td>${esc(r.recordType.replace(/_/g, " "))}${(chain?.superseded.length ?? 0) > 0 ? `<br><span class="muted">amended (${chain!.superseded.length} earlier version${chain!.superseded.length === 1 ? "" : "s"} retained)</span>` : ""}</td>
        <td>${esc(r.substanceName || "—")}</td>
        <td>${esc(usedAt)}${elsewhere ? '<br><span class="muted">ordered on this registration</span>' : ""}</td>
        <td>${esc(r.directedByName || "—")}</td>
        <td>${(r.entries ?? []).length}</td>
        <td>${esc(balance)}</td>
      </tr>`;
    })
    .join("");

  const logsSection = paperLogs.length
    ? `<table>
         <thead><tr><th>Period</th><th>Record</th><th>Substance</th><th>Where used</th><th>Directed by</th><th>Entries</th><th>Reconciliation</th></tr></thead>
         <tbody>${logRows}</tbody>
       </table>
       <p class="note">The full pages, which identify patients, are held in the practice's Microsoft 365 SharePoint under its Business Associate Agreement and are produced on request. This pack is built from the de-identified entries and carries no patient identifier.</p>`
    : `<p class="muted">No logs have been filed under this registration.</p>`;

  /* --------------------------------------------------- what doesn't add up */

  const issues = paperLogs.flatMap((r) => {
    const result = reconcile(r.entries ?? [], { opening: r.openingBalance, closing: r.closingBalance });
    const when = r.periodStart && r.periodEnd ? `${day(r.periodStart)} – ${day(r.periodEnd)}` : day(r.recordDate);
    return result.issues.map((i) => `<li><strong>${esc(when)}</strong> — ${esc(i)}</li>`);
  });

  const issuesSection = issues.length
    ? `<div class="flag"><strong>${issues.length} item${issues.length === 1 ? "" : "s"} to explain</strong><ul>${issues.join("")}</ul>
         <p class="note">A difference is not automatically a loss — a rounding convention, a partial vial or an unreadable row can account for one. Each is checked against the original page before being treated as a discrepancy.</p>
       </div>`
    : `<div class="ok">Every filed log reconciles, and no entry was left unreadable.</div>`;

  /* --------------------------------------------------------- the gaps */

  const kinds = ["purchase", "administration", "inventory", "destruction"] as const;
  const coverage = kinds.map((kind) => {
    const items = recovery.filter((i) => i.registrationId === reg.id && i.recordKind === kind);
    const picture = recoveryPicture(items, reg, today);
    if (!picture.whole) return "";
    const label = { purchase: "Purchases and receipts", administration: "Administration logs", inventory: "Inventories", destruction: "Destruction and disposal" }[kind];
    const body = picture.gaps.length === 0
      ? `<div class="ok">Complete for ${day(picture.whole.start)} – ${day(picture.whole.end)}.</div>`
      : `<div class="flag"><strong>No records held for:</strong><ul>${picture.gaps.map((g) => {
          const chased = picture.inFlight.some((f) => f.start <= g.end && f.end >= g.start);
          return `<li>${day(g.start)} – ${day(g.end)}${chased ? " — requested from the supplier, not yet received" : ""}</li>`;
        }).join("")}</ul></div>`;
    const notes = items.filter((i) => i.notes).map((i) => `<li>${esc(i.notes)}</li>`).join("");
    return `<h3>${esc(label)}</h3>${body}${notes ? `<ul class="note">${notes}</ul>` : ""}`;
  }).join("");

  /* ------------------------------------------------- other DEA records */

  const otherSection = otherRecords.length
    ? `<table>
         <thead><tr><th>Date</th><th>Record</th><th>Reference</th><th>Filed by</th></tr></thead>
         <tbody>${otherRecords
           .slice()
           .sort((a, b) => (b.recordDate ?? b.createdDate).localeCompare(a.recordDate ?? a.createdDate))
           .map((r) => `<tr><td>${day(r.recordDate)}</td><td>${esc(r.recordType.replace(/_/g, " "))}</td><td>${esc(r.referenceNumber || "—")}</td><td>${esc(r.filedByName || "—")}</td></tr>`)
           .join("")}</tbody>
       </table>`
    : `<p class="muted">No forms, orders or destruction records filed under this registration.</p>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>DEA ${esc(reg.deaNumber)} — record pack</title><style>${STYLE}</style></head>
<body onload="window.print()">
  ${header}

  <h2>Logs kept under this registration</h2>
  ${logsSection}

  <h2>Reconciliation</h2>
  ${issuesSection}

  <h2>Completeness of the record</h2>
  ${coverage || '<p class="muted">No recovery periods recorded for this registration.</p>'}

  <h2>Forms, orders and destructions</h2>
  ${otherSection}

  <footer>
    Generated from the practice's compliance records on ${esc(generated)} by ${esc(preparedBy)}.
    Pages identifying patients are held separately under the practice's Microsoft 365 agreement and produced on request.
    Where a period is shown as having no records, that is stated as found; recovery from the supplier is recorded above where it has been attempted.
  </footer>
</body></html>`;
}

/** Open the pack in a print-ready window. False when the browser blocked it. */
export function openInspectionPack(input: PackInput): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(buildInspectionPackHtml(input));
  win.document.close();
  return true;
}
