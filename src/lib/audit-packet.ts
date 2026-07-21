import type { CredentialRecord, InsurancePolicyRecord } from "./data/schema";
import { credentialStatus } from "./compliance";
import { summarizeRequirements, PROVIDER_TYPE_LABEL, type ProviderType } from "./credential-requirements";
import { formatDate } from "./dates";
import { humanizeLabel } from "./format";

/**
 * Per-person "audit packet": a print-friendly compliance binder summarizing
 * everything a surveyor/auditor asks for on one clinician — requirement status,
 * credentials, insurance, training, competencies, and policy acknowledgments —
 * in a single self-contained HTML document the user can print or save as PDF.
 *
 * It is an INDEX/summary, not the files themselves: the source documents live in
 * the vault (signed URLs expire and wouldn't survive a print-to-PDF), so each
 * row records whether a document is on file rather than embedding it.
 */

export interface PacketTraining { moduleTitle: string; status: string; score?: number | null; dueDate?: string | null }
export interface PacketCompetency { competencyName: string; competencyType: string; status: string }
export interface PacketAck { documentTitle: string; status: string; acknowledgedAt?: string | null }

export interface PacketInput {
  name: string;
  providerType: ProviderType;
  orgName?: string;
  creds: CredentialRecord[];
  insurance: InsurancePolicyRecord[];
  training: PacketTraining[];
  competencies: PacketCompetency[];
  acks: PacketAck[];
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const statusLabel = (s: ReturnType<typeof credentialStatus>): string =>
  s === "no_expiry" ? "No expiry" : humanizeLabel(s);

const onFile = (url?: string | null): string =>
  url ? '<span class="chip ok">On file</span>' : '<span class="chip warn">No file</span>';

/** Build the packet as a complete, self-contained HTML document string. */
export function buildPacketHtml(input: PacketInput): string {
  const { name, providerType, orgName, creds, insurance, training, competencies, acks } = input;
  const generated = new Date();
  const summary = summarizeRequirements(providerType, creds, insurance);
  const hasReqs = providerType !== "none" && summary.total > 0;

  const reqRows = summary.results
    .map((r) => {
      const cls = r.status === "met" ? "ok" : r.status === "expired" ? "warn" : "bad";
      const label = r.status === "met" ? "Current" : r.status === "expired" ? "Expired" : "Missing";
      return `<tr><td>${esc(r.label)}</td><td><span class="chip ${cls}">${label}</span></td><td class="muted">${esc(r.note ?? "")}</td></tr>`;
    })
    .join("");

  const credRows = creds
    .map((c) => {
      const st = credentialStatus(c);
      const cls = st === "active" || st === "no_expiry" ? "ok" : st === "expiring_soon" ? "warn" : st === "expired" ? "bad" : "";
      return `<tr>
        <td>${esc(c.credentialName)}</td>
        <td class="muted">${esc(humanizeLabel(c.credentialType ?? ""))}</td>
        <td class="muted">${esc(c.issuingBody ?? "")}</td>
        <td class="muted">${esc(c.credentialNumber ?? "")}</td>
        <td class="muted">${c.issueDate ? esc(formatDate(c.issueDate)) : "—"}</td>
        <td class="muted">${c.expirationDate ? esc(formatDate(c.expirationDate)) : "—"}</td>
        <td><span class="chip ${cls}">${esc(statusLabel(st))}</span></td>
        <td>${onFile(c.documentUrl)}</td>
      </tr>`;
    })
    .join("");

  const insRows = insurance
    .map((p) => `<tr>
        <td>${esc(p.policyName)}</td>
        <td class="muted">${esc(humanizeLabel(p.policyType ?? ""))}</td>
        <td class="muted">${esc(p.carrierName ?? "")}</td>
        <td class="muted">${esc(p.policyNumber ?? "")}</td>
        <td class="muted">${p.renewalDate ? esc(formatDate(p.renewalDate)) : "—"}</td>
        <td>${onFile(p.documentUrl)}</td>
      </tr>`)
    .join("");

  const trainRows = training
    .map((a) => `<tr>
        <td>${esc(a.moduleTitle)}</td>
        <td class="muted">${a.dueDate ? "Due " + esc(formatDate(a.dueDate)) : "—"}</td>
        <td>${a.status === "completed" ? `<span class="chip ok">Completed${a.score != null ? " · " + esc(a.score) + "%" : ""}</span>` : `<span class="chip warn">${esc(humanizeLabel(a.status))}</span>`}</td>
      </tr>`)
    .join("");

  const compRows = competencies
    .map((c) => {
      const cls = c.status === "passed" ? "ok" : c.status === "failed" || c.status === "expired" ? "bad" : "warn";
      return `<tr><td>${esc(c.competencyName)}</td><td class="muted">${esc(humanizeLabel(c.competencyType ?? ""))}</td><td><span class="chip ${cls}">${esc(humanizeLabel(c.status))}</span></td></tr>`;
    })
    .join("");

  const ackRows = acks
    .map((a) => `<tr><td>${esc(a.documentTitle)}</td><td class="muted">${a.acknowledgedAt ? esc(formatDate(a.acknowledgedAt)) : "—"}</td><td><span class="chip ${a.status === "acknowledged" ? "ok" : "warn"}">${esc(humanizeLabel(a.status))}</span></td></tr>`)
    .join("");

  const section = (title: string, cols: string[], rows: string, count: number) =>
    count === 0
      ? ""
      : `<section>
          <h2>${esc(title)} <span class="count">${count}</span></h2>
          <table>
            <thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;

  const reqBanner = hasReqs
    ? `<div class="banner ${summary.gaps.length === 0 ? "ok" : "bad"}">
        ${summary.met}/${summary.total} required credentials current
        ${summary.gaps.length > 0 ? ` · <strong>${summary.gaps.length} gap${summary.gaps.length === 1 ? "" : "s"}</strong>: ${esc(summary.gaps.map((g) => g.label).join(", "))}` : " · all requirements met"}
      </div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Compliance Packet — ${esc(name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 32px; background: #fff; }
  header { border-bottom: 2px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 20px; }
  header .org { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
  header h1 { margin: 4px 0 2px; font-size: 22px; }
  header .meta { color: #6b7280; font-size: 12px; }
  .banner { margin: 16px 0 24px; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
  .banner.ok { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
  .banner.bad { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  section { margin-bottom: 24px; page-break-inside: avoid; }
  h2 { font-size: 14px; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
  h2 .count { font-size: 11px; font-weight: 600; color: #6b7280; background: #f3f4f6; border-radius: 999px; padding: 1px 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding: 6px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid #f1f2f4; vertical-align: top; }
  .muted { color: #6b7280; }
  .chip { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
  .chip.ok { background: #ecfdf5; color: #065f46; }
  .chip.warn { background: #fffbeb; color: #92400e; }
  .chip.bad { background: #fef2f2; color: #991b1b; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
  @media print { body { padding: 0; } .noprint { display: none; } }
  .noprint { margin-bottom: 20px; }
  .btn { font: inherit; cursor: pointer; background: #1a1a2e; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; }
</style>
</head>
<body>
  <div class="noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
  <header>
    <div class="org">${esc(orgName || "Compliance Hub")}</div>
    <h1>${esc(name)}</h1>
    <div class="meta">${esc(PROVIDER_TYPE_LABEL[providerType])} · Generated ${esc(generated.toLocaleString())}</div>
  </header>
  ${reqBanner}
  ${hasReqs ? `<section>
    <h2>Requirement checklist <span class="count">${summary.met}/${summary.total}</span></h2>
    <table><thead><tr><th>Requirement</th><th>Status</th><th>Detail</th></tr></thead><tbody>${reqRows}</tbody></table>
  </section>` : ""}
  ${section("Credentials & licenses", ["Name", "Type", "Issuing body", "Number", "Issued", "Expires", "Status", "Document"], credRows, creds.length)}
  ${section("Insurance", ["Policy", "Type", "Carrier", "Number", "Renews", "Document"], insRows, insurance.length)}
  ${section("Training", ["Module", "Due", "Status"], trainRows, training.length)}
  ${section("Competencies", ["Competency", "Type", "Status"], compRows, competencies.length)}
  ${section("Policy acknowledgments", ["Policy", "Acknowledged", "Status"], ackRows, acks.length)}
  <footer>
    Compliance records packet for ${esc(name)} — a point-in-time summary generated ${esc(generated.toLocaleDateString())}.
    Source documents are retained in the practice's vault. "No file" indicates a record exists without an attached document.
  </footer>
</body>
</html>`;
}

/** Open the packet in a new window ready to print / save as PDF.
 *  Returns false if the browser blocked the pop-up so callers can surface it. */
export function openPacket(input: PacketInput): boolean {
  const html = buildPacketHtml(input);
  const win = window.open("", "_blank");
  if (!win) return false; // popup blocked
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
