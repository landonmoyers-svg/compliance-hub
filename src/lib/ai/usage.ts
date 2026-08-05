import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Role-based daily AI cap. Regular staff/contractors get a lower ceiling than
 * admins / HR / clinical-leadership (the compliance-officer tier), so a broad
 * low-privilege account can't run up the Anthropic bill while power users
 * aren't throttled. Enforced server-side in every AI route.
 *
 * All limits are env-tunable (per tier). Fails OPEN on a counter error — a
 * transient DB blip never blocks a legitimate call (the console spend cap is
 * the hard backstop). `bump_ai_usage()` returns {count, role} in one round-trip.
 */

// owner is intentionally NOT in this set — the owner has no AI cap (unlimited).
const PRIVILEGED_ROLES = new Set(["admin", "hr", "clinical_leadership"]);

function envNum(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Daily request cap for a given account role. Returns Infinity for unlimited. */
export function aiCapForRole(role: string): number {
  if (role === "owner") return envNum("AI_DAILY_CAP_OWNER", Infinity); // unlimited by default
  if (PRIVILEGED_ROLES.has(role)) return envNum("AI_DAILY_CAP_PRIVILEGED", 500);
  if (role === "manager") return envNum("AI_DAILY_CAP_MANAGER", 300);
  if (role === "read_only") return envNum("AI_DAILY_CAP_READONLY", 30);
  // staff, contractor, or unknown — the base tier (legacy AI_DAILY_CAP still honored).
  return envNum("AI_DAILY_CAP_STAFF", envNum("AI_DAILY_CAP", 50));
}

export interface AiCapResult {
  ok: boolean;
  count: number;
  limit: number;
  role?: string;
}

/**
 * Atomically counts this user's AI calls for the day and reports whether
 * they're within their role's daily cap.
 */
export async function enforceAiCap(supabase: SupabaseClient): Promise<AiCapResult> {
  try {
    const { data, error } = await supabase.rpc("bump_ai_usage");
    // Fail OPEN if the counter errors or returns nothing.
    if (error || !data) return { ok: true, count: 0, limit: aiCapForRole("staff") };
    const count = typeof data.count === "number" ? data.count : 0;
    const role = typeof data.role === "string" ? data.role : "staff";
    const limit = aiCapForRole(role);
    return { ok: count <= limit, count, limit, role };
  } catch {
    return { ok: true, count: 0, limit: aiCapForRole("staff") };
  }
}
