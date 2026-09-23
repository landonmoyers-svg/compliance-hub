import { boxLabel, boxLabelsForCode, boxOfVial, logCodeForSite, nextBoxLabels, parseBoxLabel, vialId } from "../cs-labels";

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

// Parsing
chk("new label", parseBoxLabel("M1A"), { code: "M", run: 1, letter: "A", legacy: false });
chk("second run", parseBoxLabel("M2C"), { code: "M", run: 2, letter: "C", legacy: false });
chk("run past 9", parseBoxLabel("L12B"), { code: "L", run: 12, letter: "B", legacy: false });
chk("lowercase is fine", parseBoxLabel("m1a"), { code: "M", run: 1, letter: "A", legacy: false });
chk("older dashed label", parseBoxLabel("L-A"), { code: "L", run: 1, letter: "A", legacy: true });
chk("a vial id is not a box label", parseBoxLabel("M1A7"), null);
chk("junk", parseBoxLabel("box one"), null);

// Vials belong to boxes
chk("vial → box", boxOfVial("M1A7"), "M1A");
chk("two-digit vial → box", boxOfVial("M1A10"), "M1A");
chk("older vial → box", boxOfVial("L-A3"), "L-A");
chk("vial id built", vialId("M1C", 7), "M1C7");
chk("box label built", boxLabel("m", 2, "d"), "M2D");

// Campus codes — Murray sites share one log, Lehi its own
chk("Murray Clinic 2 → M", logCodeForSite("Murray Clinic 2"), "M");
chk("Murray Admin → M", logCodeForSite("Murray Admin Building"), "M");
chk("Lehi → L", logCodeForSite("Lehi Clinic"), "L");

// Next free labels continue the log
chk("empty log starts at A", nextBoxLabels([], "M", 4).map((x) => x.label), ["M1A", "M1B", "M1C", "M1D"]);
chk("continues after existing", nextBoxLabels(["M1A", "M1B"], "M", 2).map((x) => x.label), ["M1C", "M1D"]);
chk("other campus doesn't consume letters", nextBoxLabels(["L1A", "L1B"], "M", 1).map((x) => x.label), ["M1A"]);
chk("older dashed labels still count", nextBoxLabels(["M-A", "M-B"], "M", 1).map((x) => x.label), ["M1C"]);
const fullRun = Array.from({ length: 26 }, (_, i) => `M1${String.fromCharCode(65 + i)}`);
chk("rolls into the next run at Z", nextBoxLabels(fullRun, "M", 2).map((x) => x.label), ["M2A", "M2B"]);
chk("fills a gap left by a skipped letter", nextBoxLabels(["M1A", "M1C"], "M", 2).map((x) => x.label), ["M1B", "M1D"]);

// Display
chk("labels for a campus, newest run first", boxLabelsForCode(["M1A", "M2B", "L1A", "M1B"], "M"), ["M2B", "M1A", "M1B"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
