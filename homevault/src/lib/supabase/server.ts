import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "./env";

/**
 * Server-side Supabase client, bound to the request's cookies so Row-Level
 * Security evaluates as the signed-in user.
 *
 * **Never cache or share this across requests.** It carries one user's session;
 * a module-level singleton would hand that session to whoever asked next. A new
 * client per request is the only safe shape.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies. Harmless here: the proxy
          // (src/proxy.ts) refreshes the session on every request, so the
          // browser still receives rotated tokens.
        }
      },
    },
  });
}

/**
 * The authenticated user, or null.
 *
 * Always `getUser()`, never `getSession()`: the session is read straight from a
 * cookie the browser could have tampered with, whereas `getUser()` validates the
 * token against Supabase Auth. On the server, only the validated answer counts.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/**
 * Authorization check for the data layer. The Next.js guidance is explicit that
 * the proxy is only an optimistic filter and the real check belongs next to the
 * data — this is that check.
 */
export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");
  return user;
}
