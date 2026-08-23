import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataClient, HouseholdMember, Recipient, SealedRecordInput } from "./types";
import type { CategoryKey, SensitivityTier } from "../domain/categories";
import type { RecordKind, RecordMeta } from "../domain/records";
import type { HandoverPlan, HandoverState, HandoverTrigger, TriggerCombine } from "../domain/handover";
import type { SealedBytes } from "../crypto/envelope";

/**
 * The `DataClient` backed by the dedicated HomeVault Supabase project
 * (schema: supabase/migrations/0000_homevault_baseline.sql).
 *
 * Zero-knowledge discipline, enforced here at the seam:
 *   • Reads select ONLY non-secret columns. `ciphertext`, `iv`, and
 *     `wrapped_data_key` are never requested by these list methods — the
 *     dashboard/vault/handover views run entirely on metadata, so a compromise
 *     of this path leaks no sealed payloads.
 *   • Row-Level Security is the second fence; the queries below are scoped to
 *     one household and rely on RLS to reject anything else.
 */

/** Row shapes as they come back from Postgres (snake_case). */
interface RecordRow {
  id: string;
  household_id: string;
  category: string;
  tier: string;
  label: string;
  kind: string;
  has_physical_location: boolean;
  expires_on: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  display_name: string | null;
}

interface RecipientRow {
  id: string;
  user_id: string | null;
  name: string;
  relationship: string | null;
  scope_tiers: string[] | null;
}

interface PlanRow {
  id: string;
  household_id: string;
  tiers: string[];
  triggers: unknown;
  combine: string;
  grace_days: number;
  state: string;
  recipient_ids: string[] | null;
}

/**
 * Postgres `date` columns come back as `YYYY-MM-DD`, but a column typed
 * `timestamptz` would arrive as a full ISO string. The domain treats
 * `expiresOn` as a plain calendar day, so normalize to the first 10 chars —
 * the same seam-parity rule the sibling app learned the hard way.
 */
function toDateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function toRecordMeta(row: RecordRow): RecordMeta {
  return {
    id: row.id,
    householdId: row.household_id,
    category: row.category as CategoryKey,
    tier: row.tier as SensitivityTier,
    label: row.label,
    kind: row.kind as RecordKind,
    hasPhysicalLocation: row.has_physical_location,
    expiresOn: toDateOnly(row.expires_on),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPlan(row: PlanRow): HandoverPlan {
  return {
    id: row.id,
    householdId: row.household_id,
    tiers: (row.tiers ?? []) as SensitivityTier[],
    // `triggers` is jsonb holding HandoverTrigger[] (see domain/handover.ts).
    triggers: (Array.isArray(row.triggers) ? row.triggers : []) as HandoverTrigger[],
    combine: row.combine as TriggerCombine,
    graceDays: row.grace_days,
    recipientIds: row.recipient_ids ?? [],
    state: row.state as HandoverState,
  };
}

/** Surface Postgres errors with the table name so failures aren't silent. */
function fail(table: string, message: string): never {
  throw new Error(`HomeVault: "${table}" — ${message}`);
}

/** The non-secret columns, shared by every read that returns metadata. */
const META_COLUMNS =
  "id, household_id, category, tier, label, kind, has_physical_location, expires_on, created_at, updated_at";

/** Map a sealed record to its row form. Ciphertext in, nothing readable. */
function toRow(input: SealedRecordInput) {
  return {
    category: input.meta.category,
    tier: input.meta.tier,
    label: input.meta.label,
    kind: input.meta.kind,
    has_physical_location: input.meta.hasPhysicalLocation,
    expires_on: input.meta.expiresOn,
    ciphertext: input.sealed.ciphertext,
    iv: input.sealed.iv,
    wrapped_data_key: input.sealed.wrappedDataKey,
  };
}

export class SupabaseDataClient implements DataClient {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly householdId: string,
  ) {}

  async listRecords(): Promise<RecordMeta[]> {
    const { data, error } = await this.supabase
      .from("records")
      // Non-secret columns only — never ciphertext/iv/wrapped_data_key.
      .select(META_COLUMNS)
      .eq("household_id", this.householdId)
      .order("created_at", { ascending: true });

    if (error) fail("records", error.message);
    return (data as RecordRow[]).map(toRecordMeta);
  }

  async listMembers(): Promise<HouseholdMember[]> {
    const { data, error } = await this.supabase
      .from("household_members")
      .select("id, user_id, role, display_name")
      .eq("household_id", this.householdId);

    if (error) fail("household_members", error.message);
    return (data as MemberRow[]).map((row) => ({
      id: row.id,
      // The baseline schema stores auth.users ids, not names. Until profile
      // display names land, fall back to a stable non-identifying label rather
      // than leaking a raw uuid into the UI.
      name: row.display_name ?? "Household member",
      role: row.role as HouseholdMember["role"],
    }));
  }

  async listRecipients(): Promise<Recipient[]> {
    const { data, error } = await this.supabase
      .from("handover_recipients")
      .select("id, user_id, name, relationship, scope_tiers")
      .eq("household_id", this.householdId);

    if (error) fail("handover_recipients", error.message);
    return (data as RecipientRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      relationship: row.relationship ?? "",
      // A recipient with no linked auth user is an external party (e.g. the
      // household's attorney) — they still hold an escrow share.
      isMember: row.user_id !== null,
      scopeTiers: (row.scope_tiers ?? []) as SensitivityTier[],
    }));
  }

  async getSealedRecord(id: string): Promise<SealedBytes | null> {
    const { data, error } = await this.supabase
      .from("records")
      .select("ciphertext, iv, wrapped_data_key")
      .eq("id", id)
      .eq("household_id", this.householdId)
      .maybeSingle();

    if (error) fail("records", error.message);
    if (!data) return null;

    const row = data as { ciphertext: string; iv: string; wrapped_data_key: string };
    return { ciphertext: row.ciphertext, iv: row.iv, wrappedDataKey: row.wrapped_data_key };
  }

  async createRecord(input: SealedRecordInput): Promise<RecordMeta> {
    const { data, error } = await this.supabase
      .from("records")
      .insert({
        // The household comes from the caller's membership, never from input —
        // otherwise a crafted request could write into someone else's vault.
        household_id: this.householdId,
        ...toRow(input),
      })
      .select(META_COLUMNS)
      .single();

    if (error) fail("records", error.message);
    return toRecordMeta(data as RecordRow);
  }

  async updateRecord(id: string, input: SealedRecordInput): Promise<RecordMeta> {
    const { data, error } = await this.supabase
      .from("records")
      .update(toRow(input))
      .eq("id", id)
      .eq("household_id", this.householdId)
      .select(META_COLUMNS)
      .single();

    if (error) fail("records", error.message);
    return toRecordMeta(data as RecordRow);
  }

  async deleteRecord(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("records")
      .delete()
      .eq("id", id)
      .eq("household_id", this.householdId);

    if (error) fail("records", error.message);
  }

  async listPlans(): Promise<HandoverPlan[]> {
    const { data, error } = await this.supabase
      .from("handover_plans")
      .select("id, household_id, tiers, triggers, combine, grace_days, state, recipient_ids")
      .eq("household_id", this.householdId)
      .order("created_at", { ascending: true });

    if (error) fail("handover_plans", error.message);
    return (data as PlanRow[]).map(toPlan);
  }
}
