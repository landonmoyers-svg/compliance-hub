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
}
