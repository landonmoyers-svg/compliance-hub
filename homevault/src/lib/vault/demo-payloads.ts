import { seal, open, type SealedBytes } from "../crypto/envelope";
import { utf8ToBytes } from "../crypto/encoding";
import type { RecordMeta, RecordPayload } from "../domain/records";

/**
 * Demo secret payloads, so the vault UI can show a *real* zero-knowledge
 * round-trip rather than describing one: the payload is sealed under the live
 * vault key and can only be reopened while the vault is unlocked.
 *
 * The content is fictional; the cryptography is not.
 */

const PAYLOADS: Record<string, RecordPayload> = {
  "r-passport": {
    fields: [
      { key: "Passport number", value: "C01X92834", secret: true },
      { key: "Issued", value: "2017-03-14", secret: false },
    ],
    physicalLocation: "Fire safe, upstairs closet — top shelf",
  },
  "r-ssn": {
    fields: [{ key: "Social Security number", value: "541-88-2270", secret: true }],
    physicalLocation: "Fire safe, upstairs closet — envelope marked 'IDs'",
  },
  "r-checking": {
    fields: [
      { key: "Bank", value: "First Summit Credit Union", secret: false },
      { key: "Account", value: "8842019773", secret: true },
      { key: "Routing", value: "324079555", secret: true },
    ],
  },
  "r-safedeposit": {
    fields: [
      { key: "Bank", value: "First Summit — Draper branch", secret: false },
      { key: "Box", value: "No. 214", secret: true },
    ],
    physicalLocation: "Key taped inside the filing cabinet's top drawer",
    notes: "Sam and the trustee are both signatories.",
  },
  "r-wifi": {
    fields: [
      { key: "Network", value: "Rivera-5G", secret: false },
      { key: "Password", value: "cobalt-harbor-9812", secret: true },
    ],
  },
};

/** Every record can be revealed; ones without bespoke content get a placeholder. */
export function demoPayloadFor(record: RecordMeta): RecordPayload {
  return (
    PAYLOADS[record.id] ?? {
      fields: [{ key: "Details", value: `Encrypted contents of "${record.label}"`, secret: true }],
      ...(record.hasPhysicalLocation ? { physicalLocation: "Recorded with the household's originals" } : {}),
    }
  );
}

/**
 * Bind the record's non-secret metadata into the GCM additional-authenticated-
 * data, so the server cannot move a ciphertext under a different label or
 * category without the decrypt failing (docs/SECURITY.md § 2).
 */
export function aadFor(record: RecordMeta): Uint8Array {
  return utf8ToBytes(
    JSON.stringify({
      id: record.id,
      householdId: record.householdId,
      category: record.category,
      tier: record.tier,
      label: record.label,
    }),
  );
}

/** Seal a record's demo payload under the live vault key. */
export function sealDemoRecord(record: RecordMeta, vaultKey: CryptoKey): Promise<SealedBytes> {
  return seal(demoPayloadFor(record), vaultKey, aadFor(record));
}

/** Reopen a sealed record. Throws if the vault key or the metadata don't match. */
export function openDemoRecord(
  sealed: SealedBytes,
  record: RecordMeta,
  vaultKey: CryptoKey,
): Promise<RecordPayload> {
  return open<RecordPayload>(sealed, vaultKey, aadFor(record));
}
