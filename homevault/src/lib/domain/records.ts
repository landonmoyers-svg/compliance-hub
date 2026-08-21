import type { CategoryKey, SensitivityTier } from "./categories";

/** Whether the record is a digital backup, a pointer to a physical original, or both. */
export type RecordKind = "digital" | "physical" | "both";

/**
 * Non-secret metadata — stored in plaintext server-side so reminders and the
 * completeness coach can work WITHOUT decryption. Nothing here may identify the
 * secret itself. See docs/DATA-MODEL.md § "Metadata discipline".
 */
export interface RecordMeta {
  id: string;
  householdId: string;
  category: CategoryKey;
  tier: SensitivityTier;
  label: string;
  kind: RecordKind;
  hasPhysicalLocation: boolean;
  expiresOn: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A single field within a record. `secret: true` fields are redacted before any AI call. */
export interface RecordField {
  key: string;
  value: string;
  secret: boolean;
}

/** Pointer to a ciphertext attachment blob in Storage, decryptable with the record's DK. */
export interface AttachmentRef {
  id: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
}

/**
 * The secret payload — only ever exists decrypted in the client. AES-256-GCM
 * encrypted under the record's data key before it leaves the browser.
 */
export interface RecordPayload {
  fields: RecordField[];
  physicalLocation?: string;
  notes?: string;
  attachments?: AttachmentRef[];
}

/** What a caller supplies to create a record: metadata (minus server-managed ids/dates) + payload. */
export interface RecordDraft {
  category: CategoryKey;
  tier: SensitivityTier;
  label: string;
  kind: RecordKind;
  expiresOn: string | null;
  payload: RecordPayload;
}

/**
 * The at-rest shape. `ciphertext`/`iv`/`wrappedDataKey` are opaque to the
 * server; `meta` is bound into the GCM additional-authenticated-data so the
 * server can't move a ciphertext under a different label/category undetected.
 */
export interface SealedRecord {
  meta: RecordMeta;
  ciphertext: string; // base64
  iv: string; // base64
  wrappedDataKey: string; // base64, wrap(DK, VK)
}

/** Reminder status derived purely from non-secret metadata. */
export type ExpiryStatus = "none" | "ok" | "soon" | "expired";

export function expiryStatus(meta: Pick<RecordMeta, "expiresOn">, soonDays = 60, now = Date.now()): ExpiryStatus {
  if (!meta.expiresOn) return "none";
  const due = Date.parse(meta.expiresOn);
  if (Number.isNaN(due)) return "none";
  if (due < now) return "expired";
  if (due - now <= soonDays * 24 * 60 * 60 * 1000) return "soon";
  return "ok";
}
