import type { RecordMeta } from "../domain/records";
import type { HandoverPlan } from "../domain/handover";
import type { SensitivityTier } from "../domain/categories";
import type { SealedBytes } from "../crypto/envelope";

/**
 * The data seam (see docs/ARCHITECTURE.md "data seam"). The UI depends only on
 * this `DataClient` interface, so the scaffold ships a `DemoDataClient` and
 * production swaps in a `SupabaseDataClient` with no UI changes.
 *
 * Every method returns ONLY non-secret metadata — the same shape the
 * zero-knowledge server is allowed to see. Ciphertext, wrapped keys, and
 * plaintext secrets never travel through this interface; sealing/unsealing is
 * the crypto layer's job and happens in the browser.
 */

/** A household member who uses the app (authenticates with their own keys). */
export interface HouseholdMember {
  id: string;
  name: string;
  role: "owner" | "co_owner" | "viewer";
}

/**
 * A designated handover recipient — may be a member (spouse) or a non-member
 * (e.g. an attorney) who holds an escrow share encrypted to their own key.
 */
export interface Recipient {
  id: string;
  name: string;
  relationship: string;
  isMember: boolean;
  scopeTiers: SensitivityTier[];
}

/**
 * The non-secret half of a record, as supplied by the caller. Server-managed
 * fields (id, household, timestamps) are deliberately absent — a client does not
 * get to choose which household a record lands in.
 */
export type RecordMetaInput = Omit<RecordMeta, "id" | "householdId" | "createdAt" | "updatedAt">;

/**
 * A record on its way to storage: metadata the server may read, plus a payload
 * the server cannot. The sealing already happened in the browser — by the time
 * anything reaches this interface it is opaque.
 */
export interface SealedRecordInput {
  meta: RecordMetaInput;
  sealed: SealedBytes;
}

export interface DataClient {
  listRecords(): Promise<RecordMeta[]>;
  listMembers(): Promise<HouseholdMember[]>;
  listRecipients(): Promise<Recipient[]>;
  listPlans(): Promise<HandoverPlan[]>;

  /**
   * The opaque payload for one record, fetched only when the user actually
   * reveals it. Kept off `listRecords` on purpose: browsing the vault should
   * never pull every household secret over the wire, even as ciphertext.
   */
  getSealedRecord(id: string): Promise<SealedBytes | null>;

  createRecord(input: SealedRecordInput): Promise<RecordMeta>;
  updateRecord(id: string, input: SealedRecordInput): Promise<RecordMeta>;
  deleteRecord(id: string): Promise<void>;
}
