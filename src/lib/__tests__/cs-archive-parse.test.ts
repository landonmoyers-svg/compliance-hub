import { fullRecordCsv, hubSafe, parsePage, parseRow, splitIdentifiers } from "../cs-archive/parse-entries";

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

// A chart number is kept for the DEA record and kept out of the Hub copy.
const split = splitIdentifiers("3/14/24  M1A7  administered 50 mg  MRN 4482910  LM/RN witness BB");
chk("chart id pulled out", split.identifiers.length, 1);
chk("chart id gone from the hub text", /4482910/.test(split.clean), false);
chk("the rest survives", /M1A7/.test(split.clean) && /administered/.test(split.clean), true);

// A typical administration row
const row = parseRow("3/14/24  M1A7  administered 50 mg  Jane ID 55231  staff LM", { defaultYear: 2024 })!;
chk("date", row.entry.date, "2024-03-14");
chk("vial", row.entry.vialLabel, "M1A7");
chk("action", row.entry.action, "administered");
chk("amount", row.entry.amount, 50);
chk("unit", row.entry.unit, "mg");
chk("identifier captured for SharePoint", row.identifiers.length, 1);
chk("no identifier on the hub entry", JSON.stringify(row.entry).includes("55231"), false);

// Waste, older dashed vial, two-digit year
const waste = parseRow("12/2/23 L-A3 wasted 2.5 mL witnessed by RN", { defaultYear: 2023 })!;
chk("waste action", waste.entry.action, "wasted");
chk("older vial label", waste.entry.vialLabel, "L-A3");
chk("decimal amount", waste.entry.amount, 2.5);
chk("date with 2-digit year", waste.entry.date, "2023-12-02");

// A row with no year uses the log's period
chk("bare date takes the default year", parseRow("3/14 M1B2 administered 25 mg", { defaultYear: 2022 })!.entry.date, "2022-03-14");

// Non-log lines are skipped, and unreadable rows are flagged not guessed
chk("header row skipped", parseRow("Date      Vial      Amount      Staff"), null);
chk("page number skipped", parseRow("Page 3 of 7"), null);
const vague = parseRow("3/14/24  M1A7", { defaultYear: 2024 })!;
chk("missing amount is flagged", vague.flags.some((f) => f.includes("amount")), true);
chk("missing action is flagged", vague.flags.some((f) => f.includes("action")), true);
chk("confidence reflects what was found", vague.confidence, 0.5);

// A known vial label is recognised even when the pattern would miss it
chk("known vial matched", parseRow("3/14/24 m1a7 given 50mg", { knownVials: ["M1A7"], defaultYear: 2024 })!.entry.vialLabel, "M1A7");

// Whole page
const page = parsePage([
  "Ketamine administration log — Clinic 1",
  "Date  Vial  Amount  Patient  Staff",
  "3/14/24  M1A7  administered 50 mg  MRN 4482910  LM",
  "3/14/24  M1A7  wasted 25 mg  LM  witness BB",
  "Page 1",
], { defaultYear: 2024 });
chk("two log rows found", page.length, 2);
chk("hub copy carries no identifiers", hubSafe(page), true);

// The SharePoint record keeps the chart id
const csvOut = fullRecordCsv(page, "clinic1-2024-03");
chk("full record has the chart id", csvOut.includes("4482910"), true);
chk("full record header names the patient column", csvOut.split("\n")[0].includes("patient_chart_id"), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
