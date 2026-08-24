import { test } from "node:test";
import assert from "node:assert/strict";
import { attachFile, openAttachment, removeAttachment, formatSize } from "./attach";
import { MemoryBlobStore, blobPath, MAX_ATTACHMENT_BYTES, AttachmentTooLargeError } from "./blob-store";
import { createVaultKeyEnvelope, defaultKdfParams, generateKdfSalt, type KdfParams } from "../crypto/keys";

/**
 * The claim under test: someone who obtains the entire blob store gets a pile of
 * indistinguishable ciphertext — no filenames, no types, no way to tell a
 * passport from a utility bill.
 */

const HOUSEHOLD = "household-1";
const SCOPE = "record-1";

function fastParams(): KdfParams {
  return { ...defaultKdfParams(generateKdfSalt()), memoryKiB: 1024, iterations: 1, parallelism: 1 };
}

async function vault() {
  const { vaultKey } = await createVaultKeyEnvelope("passphrase", new Uint8Array(32).fill(7), fastParams());
  return vaultKey;
}

/** A recognisable "document" so leakage is easy to assert on. */
function pdfBytes(marker = "PASSPORT NUMBER C01X92834"): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n${marker}\n%%EOF`);
}

test("a file round-trips through encryption and storage unchanged", async () => {
  const key = await vault();
  const store = new MemoryBlobStore();
  const original = pdfBytes();

  const ref = await attachFile(
    { bytes: original, filename: "passport.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD },
    key,
    store,
  );

  const recovered = await openAttachment(ref, SCOPE, HOUSEHOLD, key, store);
  assert.deepEqual(recovered, original);
});

test("the blob store never sees the contents", async () => {
  const key = await vault();
  const store = new MemoryBlobStore();
  const original = pdfBytes();

  const ref = await attachFile(
    { bytes: original, filename: "passport.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD },
    key,
    store,
  );

  const stored = await store.get({ householdId: HOUSEHOLD, attachmentId: ref.id });
  assert.ok(stored);
  const asText = new TextDecoder().decode(stored!);
  assert.ok(!asText.includes("PASSPORT"), "plaintext survived into storage");
  assert.ok(!asText.includes("%PDF"), "even the file signature should be unrecognisable");
});

test("the blob store never sees the filename or media type", async () => {
  // "2019 divorce decree.pdf" reveals plenty without decrypting a byte, so the
  // description lives in the record's encrypted payload instead.
  const key = await vault();
  const store = new MemoryBlobStore();

  const ref = await attachFile(
    { bytes: pdfBytes(), filename: "2019 divorce decree.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD },
    key,
    store,
  );

  const path = blobPath({ householdId: HOUSEHOLD, attachmentId: ref.id });
  assert.ok(!path.includes("divorce"), "the storage path leaked the filename");
  assert.ok(!path.includes(".pdf"), "the storage path leaked the file type");
  // The description comes back to the caller, to be sealed inside the payload.
  assert.equal(ref.filename, "2019 divorce decree.pdf");
});

test("two identical files produce different ciphertext", async () => {
  // Otherwise identical documents would be linkable across households, and a
  // known-file check would become possible without any decryption.
  const key = await vault();
  const store = new MemoryBlobStore();
  const bytes = pdfBytes();

  const a = await attachFile({ bytes, filename: "a.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD }, key, store);
  const b = await attachFile({ bytes, filename: "b.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD }, key, store);

  const one = await store.get({ householdId: HOUSEHOLD, attachmentId: a.id });
  const two = await store.get({ householdId: HOUSEHOLD, attachmentId: b.id });
  assert.notDeepEqual(one, two);
});

test("each attachment gets its own key, so one can be released without the others", async () => {
  const key = await vault();
  const store = new MemoryBlobStore();
  const a = await attachFile({ bytes: pdfBytes("A"), filename: "a.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD }, key, store);
  const b = await attachFile({ bytes: pdfBytes("B"), filename: "b.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD }, key, store);

  assert.notEqual(a.wrappedDataKey, b.wrappedDataKey);
  assert.notEqual(a.iv, b.iv);
});

// --- Tamper resistance ------------------------------------------------------

test("altered ciphertext fails to open rather than returning corrupted data", async () => {
  const key = await vault();
  const store = new MemoryBlobStore();
  const ref = await attachFile(
    { bytes: pdfBytes(), filename: "a.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD },
    key,
    store,
  );

  const stored = (await store.get({ householdId: HOUSEHOLD, attachmentId: ref.id }))!;
  stored[10] ^= 0xff;
  await store.put({ householdId: HOUSEHOLD, attachmentId: ref.id }, stored);

  await assert.rejects(() => openAttachment(ref, SCOPE, HOUSEHOLD, key, store));
});

test("a blob cannot be swapped between records", async () => {
  // Pointing a household's "Will" at some other document would otherwise be
  // undetectable. The record scope is bound into the ciphertext.
  const key = await vault();
  const store = new MemoryBlobStore();
  const ref = await attachFile(
    { bytes: pdfBytes(), filename: "will.pdf", mediaType: "application/pdf", recordScope: "record-will", householdId: HOUSEHOLD },
    key,
    store,
  );

  await assert.rejects(
    () => openAttachment(ref, "record-something-else", HOUSEHOLD, key, store),
    "a blob opened under the wrong record must fail",
  );
});

test("another household's vault key cannot open the file", async () => {
  const mine = await vault();
  const theirs = await vault();
  const store = new MemoryBlobStore();

  const ref = await attachFile(
    { bytes: pdfBytes(), filename: "a.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD },
    mine,
    store,
  );

  await assert.rejects(() => openAttachment(ref, SCOPE, HOUSEHOLD, theirs, store));
});

// --- Ordinary failures ------------------------------------------------------

test("a missing blob reports null rather than looking like a decryption failure", async () => {
  // A record can outlive its file. That should read as "this file is missing",
  // not as "your vault is broken".
  const key = await vault();
  const store = new MemoryBlobStore();
  const ref = await attachFile(
    { bytes: pdfBytes(), filename: "a.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD },
    key,
    store,
  );

  await removeAttachment(ref, HOUSEHOLD, store);
  assert.equal(await openAttachment(ref, SCOPE, HOUSEHOLD, key, store), null);
});

test("an oversized file is refused with an actionable message", async () => {
  const key = await vault();
  const store = new MemoryBlobStore();
  const huge = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);

  await assert.rejects(
    () => attachFile({ bytes: huge, filename: "big.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD }, key, store),
    (err: Error) => {
      assert.ok(err instanceof AttachmentTooLargeError);
      assert.match(err.message, /lower-resolution|split/i, "should say what to do about it");
      return true;
    },
  );
  assert.equal(store.size, 0, "nothing should be stored when the file is refused");
});

test("an empty file is refused", async () => {
  const key = await vault();
  const store = new MemoryBlobStore();
  await assert.rejects(
    () => attachFile({ bytes: new Uint8Array(0), filename: "empty.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD }, key, store),
    /empty/i,
  );
});

test("the source buffer is left untouched", async () => {
  const key = await vault();
  const store = new MemoryBlobStore();
  const bytes = pdfBytes();
  const copy = bytes.slice();

  await attachFile({ bytes, filename: "a.pdf", mediaType: "application/pdf", recordScope: SCOPE, householdId: HOUSEHOLD }, key, store);
  assert.deepEqual(bytes, copy, "the caller decides when to release the plaintext");
});

test("storage paths are scoped by household so access rules can key on them", () => {
  assert.equal(blobPath({ householdId: "h1", attachmentId: "a1" }), "h1/a1");
});

test("sizes are formatted for people", () => {
  assert.equal(formatSize(512), "512 B");
  assert.equal(formatSize(2048), "2 KB");
  assert.equal(formatSize(5 * 1024 * 1024), "5.0 MB");
});
