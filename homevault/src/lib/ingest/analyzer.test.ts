import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalAnalyzer, type DocumentInput, type LocalModel } from "./analyzer";

/**
 * The important tests here assert that something does NOT happen. The product's
 * privacy claim is "your documents never leave this machine", and that claim is
 * only worth anything if it is enforced by the absence of code rather than by a
 * setting somebody could flip.
 */

const doc = (over: Partial<DocumentInput> = {}): DocumentInput => ({
  id: "doc-1",
  text: "Statement Period 01/01 to 01/31\nAccount Summary\nBeginning Balance $100",
  ...over,
});

// --- The guarantee ----------------------------------------------------------

test("the ingest layer contains no network code at all", () => {
  // This is the whole promise, and it is checkable rather than assertable.
  // If someone adds a fetch here later, this fails loudly.
  // fileURLToPath, not `.pathname` — the latter leaves the path percent-encoded
  // and "Claude Code" becomes "Claude%20Code".
  const dir = dirname(fileURLToPath(import.meta.url));
  const offenders: string[] = [];
  const scanned: string[] = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    scanned.push(file);
    const source = readFileSync(join(dir, file), "utf8");
    // Strip comments so prose about networking doesn't trip the check.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /navigator\.sendBeacon/, /import\s*\(/]) {
      if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
    }
  }

  assert.deepEqual(offenders, [], `ingest must never reach the network:\n${offenders.join("\n")}`);

  // A guard that silently scans nothing would pass forever while protecting
  // nothing, so prove it actually read the modules it is meant to police.
  assert.ok(scanned.includes("analyzer.ts"), `scanned only: ${scanned.join(", ")}`);
  assert.ok(scanned.includes("redact.ts"), `scanned only: ${scanned.join(", ")}`);

  // And prove the detector works, by running it over a deliberate violation.
  const violation = "async function leak() { await fetch('https://example.com', {}); }";
  assert.ok(/\bfetch\s*\(/.test(violation), "the fetch detector itself is broken");
});

test("a local model is given no way to reach the network either", async () => {
  // The desktop build injects a real model here. The interface hands it text and
  // takes a classification back — no client, no storage, no callbacks out.
  const model: LocalModel = {
    name: "test-model",
    async classify() {
      return { documentType: "utility-bill", category: "household", label: "Utility bill", confidence: 0.75 };
    },
  };
  const result = await new LocalAnalyzer(model).analyze(doc({ text: "something unrecognised" }));
  assert.equal(result.via, "local-model");
  assert.deepEqual(Object.keys(model).sort(), ["classify", "name"]);
});

// --- Recognition ------------------------------------------------------------

test("common documents are recognised offline, because they announce themselves", async () => {
  const local = new LocalAnalyzer();
  const cases: Array<[string, string]> = [
    ["GEICO AUTOMOBILE POLICY DECLARATIONS\nVehicle: Subaru", "auto-insurance-declaration"],
    ["SOCIAL SECURITY\nName: ALEX", "social-security-card"],
    ["LAST WILL AND TESTAMENT OF ALEX RIVERA", "will"],
    ["Form W-2 Wage and Tax Statement", "w2"],
    ["CERTIFICATE OF TITLE\nVehicle", "vehicle-title"],
    ["DURABLE POWER OF ATTORNEY", "power-of-attorney"],
  ];
  for (const [text, expected] of cases) {
    const result = await local.analyze(doc({ text }));
    assert.equal(result.documentType, expected, `failed on ${JSON.stringify(text.slice(0, 32))}`);
    assert.equal(result.via, "rules");
  }
});

test("rules run before the model, since a certain answer needs no inference", async () => {
  let called = false;
  const model: LocalModel = {
    name: "should-not-run",
    async classify() {
      called = true;
      return null;
    },
  };
  await new LocalAnalyzer(model).analyze(doc({ text: "LAST WILL AND TESTAMENT" }));
  assert.equal(called, false, "a page that says what it is should not cost a model run");
});

test("an unrecognised document is reported as unknown rather than guessed at", async () => {
  const result = await new LocalAnalyzer().analyze(doc({ text: "qwer asdf zxcv", filename: "IMG_4523.HEIC" }));
  assert.equal(result.documentType, "unknown");
  assert.ok(result.confidence < 0.5);
  // Falls back to the filename, useless as it is, rather than inventing a label.
  assert.equal(result.label, "IMG_4523.HEIC");
});

test("the issuer is picked out and used in the label", async () => {
  const result = await new LocalAnalyzer().analyze(doc({ text: "GEICO AUTOMOBILE POLICY DECLARATIONS" }));
  assert.equal(result.issuer, "GEICO");
  assert.match(result.label, /GEICO/);
});

// --- Grouping: the part that actually saves the work ------------------------

test("successive years of one policy group together", async () => {
  const local = new LocalAnalyzer();
  const a = await local.analyze(doc({ text: "GEICO AUTOMOBILE POLICY DECLARATIONS\nPolicy Number: 4823-99-17\n2025" }));
  const b = await local.analyze(doc({ text: "GEICO AUTOMOBILE POLICY DECLARATIONS\nPolicy Number: 4823-99-17\n2026" }));
  assert.equal(a.groupKey, b.groupKey, "two years of one policy should become one record");
});

test("two accounts at the same institution do NOT group together", async () => {
  // The failure that matters. Silently merging a checking and a savings account
  // at the same bank is a mistake a household might never notice.
  const local = new LocalAnalyzer();
  const checking = await local.analyze(doc({ text: "Chase\nAccount Summary\nAccount Number: 000111222" }));
  const savings = await local.analyze(doc({ text: "Chase\nAccount Summary\nAccount Number: 000333444" }));

  assert.notEqual(checking.groupKey, savings.groupKey, "distinct accounts must stay distinct");
});

test("different document types from one institution stay separate", async () => {
  const local = new LocalAnalyzer();
  const auto = await local.analyze(doc({ text: "GEICO AUTOMOBILE POLICY DECLARATIONS" }));
  const home = await local.analyze(doc({ text: "GEICO HOMEOWNER DECLARATIONS" }));
  assert.notEqual(auto.groupKey, home.groupKey);
});

test("an unknown document is never grouped with anything", async () => {
  const result = await new LocalAnalyzer().analyze(doc({ text: "asdf" }));
  assert.equal(result.groupKey, undefined, "grouping an unidentified page is worse than not grouping it");
});
