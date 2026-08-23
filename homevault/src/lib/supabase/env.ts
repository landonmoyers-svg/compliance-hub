/**
 * Supabase configuration, validated in one place.
 *
 * Only the two `NEXT_PUBLIC_` values are read here. They are safe in the browser
 * by design: the publishable/anon key carries no privileges of its own — every
 * query is still gated by Row-Level Security for the signed-in user. The
 * service-role key is deliberately absent from this module so it can never be
 * pulled into a client bundle.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/** Throws with an actionable message rather than failing deep inside a query. */
export function requireSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return { url, anonKey };
}

/** Whether Supabase *could* be used, without throwing — for feature gating. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
