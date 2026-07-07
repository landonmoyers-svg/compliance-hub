import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_DAILY_CAP = 200;

export interface AiCapResult {
  ok: boolean;
  count: number;
  limit: number;
}

/**
 * Runaway-usage guard: atomically counts this user's AI calls for the day and
 * reports whether they're within the daily cap. Enforced server-side in every
 * AI route so no single user can run up the Anthropic bill. Fails OPEN — a
 * counter error never blocks a legitimate call (the console spend cap is the
 * hard backstop). Override the cap with the AI_DAILY_CAP env var.
 */
export async function enforceAiCap(supabase: SupabaseClient): Promise<AiCapResult> {
  const limit = Number(process.env.AI_DAILY_CAP) || DEFAULT_DAILY_CAP;
  try {
    const { data, error } = await supabase.rpc("bump_ai_usage");
    if (error) return { ok: true, count: 0, limit };
    const count = typeof data === "number" ? data : 0;
    return { ok: count <= limit, count, limit };
  } catch {
    return { ok: true, count: 0, limit };
  }
}
