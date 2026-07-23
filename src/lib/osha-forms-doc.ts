import type { OSHARecord } from "@/lib/data/schema";

/**
 * Generate COMPLETED, print-ready OSHA recordkeeping documents from the
 * practice's tracked cases — the 300 Log, the 300A annual Summary, and a
 * per-case 301 Incident Report. These are OSHA-equivalent forms (29 CFR 1904
 * allows equivalent forms that contain the same information), filled with the
 * real data and opened in a print / save-as-PDF window.
 */

export interface CaseRow extends OSHARecord { jobTitle?: string }

export interface EstablishmentInfo {
  name: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  year: string;
}

export interface Osha300aExtra extends EstablishmentInfo {
  naics?: string;
  annualAvgEmployees?: string;
  totalHoursWorked?: string;
  certifierName?: string;
  certifierTitle?: string;
  certifierPhone?: string;
  certifiedDate?: string;
}

export interface Osha301Extra {
  caseNumber?: string;
  completedByName?: string;
  completedByTitle?: string;
  completedByPhone?: string;
  completedDate?: string;
  employeeAddress?: string;
  employeeDob?: string;
  employeeHireDate?: string;
  employeeGender?: "" | "male" | "female";
  physicianName?: string;
  facilityName?: string;
  facilityAddress?: string;
  treatedInEr?: boolean;
  hospitalizedOvernight?: boolean;
  timeBeganWork?: string;
  timeOfEvent?: string;
  whatDoingBefore?: string;
  whatHappened?: string;
  injuryDescription?: string;
  objectSubstance?: string;
  dateOfInjury?: string;
  dateOfDeath?: string;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Fill-in value or an underlined blank so the printed form reads correctly. */
const val = (s: unknown): string => {
  const t = String(s ?? "").trim();
  return t ? esc(t) : `<span class="blank"></span>`;
};

const fmt = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString("en-US");
};

/** Which 300 outcome column (G–J) a case falls in. */
export function outcomeColumn(c: OSHARecord): "death" | "daysaway" | "restricted" | "other" {
  if (c.caseOutcome === "death") return "death";
  if (c.caseOutcome === "days_away") return "daysaway";
  if (c.caseOutcome === "restricted_transfer") return "restricted";
  if (c.caseOutcome === "other_recordable") return "other";
  // Infer from day counts when the outcome wasn't explicitly classified.
  if ((c.daysAway ?? 0) > 0) return "daysaway";
  if ((c.daysRestricted ?? 0) > 0) return "restricted";
  return "other";
}

/** Illness sub-type column (M2–M6); injuries use M1. */
function illnessType(c: OSHARecord): "injury" | "skin" | "resp" | "poison" | "hearing" | "other" {
  if (c.recordType === "injury") return "injury";
  const n = `${c.natureOfInjury ?? ""} ${c.bodyPart ?? ""}`.toLowerCase();
  if (/skin|derm|rash|contact/.test(n)) return "skin";
  if (/respir|lung|asthma|inhal|breath/.test(n)) return "resp";
  if (/poison|toxic|overdose|exposure/.test(n)) return "poison";
  if (/hearing|noise|tinnitus|audio/.test(n)) return "hearing";
  return "other";
}

export interface Osha300aTotals {
  cases: number;
  deaths: number; daysAwayCases: number; restrictedCases: number; otherCases: number;
  totalDaysAway: number; totalDaysRestricted: number;
  injuries: number; skin: number; respiratory: number; poisoning: number; hearing: number; otherIllness: number;
}

export function summarize300(cases: CaseRow[]): Osha300aTotals {
  const t: Osha300aTotals = {
    cases: cases.length, deaths: 0, daysAwayCases: 0, restrictedCases: 0, otherCases: 0,
    totalDaysAway: 0, totalDaysRestricted: 0,
    injuries: 0, skin: 0, respiratory: 0, poisoning: 0, hearing: 0, otherIllness: 0,
  };
  for (const c of cases) {
    switch (outcomeColumn(c)) {
      case "death": t.deaths++; break;
      case "daysaway": t.daysAwayCases++; break;
      case "restricted": t.restrictedCases++; break;
      case "other": t.otherCases++; break;
    }
    t.totalDaysAway += c.daysAway ?? 0;
    t.totalDaysRestricted += c.daysRestricted ?? 0;
    switch (illnessType(c)) {
      case "injury": t.injuries++; break;
      case "skin": t.skin++; break;
      case "resp": t.respiratory++; break;
      case "poison": t.poisoning++; break;
      case "hearing": t.hearing++; break;
      case "other": t.otherIllness++; break;
    }
  }
  return t;
}

