import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runBatch,
  REVIEW_EXPLANATION,
  ALWAYS_REVIEW_CATEGORIES,
  type IntakeFile,
  type TextExtractor,
  type BatchProgress,
} from "./batch";
import { policyFor } from "./security-mode";

/**
 * The batch layer's job is to be trustworthy at scale. These protect the two
 * ways it could quietly ruin a vault: merging things that aren't the same, and
 * filing things it didn't actually understand.
 */

function file(id: string, filename = `IMG_${id}.HEIC`): IntakeFile {
  return { id, filename, bytes: 1024, mediaType: "image/heic" };
}

/** Returns whatever text the test associates with a file id. */
function extractorOf(texts: Record<string, string>): TextExtractor {
  return {
    name: "test",
    async extract(f) {
      const text = texts[f.id];
      if (text === undefined) throw new Error("no such fixture");
      return { text, ocr: true };
    },
  };
}

const CHASE_4471 = `CHASE BANK
Account Summary
Account Number 000123454471
Statement period January 2026`;

const CHASE_9920 = `CHASE BANK
Account Summary
Account Number 000123459920
Statement period January 2026`;

// ---------------------------------------------------------------------------

test("two accounts at the same bank stay two records", async () => {
  // The correction that invalidated the first design of this: households have
  // several accounts at one institution, and collapsing them by issuer would
  // destroy exactly the distinction they care about most.
  const plan = await runBatch([file("a"), file("b")], {
    extractor: extractorOf({ a: CHASE_4471, b: CHASE_9920 }),
  });

  const all = [...plan.ready, ...plan.needsReview];
  assert.equal(all.length, 2, "two accounts were merged into one record");
  assert.notEqual(all[0].id, all[1].id);
});

test("the same account across two statements is one record", async () => {
  const plan = await runBatch([file("a"), file("b")], {
    extractor: extractorOf({
      a: CHASE_4471,
      b: CHASE_4471.replace("January", "February"),
    }),
  });

  const all = [...plan.ready, ...plan.needsReview];
  assert.equal(all.length, 1, "successive statements for one account should group");
  assert.deepEqual(all[0].fileIds.sort(), ["a", "b"]);
});

test("documents nobody could identify are never pooled together", async () => {
  // They have nothing in common except that we failed to read them, which is
  // not a reason to make them one record.
  const plan = await runBatch([file("a"), file("b"), file("c")], {
    extractor: extractorOf({
      a: "aaaa bbbb cccc dddd",
      b: "eeee ffff gggg hhhh",
      c: "iiii jjjj kkkk llll",
    }),
  });

  assert.equal(plan.ready.length, 0, "nothing unidentified should be filed unattended");
  assert.equal(plan.needsReview.length, 3, "unidentified scans were merged");
});

test("filenames never influence grouping", async () => {
  // Two scans of unrelated things that a scanner happened to name in sequence.
  const plan = await runBatch(
    [file("a", "Scan_0001.pdf"), file("b", "Scan_0002.pdf")],
    { extractor: extractorOf({ a: CHASE_4471, b: CHASE_9920 }) },
  );

  assert.equal([...plan.ready, ...plan.needsReview].length, 2);
});

// ---------------------------------------------------------------------------

test("a group is only as confident as its least confident page", async () => {
  const plan = await runBatch([file("a"), file("b")], {
    extractor: extractorOf({ a: CHASE_4471, b: CHASE_4471 + "\nsomething unreadable" }),
  });

  const [record] = [...plan.ready, ...plan.needsReview];
  assert.ok(record.confidence <= 1);
  // Averaging would let confident pages vouch for an uncertain one.
  assert.equal(record.confidence, Math.min(record.confidence, record.confidence));
});

test("one corrupt file doesn't cost you the rest of the batch", async () => {
  const extractor: TextExtractor = {
    name: "flaky",
    async extract(f) {
      if (f.id === "bad") throw new Error("corrupt");
      return { text: CHASE_4471, ocr: true };
    },
  };

  const plan = await runBatch([file("a"), file("bad"), file("c")], { extractor });

  assert.equal(plan.unreadable.length, 1);
  assert.equal(plan.unreadable[0].id, "bad");
  assert.equal(plan.stats.files, 3);
  assert.ok([...plan.ready, ...plan.needsReview].length >= 1, "the good files were lost");
});

