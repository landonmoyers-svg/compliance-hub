import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { DataClient } from "./types";
import { DemoDataClient } from "./demo-client";
import { SupabaseDataClient } from "./supabase-client";
import { createSupabaseServerClient, requireCurrentUser } from "../supabase/server";

/**
 * Picks the `DataClient` implementation for this request.
 *
 * This module is the app's **Data Access Layer**: the Next.js authentication
 * guide is explicit that the proxy is only an optimistic filter and that the
 * real authorization check belongs as close to the data as possible. That check
 * is `requireCurrentUser()` below — every Supabase-backed read passes through
 * here, so there is one place to audit.
 *
 * Server-only: it reads request cookies, so importing it from a Client
 * Component will fail the build rather than silently misbehave.
 *
 * **Demo is the default, deliberately.** The Supabase adapter is used only when
 * `NEXT_PUBLIC_HOMEVAULT_BACKEND=supabase`. See docs/ROADMAP.md Phase 1.
 */

export const HOMEVAULT_BACKEND = process.env.NEXT_PUBLIC_HOMEVAULT_BACKEND ?? "demo";

/** True once the app is configured to talk to the real Supabase project. */
export function isSupabaseBackend(): boolean {
  return HOMEVAULT_BACKEND === "supabase";
}

/** The demo client is stateless and user-independent, so one instance is fine. */
let demoClient: DemoDataClient | null = null;

/**
 * Find the household this user belongs to.
 *
 * Derived from membership rather than configuration: the row is visible only if
 * RLS says the caller is a member, so a user cannot reach another household's
 * data by guessing an id. Returns the first membership — multi-household
 * switching is a later concern.
 */
async function resolveHouseholdId(supabase: SupabaseClient, user: User): Promise<string> {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not resolve your household — ${error.message}`);
  if (!data) throw new Error("This account is not a member of any household yet.");
  return (data as { household_id: string }).household_id;
}

export async function getDataClient(): Promise<DataClient> {
  if (!isSupabaseBackend()) {
    demoClient ??= new DemoDataClient();
    return demoClient;
  }

  // Never cached: the client below carries one user's session. Reusing it
  // across requests would hand that session to the next caller.
  const supabase = await createSupabaseServerClient();
  const user = await requireCurrentUser();
  const householdId = await resolveHouseholdId(supabase, user);
  return new SupabaseDataClient(supabase, householdId);
}
