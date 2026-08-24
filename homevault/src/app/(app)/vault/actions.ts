"use server";

import { revalidatePath } from "next/cache";
import { getDataClient } from "@/lib/data/client";
import type { SealedRecordInput } from "@/lib/data/types";
import type { SealedBytes } from "@/lib/crypto/envelope";
import { CATEGORY_BY_KEY, type CategoryKey, type SensitivityTier } from "@/lib/domain/categories";
import type { RecordKind } from "@/lib/domain/records";

/**
 * Server Actions for vault records.
 *
 * The payload arrives already sealed — the browser encrypts before calling —
 * so nothing here can read a secret even in principle. What these functions
 * DO enforce is authorization and shape:
 *
 * Next.js is explicit that Server Functions are reachable by direct POST, not
 * just through the UI, so every one of them must verify auth itself. That check
 * lives in `getDataClient()`, which resolves the caller's household from their
 * membership — a crafted request cannot name someone else's household.
 */

const TIERS: SensitivityTier[] = ["critical", "high", "standard"];
const KINDS: RecordKind[] = ["digital", "physical", "both"];

export interface RecordFormInput {
  category: string;
  tier: string;
  label: string;
  kind: string;
  expiresOn: string | null;
  hasPhysicalLocation: boolean;
  sealed: SealedBytes;
}

/**
 * Validate untrusted input at the boundary. A bad category or tier would
 * otherwise reach Postgres as an invalid enum and surface as a raw database
 * error, and `label` is stored in plaintext so it must not be unbounded.
 */
function toInput(form: RecordFormInput): SealedRecordInput {
  const label = form.label.trim();
  if (!label) throw new Error("Give the record a label.");
  if (label.length > 120) throw new Error("Labels are limited to 120 characters.");

  if (!CATEGORY_BY_KEY[form.category as CategoryKey]) throw new Error("Unknown category.");
  if (!TIERS.includes(form.tier as SensitivityTier)) throw new Error("Unknown sensitivity tier.");
  if (!KINDS.includes(form.kind as RecordKind)) throw new Error("Unknown record kind.");
  if (form.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(form.expiresOn)) {
    throw new Error("Expiry must be a calendar date.");
  }
  if (!form.sealed?.ciphertext || !form.sealed.iv || !form.sealed.wrappedDataKey) {
    throw new Error("This record was not sealed — refusing to store it.");
  }

  return {
    meta: {
      category: form.category as CategoryKey,
      tier: form.tier as SensitivityTier,
      label,
      kind: form.kind as RecordKind,
      hasPhysicalLocation: form.hasPhysicalLocation,
      expiresOn: form.expiresOn || null,
    },
    sealed: form.sealed,
  };
}

export async function createRecordAction(form: RecordFormInput): Promise<void> {
  const data = await getDataClient();
  await data.createRecord(toInput(form));
  revalidatePath("/vault");
  revalidatePath("/dashboard");
}

export async function updateRecordAction(id: string, form: RecordFormInput): Promise<void> {
  const data = await getDataClient();
  await data.updateRecord(id, toInput(form));
  revalidatePath("/vault");
  revalidatePath("/dashboard");
}

export async function deleteRecordAction(id: string): Promise<void> {
  const data = await getDataClient();
  await data.deleteRecord(id);
  revalidatePath("/vault");
  revalidatePath("/dashboard");
}

/** Fetch one record's ciphertext, for a reveal. Still opaque to the server. */
export async function getSealedRecordAction(id: string): Promise<SealedBytes | null> {
  const data = await getDataClient();
  return data.getSealedRecord(id);
}
