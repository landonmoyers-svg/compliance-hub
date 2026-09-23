import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — IMPORTANT: do not remove this
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/auth/");
  // Microsoft sends the sign-in popup here with the authorization code in the
  // query string. Redirecting it to the login page would throw the code away,
  // so this page is never gated; it holds nothing and only hands the code to
  // the window that opened it.
  const isMsCallback = path === "/ms-auth";
  const isApiRoute = path.startsWith("/api/");

  // Unauthenticated users can only access auth routes and public API
  if (!user && !isAuthRoute && !isApiRoute && !isMsCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Authenticated users don't need the login page
  if (user && path === "/auth/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files, Next.js internals, _next, the
    // public desktop-update feed/artifacts (Sparkle fetches these unauthenticated),
    // the PWA files — browsers refuse a service worker served via a redirect, so
    // gating /sw.js silently broke install + emergency push notifications — and
    // /tessdata, the offline text-recognition language data. That last one is
    // public dictionary data with nothing of the practice's in it, and it is
    // fetched by a worker: a redirect to the login page comes back as a corrupt
    // download rather than an error anyone could act on.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|appcast\\.xml|downloads/|tessdata/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xml|zip)$).*)",
  ],
};