const BASE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 11px/1.4 Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 24px; background: #fff; }
  h1 { font-size: 16px; margin: 0; }
  .sub { color: #444; font-size: 11px; margin: 2px 0 14px; }
  .est { border: 1px solid #111; padding: 8px 10px; margin-bottom: 12px; }
  .est div { margin: 1px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #333; padding: 4px 5px; vertical-align: top; text-align: left; }
  th { background: #f0f0f0; font-size: 10px; }
  .c { text-align: center; }
  .blank { display: inline-block; min-width: 90px; border-bottom: 1px solid #888; }
  .lbl { font-size: 10px; color: #444; }
  .sect { border: 1px solid #111; margin-bottom: 10px; }
  .sect h2 { font-size: 12px; margin: 0; background: #111; color: #fff; padding: 5px 8px; }
  .sect .body { padding: 8px 10px; }
  .row { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 3px 0; }
  .row .f { min-width: 45%; } .row .f.full { min-width: 100%; }
  footer { margin-top: 14px; font-size: 9px; color: #777; }
  .btnbar { margin-bottom: 14px; }
  .btn { font: inherit; cursor: pointer; background: #14141f; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; }
  @media print { body { padding: 0; } .noprint { display: none; } }
`;

function docShell(title: string, orientation: "portrait" | "landscape", inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>${BASE_CSS}
  @page { size: ${orientation}; margin: 12mm; }
</style></head><body>
  <div class="btnbar noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
  ${inner}
  <footer>Generated ${esc(new Date().toLocaleString())} from Compliance Hub records. OSHA-equivalent form under 29 CFR 1904 — verify entries before filing. Where a field is blank, complete it by hand.</footer>
</body></html>`;
}

/* ─────────────────────────── OSHA 300 Log ─────────────────────────── */

export function buildOsha300Html(cases: CaseRow[], est: EstablishmentInfo): string {
  const rows = cases.map((c, i) => {
    const col = outcomeColumn(c);
    const ill = illnessType(c);
    const x = (on: boolean) => (on ? '<td class="c">✕</td>' : "<td></td>");
    const desc = [c.natureOfInjury, c.bodyPart ? `— ${c.bodyPart}` : "", c.description ? `(${c.description})` : ""].filter(Boolean).join(" ");
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${val(c.injuredEmployeeName)}</td>
      <td>${val(c.jobTitle)}</td>
      <td class="c">${fmt(c.eventDate) || '<span class="blank"></span>'}</td>
      <td></td>
      <td>${esc(desc) || '<span class="blank"></span>'}</td>
      ${x(col === "death")}${x(col === "daysaway")}${x(col === "restricted")}${x(col === "other")}
      <td class="c">${c.daysAway ? esc(c.daysAway) : ""}</td>
      <td class="c">${c.daysRestricted ? esc(c.daysRestricted) : ""}</td>
      ${x(ill === "injury")}${x(ill === "skin")}${x(ill === "resp")}${x(ill === "poison")}${x(ill === "hearing")}${x(ill === "other")}
    </tr>`;
  }).join("");

  const inner = `
  <h1>OSHA Form 300 — Log of Work-Related Injuries and Illnesses</h1>
  <div class="sub">Year <b>${esc(est.year)}</b> · Attention: this form contains information relating to employee health and must be used in a manner that protects confidentiality.</div>
  <div class="est">
    <div><b>Establishment name:</b> ${val(est.name)}</div>
    <div><b>City / State:</b> ${val([est.city, est.state].filter(Boolean).join(", "))}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th rowspan="2">Case<br>no.</th><th rowspan="2">Employee's name</th><th rowspan="2">Job title</th>
        <th rowspan="2">Date of<br>injury/onset</th><th rowspan="2">Where the<br>event occurred</th>
        <th rowspan="2">Describe injury/illness, parts of body affected, object/substance</th>
        <th colspan="4" class="c">Classify the case (check one)</th>
        <th colspan="2" class="c">Days</th>
        <th colspan="6" class="c">Injury / illness type (check one)</th>
      </tr>
      <tr>
        <th class="c">(G)<br>Death</th><th class="c">(H)<br>Days away</th><th class="c">(I)<br>Job transfer/<br>restriction</th><th class="c">(J)<br>Other</th>
        <th class="c">(K)<br>Away</th><th class="c">(L)<br>Restr.</th>
        <th class="c">(1)<br>Injury</th><th class="c">(2)<br>Skin</th><th class="c">(3)<br>Resp.</th><th class="c">(4)<br>Poison.</th><th class="c">(5)<br>Hearing</th><th class="c">(6)<br>Other ill.</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="18" class="c" style="padding:16px;color:#777">No recordable injuries or illnesses recorded for ${esc(est.year)}.</td></tr>`}
    </tbody>
  </table>`;
  return docShell(`OSHA 300 Log ${est.year}`, "landscape", inner);
}

/* ─────────────────────────── OSHA 300A Summary ─────────────────────────── */

export function buildOsha300aHtml(cases: CaseRow[], x: Osha300aExtra): string {
  const t = summarize300(cases);
  const box = (label: string, n: number | string) => `
    <td class="c" style="width:9%"><div style="font-size:16px;font-weight:700">${esc(n)}</div><div class="lbl">${esc(label)}</div></td>`;
  const inner = `
  <h1>OSHA Form 300A — Summary of Work-Related Injuries and Illnesses</h1>
  <div class="sub">Year <b>${esc(x.year)}</b> · Post from February 1 to April 30 of the following year, even if there were no cases.</div>
  <div class="est">
    <div><b>Establishment name:</b> ${val(x.name)}</div>
    <div><b>Street:</b> ${val(x.street)}</div>
    <div><b>City / State / ZIP:</b> ${val([x.city, x.state, x.zip].filter(Boolean).join(", "))}</div>
    <div><b>Industry (NAICS):</b> ${val(x.naics)} &nbsp; <b>Annual avg. # employees:</b> ${val(x.annualAvgEmployees)} &nbsp; <b>Total hours worked:</b> ${val(x.totalHoursWorked)}</div>
  </div>

  <p style="font-weight:700;margin:10px 0 4px">Number of cases</p>
  <table><tr>
    ${box("Total deaths (G)", t.deaths)}
    ${box("Cases w/ days away (H)", t.daysAwayCases)}
    ${box("Cases w/ job transfer or restriction (I)", t.restrictedCases)}
    ${box("Other recordable cases (J)", t.otherCases)}
  </tr></table>

  <p style="font-weight:700;margin:10px 0 4px">Number of days</p>
  <table><tr>
    ${box("Total days away from work (K)", t.totalDaysAway)}
    ${box("Total days of job transfer or restriction (L)", t.totalDaysRestricted)}
  </tr></table>

  <p style="font-weight:700;margin:10px 0 4px">Injury and illness types — total number of…</p>
  <table><tr>
    ${box("(M1) Injuries", t.injuries)}
    ${box("(M2) Skin disorders", t.skin)}
    ${box("(M3) Respiratory", t.respiratory)}
    ${box("(M4) Poisonings", t.poisoning)}
    ${box("(M5) Hearing loss", t.hearing)}
    ${box("(M6) All other illnesses", t.otherIllness)}
  </tr></table>

  <div class="est" style="margin-top:12px">
    <p style="font-weight:700;margin:0 0 6px">Sign here — Knowingly falsifying this document may result in a fine.</p>
    <p style="margin:0 0 8px" class="lbl">I certify that I have examined this document and that to the best of my knowledge the entries are true, accurate, and complete.</p>
    <div class="row"><div class="f"><b>Company executive:</b> ${val(x.certifierName)}</div><div class="f"><b>Title:</b> ${val(x.certifierTitle)}</div></div>
    <div class="row"><div class="f"><b>Phone:</b> ${val(x.certifierPhone)}</div><div class="f"><b>Date:</b> ${val(x.certifiedDate)}</div></div>
  </div>`;
  return docShell(`OSHA 300A Summary ${x.year}`, "portrait", inner);
}

/* ─────────────────────────── OSHA 301 Incident Report ─────────────────────────── */

export function buildOsha301Html(c: CaseRow, x: Osha301Extra): string {
  const gender = x.employeeGender === "male" ? "☑ Male ☐ Female" : x.employeeGender === "female" ? "☐ Male ☑ Female" : "☐ Male ☐ Female";
  const yn = (b?: boolean) => (b === true ? "☑ Yes ☐ No" : b === false ? "☐ Yes ☑ No" : "☐ Yes ☐ No");
  const injuryDesc = x.injuryDescription || [c.natureOfInjury, c.bodyPart ? `— ${c.bodyPart}` : ""].filter(Boolean).join(" ");
  const inner = `
  <h1>OSHA Form 301 — Injury and Illness Incident Report</h1>
  <div class="sub">This is one of the first forms you must fill out when a recordable work-related injury or illness has occurred. Complete within 7 calendar days.</div>
  <div class="est"><div class="row"><div class="f"><b>Case number (from the 300 Log):</b> ${val(x.caseNumber)}</div><div class="f"><b>Completed by:</b> ${val(x.completedByName)}</div></div>
    <div class="row"><div class="f"><b>Title:</b> ${val(x.completedByTitle)}</div><div class="f"><b>Phone:</b> ${val(x.completedByPhone)}</div><div class="f"><b>Date completed:</b> ${val(x.completedDate)}</div></div></div>

  <div class="sect"><h2>Information about the employee</h2><div class="body">
    <div class="row"><div class="f full"><b>Full name:</b> ${val(c.injuredEmployeeName)}</div></div>
    <div class="row"><div class="f full"><b>Street / City / State / ZIP:</b> ${val(x.employeeAddress)}</div></div>
    <div class="row"><div class="f"><b>Date of birth:</b> ${val(x.employeeDob)}</div><div class="f"><b>Date hired:</b> ${val(x.employeeHireDate)}</div><div class="f"><b>Sex:</b> ${gender}</div></div>
  </div></div>

  <div class="sect"><h2>Information about the physician or other health care professional</h2><div class="body">
    <div class="row"><div class="f full"><b>Name of health care professional:</b> ${val(x.physicianName || c.physicianName)}</div></div>
    <div class="row"><div class="f full"><b>If treatment was given away from the worksite, facility &amp; address:</b> ${val([x.facilityName, x.facilityAddress].filter(Boolean).join(" — "))}</div></div>
    <div class="row"><div class="f"><b>Was employee treated in an emergency room?</b> ${yn(x.treatedInEr)}</div><div class="f"><b>Hospitalized overnight as an in-patient?</b> ${yn(x.hospitalizedOvernight)}</div></div>
  </div></div>

  <div class="sect"><h2>Information about the case</h2><div class="body">
    <div class="row"><div class="f"><b>Date of injury or illness:</b> ${val(x.dateOfInjury || fmt(c.eventDate))}</div><div class="f"><b>Time employee began work:</b> ${val(x.timeBeganWork)}</div><div class="f"><b>Time of event:</b> ${val(x.timeOfEvent)}</div></div>
    <div class="row"><div class="f full"><b>What was the employee doing just before the incident?</b><br>${val(x.whatDoingBefore)}</div></div>
    <div class="row"><div class="f full"><b>What happened? How did the injury occur?</b><br>${val(x.whatHappened || c.description)}</div></div>
    <div class="row"><div class="f full"><b>What was the injury or illness? (parts of body affected)</b><br>${val(injuryDesc)}</div></div>
    <div class="row"><div class="f full"><b>What object or substance directly harmed the employee?</b><br>${val(x.objectSubstance)}</div></div>
    <div class="row"><div class="f"><b>If the employee died, date of death:</b> ${val(x.dateOfDeath)}</div></div>
  </div></div>`;
  return docShell(`OSHA 301 — ${c.injuredEmployeeName || "case"}`, "portrait", inner);
}

/** Open a generated document in a print-ready window. Returns false if blocked. */
export function openPrint(html: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
