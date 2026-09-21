import { NextRequest, NextResponse } from "next/server";

/**
 * Clinic Desk calls these routes from inside its own Compliance Hub pane — the
 * Hub's own page, signed in as the person using it — so every request is
 * same-origin and carries that person's session. Nothing else is accepted: no
 * API key exists to leak, and a page on another site cannot drive these routes
 * with the user's cookies, because the browser marks such a request cross-site
 * and a cross-origin JSON POST cannot be sent without a CORS grant this app
 * never gives.
 */
export function sameOriginOnly(request: NextRequest): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return NextResponse.json({ error: "Only Compliance Hub's own pages can call this." }, { status: 403 });
  }
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (!origin || origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Only Compliance Hub's own pages can call this." }, { status: 403 });
    }
    if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) {
      return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
    }
  }
  return null;
}
