"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "./env";

/**
 * Browser-side Supabase client, used for the auth flows (sign in/out) that must
 * run where the cookies live.
 *
 * Unlike the server client, one instance per browser is correct and desirable —
 * it owns the auth state listener and token refresh timer, and creating several
 * would have them fight over the same session.
 */
let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    const { url, anonKey } = requireSupabaseEnv();
    client = createBrowserClient(url, anonKey);
  }
  return client;
}
