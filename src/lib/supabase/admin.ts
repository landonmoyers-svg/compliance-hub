import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service-role key. NEVER import this in
 * a "use client" file — it bypasses RLS. Requires SUPABASE_SERVICE_ROLE_KEY to
 * be set in the environment (Supabase dashboard → Project Settings → API).
 * Returns null if the key isn't configured so callers can fail gracefully.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
