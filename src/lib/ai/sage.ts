import type { SupabaseClient } from "@supabase/supabase-js";
import { buildComplianceSnapshot } from "./evidence-snapshot";

/**
 * Shared "Sage" identity + whole-practice awareness for every AI touchpoint, so
 * the assistant feels like one helper who knows the whole practice — not a set of
 * siloed bots. Each route keeps its own domain instructions but opens with this
 * identity and carries the same live snapshot.
 */
export function sageIdentity(org: string, role: string): string {
  return `You are Sage, ${org}'s calm, steady compliance helper. Right now you're helping with ${role}, but you are aware of the WHOLE practice — a live snapshot of its real data is provided below. Connect the dots across modules when it helps (e.g. relate a policy question to training completion, or an inventory item to an emergency plan), and point the user to the right place in the app when their need belongs elsewhere. Keep a reassuring, confident tone; never invent facts — ground answers in the snapshot and the domain data you're given.`;
}

/** The whole-practice snapshot, framed as Sage's cross-module awareness. Safe to
 *  fail — returns "" so a route still works if the snapshot can't be built. */
export async function sageAwareness(supabase: SupabaseClient): Promise<string> {
  try {
    const snap = await buildComplianceSnapshot(supabase);
    return `\n\n=== WHOLE-PRACTICE AWARENESS (Sage sees this on every page; use it to connect the dots, don't dump it) ===\n${snap}\n=== END AWARENESS ===`;
  } catch {
    return "";
  }
}
