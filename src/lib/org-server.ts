import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ORG_NAME } from "./org";

/**
 * Resolve the current organization's name from settings (RLS-scoped to the
 * caller's org once multi-tenant). Falls back to the default so AI prompts and
 * exports never break. Used by server routes to keep prompts org-aware.
 */
export async function getOrgName(supabase: SupabaseClient): Promise<string> {
  try {
    const { data } = await supabase
      .from("organization_settings")
      .select("org_name")
      .limit(1)
      .maybeSingle();
    const name = (data?.org_name as string | undefined)?.trim();
    return name || DEFAULT_ORG_NAME;
  } catch {
    return DEFAULT_ORG_NAME;
  }
}
