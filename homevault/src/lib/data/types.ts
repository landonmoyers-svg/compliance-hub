import type { RecordMeta } from "../domain/records";
import type { HandoverPlan } from "../domain/handover";
import type { SensitivityTier } from "../domain/categories";

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

/** Read surface the authenticated app shell needs. Reads are metadata-only. */
export interface DataClient {
  listRecords(): Promise<RecordMeta[]>;
  listMembers(): Promise<HouseholdMember[]>;
  listRecipients(): Promise<Recipient[]>;
  listPlans(): Promise<HandoverPlan[]>;
}
