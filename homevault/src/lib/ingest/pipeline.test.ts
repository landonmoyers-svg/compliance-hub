import { test } from "node:test";
import assert from "node:assert/strict";
import { identifyDocument, previewForConsent } from "./pipeline";
import { policyFor, DEFAULT_POLICY, DEFAULT_SECURITY_MODE, SECURITY_MODES } from "./security-mode";
import type { DocumentInput } from "./analyzer";

/**
 * Two modes, two promises. These check that each promise holds — including the
 * awkward cases where a household has opted into help but the document is one
 * they'd regret sending.
 */

const NOW = Date.parse("2026-08-23T12:00:00Z");

const doc = (over: Partial<DocumentInput> = {}): DocumentInput => ({
  id: "doc-1",
  // Deliberately unrecognisable, so the local pass can't place it.
  text: "Reference AB-99 issued to the party named below on the date shown.",
  filename: "scan_20240312.pdf",
  ...over,
});

function spyCloud() {
  const sent: string[] = [];
  return {
    sent,
    cloud: {
      transport: {
        async classifyRedacted(sanitizedText: string) {
          sent.push(sanitizedText);
          return { documentType: "utility-bill", category: "household", label: "Utility bill", confidence: 0.85 };
        },
      },
      consent: {
        batchId: "batch-1",
        approvedDocumentIds: ["doc-1"],
        grantedAt: NOW,
        expiresAt: NOW + 600_000,
        shownSummary: "Hidden: 1 account number",
      },
    },
  };
}

// --- Private mode -----------------------------------------------------------

test("private is the default, so doing nothing gets the stronger guarantee", () => {
  assert.equal(DEFAULT_SECURITY_MODE, "private");
  assert.equal(DEFAULT_POLICY.mode, "private");
});

test("in private mode nothing is sent, even when the device can't identify the document", async () => {
  const { cloud, sent } = spyCloud();
  const result = await identifyDocument(doc(), { policy: policyFor("private"), cloud, now: () => NOW });

  assert.equal(result.handling, "local");
  assert.deepEqual(sent, [], "private mode must never transmit");
  assert.match(result.reason, /stays on this device/i);
});

test("in private mode an unidentified document is returned as unknown, not guessed", async () => {
  const result = await identifyDocument(doc(), { policy: policyFor("private") });
  assert.equal(result.analysis.documentType, "unknown");
  assert.ok(result.analysis.confidence < 0.5);
});

// --- Assisted mode ----------------------------------------------------------

test("in assisted mode an unrecognised document is sent redacted", async () => {
  const { cloud, sent } = spyCloud();
  const result = await identifyDocument(doc(), { policy: policyFor("assisted"), cloud, now: () => NOW });

  assert.equal(result.handling, "sent-redacted");
  assert.equal(sent.length, 1);
  assert.equal(result.analysis.via, "redacted-cloud");
});

test("a document the device already recognised is never sent, even in assisted mode", async () => {
  // Sending something we already identified is exposure bought for nothing.
  const { cloud, sent } = spyCloud();
  const result = await identifyDocument(doc({ text: "GEICO AUTOMOBILE POLICY DECLARATIONS" }), {
    policy: policyFor("assisted"),
    cloud,
    now: () => NOW,
  });

  assert.equal(result.handling, "local");
  assert.deepEqual(sent, []);
  assert.match(result.reason, /no need to send/i);
});

test("identity and estate documents stay local even in assisted mode", async () => {
  // Choosing "let AI help" must not quietly include the passports and the will.
  const { cloud, sent } = spyCloud();
  for (const text of ["SOCIAL SECURITY administration record", "LAST WILL AND TESTAMENT of the undersigned"]) {
    const result = await identifyDocument(doc({ text }), { policy: policyFor("assisted"), cloud, now: () => NOW });
    assert.equal(result.handling, "local", `${text.slice(0, 20)} would have been sent`);
    assert.match(result.reason, /never leaves this device/i);
  }
  assert.deepEqual(sent, []);
});

test("what is transmitted carries no identifiers", async () => {
  const { cloud, sent } = spyCloud();
  await identifyDocument(
    doc({ text: "Reference AB-99\nAccount Number: 000123456789\nNamed Insured: ALEX RIVERA" }),
    { policy: policyFor("assisted"), cloud, now: () => NOW },
  );

  assert.equal(sent.length, 1);
  assert.ok(!sent[0].includes("000123456789"), "account number was transmitted");
  assert.ok(!sent[0].includes("ALEX RIVERA"), "name was transmitted");
});

test("a scan too unclear to redact reliably is kept local rather than sent", async () => {
  const { cloud, sent } = spyCloud();
  const result = await identifyDocument(doc({ text: "§£ ¬¬ }{|| ✳ ††† ‡‡‡" }), {
    policy: policyFor("assisted"),
    cloud,
    now: () => NOW,
  });

  assert.equal(result.handling, "local");
  assert.deepEqual(sent, []);
  assert.match(result.reason, /too unclear/i);
});

test("assisted mode without an approved batch stays local", async () => {
  const result = await identifyDocument(doc(), { policy: policyFor("assisted"), now: () => NOW });
  assert.equal(result.handling, "local");
  assert.match(result.reason, /no approval/i);
});

test("a refusal falls back to the local answer instead of losing the document", async () => {
  const { cloud } = spyCloud();
  // Expired approval — the document must still come back identified as best we can.
  const result = await identifyDocument(doc(), {
    policy: policyFor("assisted"),
    cloud,
    now: () => NOW + 24 * 60 * 60 * 1000,
  });

  assert.equal(result.handling, "local");
  assert.equal(result.analysis.documentId, "doc-1");
  assert.match(result.reason, /expired/i);
});

// --- Consent preview --------------------------------------------------------

test("the preview shows exactly what would be sent, and sending reuses it", async () => {
  // If the preview were recomputed at send time the two could drift, which
  // would make the household's approval meaningless.
  const d = doc({ text: "Reference AB-99\nAccount Number: 000123456789" });
  const { redaction, summary } = previewForConsent(d);

  const { cloud, sent } = spyCloud();
  await identifyDocument(d, { policy: policyFor("assisted"), cloud, now: () => NOW });

  assert.equal(sent[0], redaction.sanitized, "what was sent differs from what was previewed");
  assert.match(summary, /Hidden:/);
});

// --- How the choice is presented -------------------------------------------

test("both modes state their costs as plainly as their benefits", () => {
  // A choice presented with only one side's downsides isn't a choice.
  for (const mode of SECURITY_MODES) {
    assert.ok(mode.benefits.length > 0, `${mode.key} lists no benefits`);
    assert.ok(mode.costs.length > 0, `${mode.key} lists no costs`);
  }
});

test("the assisted option admits what it cannot promise", () => {
  const assisted = SECURITY_MODES.find((m) => m.key === "assisted")!;
  const text = assisted.costs.join(" ").toLowerCase();
  assert.ok(/contract|cannot enforce|not something we can enforce/.test(text), "must not present retention as guaranteed");
  assert.ok(/context/.test(text), "must admit redaction is not anonymisation");
});

test("nothing describes redaction as anonymisation", () => {
  // Context re-identifies: "GEICO auto policy, 2019 Subaru Outback, Draper UT"
  // narrows to very few households with every number stripped.
  for (const mode of SECURITY_MODES) {
    const all = [mode.label, mode.summary, ...mode.benefits, ...mode.costs].join(" ").toLowerCase();
    assert.ok(!all.includes("anonymi"), `${mode.key} claims anonymisation`);
  }
});
