import type { DataClient, HouseholdMember, Recipient } from "./types";
import type { RecordMeta } from "../domain/records";
import type { HandoverPlan } from "../domain/handover";
import { DEMO_RECORDS, DEMO_MEMBERS, DEMO_RECIPIENTS, DEMO_PLANS } from "./demo";

/**
 * The in-memory `DataClient` that ships with the scaffold. Backed by the fixed
 * demo household in `demo.ts`, so the public demo runs with no backend, no
 * secrets, and no network. Async to match the interface — the UI is written
 * against the same shape the Supabase adapter satisfies.
 */
export class DemoDataClient implements DataClient {
  async listRecords(): Promise<RecordMeta[]> {
    return DEMO_RECORDS;
  }

  async listMembers(): Promise<HouseholdMember[]> {
    return DEMO_MEMBERS;
  }

  async listRecipients(): Promise<Recipient[]> {
    // The demo fixture carries an extra `role` field the interface doesn't
    // need; map to the seam's shape so both clients return identical types.
    return DEMO_RECIPIENTS.map((r) => ({
      id: r.id,
      name: r.name,
      relationship: r.relationship,
      isMember: r.isMember,
      scopeTiers: r.scopeTiers,
    }));
  }

  async listPlans(): Promise<HandoverPlan[]> {
    return DEMO_PLANS;
  }

  /**
   * The demo has no stored ciphertext — the vault page seals its sample payloads
   * live in the browser to show the round-trip. Returning null keeps callers on
   * that path instead of inventing a fake blob here.
   */
  async getSealedRecord(): Promise<null> {
    return null;
  }

  // --- Writes are deliberately unsupported ---------------------------------
  //
  // This client is a module-level singleton shared by every request, so an
  // in-memory store would show one visitor's records to the next. A public demo
  // leaking its visitors' entries to each other would be a worse failure than
  // not supporting writes at all. Real households run the Supabase client.

  async createRecord(): Promise<never> {
    throw new Error(DEMO_READ_ONLY);
  }

  async updateRecord(): Promise<never> {
    throw new Error(DEMO_READ_ONLY);
  }

  async deleteRecord(): Promise<never> {
    throw new Error(DEMO_READ_ONLY);
  }
}

const DEMO_READ_ONLY =
  "The public demo is read-only. Connect a Supabase project to create your own records.";
