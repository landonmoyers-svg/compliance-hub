import { test } from "node:test";
import assert from "node:assert/strict";
import { redactText, redactionBoxes, describeRedactions, type OcrWord } from "./redact";

/**
 * This module is the gate between a household's documents and a third-party
 * model. The tests are written adversarially: the important ones don't check
 * that redaction *happened*, they check that the original value cannot be found
 * anywhere in what would be transmitted.
 */

/** The assertion that actually matters. */
function assertNotLeaked(sanitized: string, ...secrets: string[]) {
  for (const secret of secrets) {
    assert.ok(!sanitized.includes(secret), `leaked ${JSON.stringify(secret)}`);
    // Also check with separators stripped — "1234-5678" must not survive as
    // "12345678" through a partial replacement.
    const bare = secret.replace(/\D/g, "");
    if (bare.length >= 6) {
      assert.ok(!sanitized.replace(/\D/g, "").includes(bare), `leaked ${secret} without separators`);
    }
  }
}

// --- The values that must never get out ------------------------------------

test("a Social Security card is stripped of its number and name", () => {
  const text = [
    "SOCIAL SECURITY",
    "Name: ALEX RIVERA",
    "Number: 541-88-2270",
    "Issued by the Social Security Administration",
  ].join("\n");

  const result = redactText(text);

  assertNotLeaked(result.sanitized, "541-88-2270", "ALEX RIVERA");
  // The structure survives, which is what the classifier actually needs.
  assert.match(result.sanitized, /SOCIAL SECURITY/);
  assert.match(result.sanitized, /Social Security Administration/);
  assert.match(result.sanitized, /⟪SSN⟫/);
});

test("a payment card number is caught by checksum, not by guessing", () => {
  // 4111 1111 1111 1111 is the canonical Luhn-valid test number.
  const result = redactText("Visa ending 4111 1111 1111 1111 exp 12/28");
  assertNotLeaked(result.sanitized, "4111 1111 1111 1111", "4111111111111111");
  assert.equal(result.counts.card, 1);
});

test("a digit run that fails the card checksum is still redacted as an account number", () => {
  // Over-redaction is the correct failure mode: a false positive costs a little
  // accuracy, a false negative puts a real number on the wire.
  const result = redactText("Reference 4111111111111112 on file");
  assertNotLeaked(result.sanitized, "4111111111111112");
});

test("bank routing and account numbers are removed", () => {
  const result = redactText("Routing: 021000021\nAccount: 000123456789");
  assertNotLeaked(result.sanitized, "021000021", "000123456789");
});

test("values are found by their label even when the number has no distinctive shape", () => {
  // This is what catches policy and member numbers on forms, where the digits
  // look like nothing in particular.
  const result = redactText("Policy Number: XQ-7741\nMember: 88F2");
  assertNotLeaked(result.sanitized, "XQ-7741", "88F2");
});

test("a label above its value is handled, as on ID cards", () => {
  const result = redactText("Given Names\nSAMANTHA JOY\nSurname\nRIVERA");
  assertNotLeaked(result.sanitized, "SAMANTHA JOY", "RIVERA");
});

test("passwords and PINs never leave", () => {
  const result = redactText("Wi-Fi password: cobalt-harbor-9812\nPIN: 4417");
  assertNotLeaked(result.sanitized, "cobalt-harbor-9812", "4417");
  assert.ok((result.counts.secret ?? 0) >= 2);
});

test("a realistic insurance page keeps its structure and loses its identifiers", () => {
  const text = [
    "GEICO AUTOMOBILE POLICY DECLARATIONS",
    "Policy Number: 4823-99-17",
    "Named Insured: ALEX RIVERA",
    "Address: 118 Cedar Lane, Draper UT",
    "Effective: 03/14/2026 to 09/14/2026",
    "Vehicle: 2019 Subaru Outback",
    "Premium: $612.40",
  ].join("\n");

  const result = redactText(text);

  assertNotLeaked(result.sanitized, "4823-99-17", "ALEX RIVERA", "118 Cedar Lane, Draper UT");
  // Everything a classifier needs to file this correctly is still there.
  assert.match(result.sanitized, /GEICO/);
  assert.match(result.sanitized, /AUTOMOBILE POLICY DECLARATIONS/);
  assert.match(result.sanitized, /Subaru Outback/);
});

test("a VIN is redacted — it identifies a vehicle and through it an owner", () => {
  const result = redactText("Vehicle: 2019 Subaru Outback  VIN 4S4BSANC1K3201847");
  assertNotLeaked(result.sanitized, "4S4BSANC1K3201847");
  // The make and model are not identifying and are useful for filing.
  assert.match(result.sanitized, /Subaru Outback/);
});

