import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client — safe to import in "use client" components.
// Uses the anon (public) key; RLS policies on the DB enforce access control.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
