"use client";

import type { VaultKeyEnvelope } from "../crypto/keys";
import type { RecoveryEnvelope } from "../crypto/recovery";
import { getSupabaseBrowserClient } from "../supabase/browser";
import { bytesToBase64, base64ToBytes } from "../crypto/encoding";

/**
 * Where a member's *wrapped* vault key lives.
 *
 * Everything crossing this interface is already opaque: a wrapped key plus the
 * non-secret KDF parameters needed to redo the derivation. The unwrapped vault
 * key never leaves the browser, so this can be backed by localStorage (demo) or
 * by Postgres (a real household) without changing the security story.
 *
 * Runs in the browser rather than through the server data seam because the
 * wrapping and unwrapping happen here; a server round-trip would add nothing
 * and would put key material in more places.
 */
export interface VaultBackend {
  /** This member's envelope, or null if they have no vault on this account yet. */
  loadEnvelope(): Promise<StoredEnvelope | null>;
  /** First-run: create the household and store the owner's wrapped key. */
  createHousehold(input: CreateHouseholdInput): Promise<void>;
  /** Re-wrap after a passphrase change, or after recovery. */
  updateEnvelope(envelope: VaultKeyEnvelope, deviceSalt: Uint8Array): Promise<void>;
  /** The household's recovery envelope, if one has been issued. */
  loadRecovery(): Promise<RecoveryEnvelope | null>;
  saveRecovery(envelope: RecoveryEnvelope): Promise<void>;
}

export interface StoredEnvelope {
  envelope: VaultKeyEnvelope;
  /** Stable per-member salt the device factor is derived against. */
  deviceSalt: Uint8Array;
  householdId: string;
  householdName: string;
}

export interface CreateHouseholdInput {
  householdName: string;
  displayName: string | null;
  envelope: VaultKeyEnvelope;
  deviceSalt: Uint8Array;
}

// ---------------------------------------------------------------------------
// Demo — this browser only
// ---------------------------------------------------------------------------

const ENVELOPE_KEY = "homevault:demo:envelope";
const SALT_KEY = "homevault:demo:device-salt";
const RECOVERY_KEY = "homevault:demo:recovery";

export class LocalVaultBackend implements VaultBackend {
  async loadEnvelope(): Promise<StoredEnvelope | null> {
    const raw = localStorage.getItem(ENVELOPE_KEY);
    const salt = localStorage.getItem(SALT_KEY);
    if (!raw || !salt) return null;
    try {
      return {
        envelope: JSON.parse(raw) as VaultKeyEnvelope,
        deviceSalt: base64ToBytes(salt),
        householdId: "demo-household",
        householdName: "The Rivera household",
      };
    } catch {
      return null;
    }
  }

  async createHousehold({ envelope, deviceSalt }: CreateHouseholdInput): Promise<void> {
    localStorage.setItem(ENVELOPE_KEY, JSON.stringify(envelope));
    localStorage.setItem(SALT_KEY, bytesToBase64(deviceSalt));
  }

  async updateEnvelope(envelope: VaultKeyEnvelope, deviceSalt: Uint8Array): Promise<void> {
    localStorage.setItem(ENVELOPE_KEY, JSON.stringify(envelope));
    localStorage.setItem(SALT_KEY, bytesToBase64(deviceSalt));
  }

  async loadRecovery(): Promise<RecoveryEnvelope | null> {
    const raw = localStorage.getItem(RECOVERY_KEY);
    return raw ? (JSON.parse(raw) as RecoveryEnvelope) : null;
  }

  async saveRecovery(envelope: RecoveryEnvelope): Promise<void> {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(envelope));
  }
}

// ---------------------------------------------------------------------------
// Supabase — a real household
// ---------------------------------------------------------------------------

interface MemberEnvelopeRow {
  household_id: string;
  wrapped_vault_key: string | null;
  kdf: VaultKeyEnvelope["kdf"] | null;
  device_salt: string | null;
  households: { name: string } | { name: string }[] | null;
}

