import { sealBytes, openBytes } from "../crypto/envelope";
import { utf8ToBytes } from "../crypto/encoding";
import type { AttachmentRef } from "../domain/records";
import {
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
  type BlobStore,
} from "./blob-store";

/**
 * Attaching a document to a record.
 *
 * The split that matters:
 *
 *   • **The bytes** are encrypted and handed to a blob store, which learns
 *     nothing but a random id and a length.
 *   • **The description** — filename, media type, original size — is sensitive
 *     in its own right ("2019 tax return.pdf", "divorce decree.pdf") and so
 *     lives inside the record's already-encrypted payload, never beside the blob.
 *
 * The result is that someone who obtains the whole bucket has a pile of
 * indistinguishable ciphertext with no names, no types, and no way to tell a
 * passport from a utility bill.
 */

/**
 * Binds a blob to one attachment on one record.
 *
 * Without this, a blob could be swapped for another — pointing a household's
 * "Will" at a different document. GCM verifies it on decrypt, so a swap fails
 * loudly instead of silently returning the wrong file.
 */
function attachmentAad(recordScope: string, attachmentId: string): Uint8Array {
  return utf8ToBytes(JSON.stringify({ scope: recordScope, attachment: attachmentId }));
}

export interface AttachInput {
  /** Raw file bytes, already read on the device. */
  bytes: Uint8Array;
  filename: string;
  mediaType: string;
  /**
   * Stable identifier for the record this belongs to. Bound into the ciphertext,
   * so it must be something that doesn't change — the record id once saved, or
   * the draft id while composing.
   */
  recordScope: string;
  householdId: string;
}

/**
 * Encrypt a file, store the ciphertext, and return the reference to embed in the
 * record's payload.
 *
 * The caller must be holding an unlocked vault key. Nothing here persists
 * plaintext, and the input buffer is left untouched so the caller can decide
 * when to release it.
 */
export async function attachFile(
  input: AttachInput,
  vaultKey: CryptoKey,
  store: BlobStore,
): Promise<AttachmentRef> {
  if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError(input.bytes.byteLength);
  }
  if (input.bytes.byteLength === 0) {
    throw new Error("That file is empty.");
  }

  const attachmentId = crypto.randomUUID();
  const aad = attachmentAad(input.recordScope, attachmentId);
  const sealed = await sealBytes(input.bytes, vaultKey, aad);

  await store.put({ householdId: input.householdId, attachmentId }, sealed.ciphertext);

  return {
    id: attachmentId,
    filename: input.filename,
    mediaType: input.mediaType,
    sizeBytes: input.bytes.byteLength,
    iv: sealed.iv,
    wrappedDataKey: sealed.wrappedDataKey,
  };
}

/**
 * Fetch and decrypt an attachment.
 *
 * Returns null when the blob is gone, which is a normal outcome — a record can
 * outlive its file if storage was cleared — and should be shown as "this file is
 * missing" rather than treated as a decryption failure.
 */
export async function openAttachment(
  ref: AttachmentRef,
  recordScope: string,
  householdId: string,
  vaultKey: CryptoKey,
  store: BlobStore,
): Promise<Uint8Array | null> {
  const ciphertext = await store.get({ householdId, attachmentId: ref.id });
  if (!ciphertext) return null;

  return openBytes(
    ciphertext,
    { iv: ref.iv, wrappedDataKey: ref.wrappedDataKey },
    vaultKey,
    attachmentAad(recordScope, ref.id),
  );
}

/**
 * Remove an attachment's bytes.
 *
 * Deliberately does not touch the record: the caller updates the payload and
 * re-seals it. Splitting these means a failure here leaves a dangling reference
 * (recoverable, shows as a missing file) rather than a record that claims to
 * have no attachment while the ciphertext lingers in storage.
 */
export async function removeAttachment(
  ref: AttachmentRef,
  householdId: string,
  store: BlobStore,
): Promise<void> {
  await store.remove({ householdId, attachmentId: ref.id });
}

/** Human-readable size, for the UI. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
