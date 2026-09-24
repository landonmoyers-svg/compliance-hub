import { archiveFolderName, folderLabel, inboxFileName, libraryFromUrl, parseInboxFileName, sanitize } from "../cs-archive/archive-names";

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

// The folder is named for the period the log covers, so it sorts by when the
// log happened rather than when somebody got round to filing it.
chk("folder label from the period", folderLabel({
  locationName: "Murray Clinic 2", substanceName: "Ketamine", recordTypeLabel: "Administration log",
  periodStart: "2024-03-01", periodEnd: "2024-03-31",
}), "2024-03 Murray Clinic 2 Ketamine administration log");

// Murray and Lehi are separate registrations keeping separate logs. Two logs
// for the same month must never resolve to the same folder.
const murray = folderLabel({ locationName: "Murray Clinic 2", substanceName: "Ketamine", recordTypeLabel: "Vial log", periodStart: "2024-05-01" });
const lehi = folderLabel({ locationName: "Lehi Clinic", substanceName: "Ketamine", recordTypeLabel: "Vial log", periodStart: "2024-05-01" });
chk("the two clinics never share a folder", murray === lehi, false);
chk("and each names its own clinic", [murray, lehi], ["2024-05 Murray Clinic 2 Ketamine vial log", "2024-05 Lehi Clinic Ketamine vial log"]);

chk("falls back to the record date", folderLabel({
  locationName: "Lehi Clinic", substanceName: "Ketamine", recordTypeLabel: "Vial log", recordDate: "2023-11-14",
}), "2023-11 Lehi Clinic Ketamine vial log");

chk("survives a missing substance and clinic", folderLabel({
  recordTypeLabel: "Count sheet", recordDate: "2024-01-02",
}), "2024-01 Controlled substance count sheet");

// SharePoint refuses these, and our own separator would break the parse.
chk("illegal characters are removed", sanitize('Keta/mine: "50%" #1'), "Keta-mine- -50- -1");
chk("the separator can't appear inside a part", sanitize("a__b"), "a-b");

// Round trip: what the browser writes is what the flow reads.
const key = "a3f1c8d2";
const label = "2024-03 Ketamine administration log";
const library = "Clinic 2 Archive";
const upload = inboxFileName(key, library, label, "page-1.jpg");
chk("upload name carries its destination", upload,
  "a3f1c8d2__Clinic 2 Archive__2024-03 Ketamine administration log__page-1.jpg");

const parsed = parseInboxFileName(upload)!;
chk("the flow reads the key back", parsed.archiveKey, key);
chk("and which archive", parsed.archiveLibrary, library);
chk("and the folder", parsed.folderLabel, label);
chk("and the original filename", parsed.fileName, "page-1.jpg");
chk("and where it goes", parsed.archivePath, "2024-03 Ketamine administration log [a3f1c8d2]/page-1.jpg");

chk("folder name pairs the label with the key", archiveFolderName(key, label), "2024-03 Ketamine administration log [a3f1c8d2]");

// An amendment reuses its parent's key, so it lands in the same folder.
const amendment = parseInboxFileName(inboxFileName(key, library, label, "amendment-page-1.jpg"))!;
chk("an amendment lands beside the original",
  amendment.archivePath.split("/")[0], parsed.archivePath.split("/")[0]);

// Underscores in the original filename must not confuse the parse.
const odd = parseInboxFileName(inboxFileName(key, library, label, "scan__final_v2.jpg"))!;
chk("a filename containing the separator still parses", odd.fileName, "scan-final_v2.jpg");

// Anything that doesn't carry a destination is left alone rather than guessed at.
chk("a file dropped in by hand has no destination", parseInboxFileName("random.pdf"), null);
chk("a half-formed name has none either", parseInboxFileName("abc__only-three__parts"), null);
chk("empty parts are refused", parseInboxFileName("__lib__label__file.jpg"), null);

// One inbox can feed several archives, so the library has to survive the trip.
chk("library out of a folder url",
  libraryFromUrl("https://x.sharepoint.com/sites/ControlledSubstanceRecords/Clinic%202%20Archive"), "Clinic 2 Archive");
chk("trailing slashes and queries don't confuse it",
  libraryFromUrl("https://x.sharepoint.com/sites/CSR/Lehi%20Archive/?view=1"), "Lehi Archive");
chk("nothing in, nothing out", libraryFromUrl(null), "");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
