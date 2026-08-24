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

/** Source of every non-test module in the core ingest layer, comments stripped. */
function ingestSources(): Array<{ file: string; code: string }> {
  // fileURLToPath, not `.pathname` — the latter leaves the path percent-encoded
  // and "Claude Code" becomes "Claude%20Code".
  const dir = dirname(fileURLToPath(import.meta.url));
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((file) => ({
      file,
      // Strip comments so prose *about* networking doesn't trip the checks.
      code: readFileSync(join(dir, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, ""),
    }));
}

const NETWORK_PATTERNS = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /navigator\.sendBeacon/];

test("the core ingest layer contains no network code", () => {
  // In Private mode this is the whole promise, and it is checkable by reading
  // rather than something taken on trust. Cloud code lives in ./cloud and is
  // reached only through the single dynamic import in pipeline.ts.
  const sources = ingestSources();
  const offenders: string[] = [];

  for (const { file, code } of sources) {
    for (const pattern of NETWORK_PATTERNS) {
      if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
    }
  }

  assert.deepEqual(offenders, [], `core ingest must never reach the network:\n${offenders.join("\n")}`);

  // A guard that silently scanned nothing would pass forever while protecting
  // nothing, so prove it read the modules it is meant to police.
  const scanned = sources.map((s) => s.file);
  for (const required of ["analyzer.ts", "redact.ts", "pipeline.ts"]) {
    assert.ok(scanned.includes(required), `did not scan ${required}; saw ${scanned.join(", ")}`);
  }

  assert.ok(/\bfetch\s*\(/.test("await fetch('https://example.com')"), "the fetch detector is broken");
});

test("exactly one module can reach the cloud code, and it does so dynamically", () => {
  // The quarantine is what keeps Private mode's guarantee real: the module that
  // could transmit is never imported, so it is not in the running program. If a
  // second entry point appears, this fails.
  const sources = ingestSources();
  const importers = sources.filter((s) => /["\']\.\/cloud\//.test(s.code)).map((s) => s.file);

  assert.deepEqual(importers, ["pipeline.ts"], "only pipeline.ts may reference ./cloud");

  const pipeline = sources.find((s) => s.file === "pipeline.ts")!.code;
  // A static import would pull the cloud module into every bundle, including
  // the one a Private-mode household loads.
  assert.ok(
    !/^\s*import\s+[^(]*from\s+["\']\.\/cloud\//m.test(pipeline),
    "the cloud module must not be statically imported",
  );
  assert.equal(
    (pipeline.match(/await import\(["\']\.\/cloud\//g) ?? []).length,
    1,
    "there should be exactly one dynamic import of the cloud module",
  );
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
