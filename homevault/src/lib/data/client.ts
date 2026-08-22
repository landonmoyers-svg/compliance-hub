import { createClient } from "@supabase/supabase-js";
import type { DataClient } from "./types";
import { DemoDataClient } from "./demo-client";
import { SupabaseDataClient } from "./supabase-client";

/**
 * Picks the `DataClient` implementation for this deployment.
 *
 * **Demo is the default, deliberately.** The Supabase adapter is used only when
 * `NEXT_PUBLIC_HOMEVAULT_BACKEND=supabase` is set explicitly. Phase 1 has the
 * backend provisioned but auth (passkey/WebAuthn + Argon2id, docs/SECURITY.md
 * § 2) is not built yet, so there is no signed-in user to scope RLS to. Until
 * that lands, the public deployment must keep serving the in-memory demo
 * rather than silently pointing at an empty — or worse, real — database.
 *
 * See docs/ROADMAP.md Phase 1 and DEPLOY.md Stage 2.
 */

export const HOMEVAULT_BACKEND = process.env.NEXT_PUBLIC_HOMEVAULT_BACKEND ?? "demo";

/** True once the app is configured to talk to the real Supabase project. */
export function isSupabaseBackend(): boolean {
  return HOMEVAULT_BACKEND === "supabase";
}

/**
 * The household to scope queries to. A single-tenant placeholder for Phase 1;
 * once auth lands this comes from the session's membership rather than config.
 */
const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_HOMEVAULT_HOUSEHOLD_ID ?? "";

let cached: DataClient | null = null;

export function getDataClient(): DataClient {
  if (cached) return cached;

  if (isSupabaseBackend()) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Fail loudly on a half-configured backend. Falling back to demo data here
    // would be worse than an error: the app would look healthy while showing a
    // fictional household.
    if (!url || !key) {
      throw new Error(
        "HOMEVAULT_BACKEND=supabase requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    if (!HOUSEHOLD_ID) {
      throw new Error("HOMEVAULT_BACKEND=supabase requires NEXT_PUBLIC_HOMEVAULT_HOUSEHOLD_ID.");
    }

    cached = new SupabaseDataClient(createClient(url, key), HOUSEHOLD_ID);
  } else {
    cached = new DemoDataClient();
  }

  return cached;
}