/** PostgREST returns an embedded one-to-one as an object or a single-element array. */
function embeddedName(rel: MemberEnvelopeRow["households"]): string {
  if (!rel) return "Your household";
  return (Array.isArray(rel) ? rel[0]?.name : rel.name) ?? "Your household";
}

export class SupabaseVaultBackend implements VaultBackend {
  private householdId: string | null = null;

  async loadEnvelope(): Promise<StoredEnvelope | null> {
    const supabase = getSupabaseBrowserClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;

    const { data, error } = await supabase
      .from("household_members")
      .select("household_id, wrapped_vault_key, kdf, device_salt, households(name)")
      .eq("user_id", auth.user.id)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Could not load your vault — ${error.message}`);
    if (!data) return null;

    const row = data as unknown as MemberEnvelopeRow;
    this.householdId = row.household_id;

    // A membership can exist before its key material does (mid-signup). Treat
    // that as "no vault yet" rather than handing back a half-built envelope.
    if (!row.wrapped_vault_key || !row.kdf || !row.device_salt) return null;

    return {
      envelope: { wrappedVaultKey: row.wrapped_vault_key, kdf: row.kdf },
      deviceSalt: base64ToBytes(row.device_salt),
      householdId: row.household_id,
      householdName: embeddedName(row.households),
    };
  }

  async createHousehold(input: CreateHouseholdInput): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    // A SECURITY DEFINER function: creating the household and the owner's
    // membership must be one atomic step, and RLS cannot allow a bare insert
    // into household_members without letting anyone join any household.
    const { data, error } = await supabase.rpc("create_household", {
      p_name: input.householdName,
      p_wrapped_vault_key: input.envelope.wrappedVaultKey,
      p_kdf: input.envelope.kdf,
      p_device_salt: bytesToBase64(input.deviceSalt),
      p_display_name: input.displayName,
    });

    if (error) throw new Error(`Could not create your household — ${error.message}`);
    this.householdId = data as string;
  }

  async updateEnvelope(envelope: VaultKeyEnvelope, deviceSalt: Uint8Array): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Not signed in.");

    const { error } = await supabase
      .from("household_members")
      .update({
        wrapped_vault_key: envelope.wrappedVaultKey,
        kdf: envelope.kdf,
        device_salt: bytesToBase64(deviceSalt),
      })
      .eq("user_id", auth.user.id);

    if (error) throw new Error(`Could not save your vault key — ${error.message}`);
  }

  async loadRecovery(): Promise<RecoveryEnvelope | null> {
    const householdId = await this.requireHouseholdId();
    const { data, error } = await getSupabaseBrowserClient()
      .from("households")
      .select("recovery_wrapped_vault_key, recovery_salt, recovery_created_at")
      .eq("id", householdId)
      .maybeSingle();

    if (error) throw new Error(`Could not read recovery status — ${error.message}`);
    const row = data as {
      recovery_wrapped_vault_key: string | null;
      recovery_salt: string | null;
      recovery_created_at: string | null;
    } | null;
    if (!row?.recovery_wrapped_vault_key || !row.recovery_salt) return null;

    return {
      wrappedVaultKey: row.recovery_wrapped_vault_key,
      salt: row.recovery_salt,
      createdAt: row.recovery_created_at ?? "",
    };
  }

  async saveRecovery(envelope: RecoveryEnvelope): Promise<void> {
    const householdId = await this.requireHouseholdId();
    const { error } = await getSupabaseBrowserClient()
      .from("households")
      .update({
        recovery_wrapped_vault_key: envelope.wrappedVaultKey,
        recovery_salt: envelope.salt,
        recovery_created_at: envelope.createdAt,
      })
      .eq("id", householdId);

    if (error) throw new Error(`Could not save your recovery code — ${error.message}`);
  }

  private async requireHouseholdId(): Promise<string> {
    if (this.householdId) return this.householdId;
    const stored = await this.loadEnvelope();
    if (this.householdId) return this.householdId;
    if (!stored) throw new Error("You are not a member of a household yet.");
    return stored.householdId;
  }
}