test("a heading containing a label word does not swallow the line beneath it", () => {
  // "GEICO AUTOMOBILE POLICY DECLARATIONS" contains "POLICY". Treating it as a
  // bare label ate the whole next line, which fails safe but destroys the
  // structure the classifier needs.
  const result = redactText("GEICO AUTOMOBILE POLICY DECLARATIONS\nPolicy Number: 4823-99-17");
  assert.match(result.sanitized, /Policy Number:/, "the label itself must survive");
  assert.match(result.sanitized, /GEICO AUTOMOBILE POLICY DECLARATIONS/);
  assertNotLeaked(result.sanitized, "4823-99-17");
});

test("a genuine bare label on an ID card still captures the line below", () => {
  // The fix above must not break the case it was built for.
  const result = redactText("Surname\nRIVERA\nGiven Names\nSAMANTHA JOY");
  assertNotLeaked(result.sanitized, "RIVERA", "SAMANTHA JOY");
});

// --- Behaviour that keeps it useful ----------------------------------------

test("placeholders are typed, so the model still knows what was there", () => {
  const result = redactText("SSN: 541-88-2270 and card 4111111111111111");
  // "[hidden] and [hidden]" would throw away the signal that makes this work.
  assert.match(result.sanitized, /⟪SSN⟫/);
  assert.match(result.sanitized, /⟪CARD⟫/);
});

test("the original text is never modified", () => {
  const original = "SSN: 541-88-2270";
  const copy = original.slice();
  redactText(original);
  assert.equal(original, copy, "redaction must not mutate its input");
});

test("overlapping matches are claimed once, not double-replaced", () => {
  const result = redactText("Account Number: 4111111111111111");
  const placeholders = result.sanitized.match(/⟪[A-Z]+⟫/g) ?? [];
  assert.equal(placeholders.length, 1, `expected one placeholder, got ${placeholders.join(",")}`);
});

// --- Honesty about what it can't do ----------------------------------------

test("a garbled scan is reported as not confident rather than silently sent", () => {
  const garbled = "S0C!AL §£CUR!TY ### ~~~ }{|| ¬¬ 5⁴1 §8 22✳0 ¤¤¤¤ ††† ‡‡‡";
  const result = redactText(garbled);
  assert.equal(result.confident, false);
  assert.ok(result.warnings.some((w) => /hard to read|by hand/i.test(w)));
});

test("finding nothing is flagged, because it might mean the scan failed", () => {
  const result = redactText("This page appears to be blank apart from a heading.");
  assert.equal(result.confident, false);
  assert.ok(result.warnings.length > 0);
});

test("a clean document with real identifiers is confident", () => {
  const result = redactText("Policy Number: 4823-99-17\nNamed Insured: ALEX RIVERA\nGEICO");
  assert.equal(result.confident, true);
  assert.equal(result.warnings.length, 0);
});

// --- Image redaction --------------------------------------------------------

test("word boxes overlapping a secret are returned for blacking out", () => {
  // Redacting the text is not enough when the picture is what gets sent.
  const text = "Number: 541-88-2270";
  const words: OcrWord[] = [
    { text: "Number:", start: 0, box: { x: 10, y: 10, width: 60, height: 12 } },
    { text: "541-88-2270", start: 8, box: { x: 80, y: 10, width: 90, height: 12 } },
  ];

  const boxes = redactionBoxes(words, redactText(text).spans);
  assert.equal(boxes.length, 1);
  assert.deepEqual(boxes[0], { x: 80, y: 10, width: 90, height: 12 });
});

test("a word only partly overlapping a secret is still blacked out whole", () => {
  const words: OcrWord[] = [{ text: "SSN541-88-2270", start: 0, box: { x: 0, y: 0, width: 100, height: 10 } }];
  const spans = redactText("SSN541-88-2270").spans;
  assert.equal(redactionBoxes(words, spans).length, 1, "partial overlap must redact the whole word");
});

// --- The consent screen -----------------------------------------------------

test("the summary says what is being hidden, in plain language", () => {
  const result = redactText("SSN: 541-88-2270\nAccount: 000123456789\nName: ALEX RIVERA");
  const summary = describeRedactions(result);

  assert.match(summary, /Hidden:/);
  assert.match(summary, /Social Security number/);
  assertNotLeaked(summary, "541-88-2270", "000123456789");
});

test("the summary pluralises rather than reading like a machine", () => {
  const two = redactText("Card 4111111111111111 and card 5555555555554444");
  assert.match(describeRedactions(two), /2 card numbers/);
  assert.match(describeRedactions(redactText("SSN: 541-88-2270")), /1 Social Security number/);
});

test("an empty document reports nothing rather than crashing", () => {
  assert.equal(describeRedactions(redactText("")), "Nothing sensitive found");
});