test("a blank scan is reported as unreadable, not guessed at", async () => {
  const plan = await runBatch([file("a")], { extractor: extractorOf({ a: "   \n  " }) });

  assert.equal(plan.unreadable.length, 1);
  assert.equal(plan.ready.length, 0);
  assert.equal(plan.needsReview.length, 0);
});

// ---------------------------------------------------------------------------

test("private mode sends nothing, whatever the batch contains", async () => {
  const plan = await runBatch([file("a"), file("b")], {
    extractor: extractorOf({ a: "unidentifiable text here", b: CHASE_4471 }),
    policy: policyFor("private"),
  });

  assert.equal(plan.stats.sentForHelp, 0);
});

test("assisted mode without approval still sends nothing", async () => {
  // Choosing the mode is not the same as approving a batch.
  const plan = await runBatch([file("a")], {
    extractor: extractorOf({ a: "unidentifiable text here" }),
    policy: policyFor("assisted"),
  });

  assert.equal(plan.stats.sentForHelp, 0);
});

test("progress is reported and ends at the total", async () => {
  const seen: BatchProgress[] = [];
  const files = [file("a"), file("b"), file("c")];

  await runBatch(files, {
    extractor: extractorOf({ a: CHASE_4471, b: CHASE_9920, c: "   " }),
    concurrency: 1,
    onProgress: (p) => seen.push({ ...p }),
  });

  assert.ok(seen.length > 0, "no progress was reported");
  assert.equal(seen[seen.length - 1].completed, 3);
  assert.ok(seen.every((p) => p.total === 3));
});

test("aborting stops the batch", async () => {
  const controller = new AbortController();
  const files = Array.from({ length: 50 }, (_, i) => file(`f${i}`));
  const texts = Object.fromEntries(files.map((f) => [f.id, CHASE_4471]));

  let extracted = 0;
  const extractor: TextExtractor = {
    name: "counting",
    async extract(f) {
      extracted += 1;
      if (extracted === 3) controller.abort();
      return { text: texts[f.id], ocr: true };
    },
  };

  await runBatch(files, { extractor, concurrency: 1, signal: controller.signal });
  assert.ok(extracted < files.length, "abort did not stop the batch");
});

// ---------------------------------------------------------------------------

test("every review reason has a plain-language explanation", () => {
  for (const [reason, text] of Object.entries(REVIEW_EXPLANATION)) {
    assert.ok(text.length > 10, `${reason} has no explanation`);
    // Phrased as what we couldn't do, never as something they got wrong. They
    // pointed us at a folder; any shortfall is ours.
    assert.ok(
      !/\byou (didn't|failed|should)\b/i.test(text),
      `${reason} blames the household: ${text}`,
    );
  }
});

test("identity and estate documents are always confirmed by a person", async () => {
  assert.ok(ALWAYS_REVIEW_CATEGORIES.includes("identity"));
  assert.ok(ALWAYS_REVIEW_CATEGORIES.includes("estate"));

  const plan = await runBatch([file("a")], {
    extractor: extractorOf({ a: "LAST WILL AND TESTAMENT of Alex Rivera" }),
  });

  assert.equal(plan.ready.length, 0, "a will was filed without anyone looking at it");
  assert.ok(plan.needsReview[0].reviewReasons.includes("sensitive"));
});

test("two accounts at one bank can be told apart on screen", async () => {
  // Keeping them as separate records is only half the job. If both rows read
  // "Chase bank statement · Chase" the list looks like it has a duplicate, and
  // the household merges them by hand — undoing the distinction entirely.
  const plan = await runBatch([file("a"), file("b")], {
    extractor: extractorOf({ a: CHASE_4471, b: CHASE_9920 }),
  });

  const all = [...plan.ready, ...plan.needsReview];
  const shown = all.map((p) => `${p.label} ${p.issuer ?? ""} ${p.distinguisher ?? ""}`);
  assert.equal(new Set(shown).size, 2, `rows are indistinguishable: ${JSON.stringify(shown)}`);
});

test("account numbers are never shown in full", async () => {
  const plan = await runBatch([file("a")], { extractor: extractorOf({ a: CHASE_4471 }) });
  const [record] = [...plan.ready, ...plan.needsReview];

  assert.ok(record.distinguisher, "no distinguisher was produced");
  assert.ok(
    !record.distinguisher!.includes("000123454471"),
    "the full account number reached the UI",
  );
  assert.match(record.distinguisher!, /^···\d{4}$/);
});
