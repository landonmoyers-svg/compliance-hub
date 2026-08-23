import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy — what earlier Next.js versions called Middleware (renamed in 16; the
 * file must be `proxy.ts`, and a `middleware.ts` would simply never run).
 *
 * Its only job is to keep the Supabase auth cookies fresh. Access tokens are
 * short-lived, and Server Components cannot set cookies, so without this the
 * session would expire mid-session and the user would be silently signed out.
 *
 * Deliberately NOT an authorization gate. Per the Next.js authentication guide,
 * the proxy runs on every request including prefetches and should only do
 * optimistic, cookie-level work; the real check lives next to the data
 * (`requireCurrentUser` in lib/supabase/server.ts, called by the data seam).
 */
export async function proxy(request: NextRequest) {
  // No Supabase configured (demo mode) — nothing to refresh.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Touching getUser() is what triggers the refresh-and-set-cookies path.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets and images: they never carry a session worth refreshing,
  // and running on them would add latency to every asset request.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
