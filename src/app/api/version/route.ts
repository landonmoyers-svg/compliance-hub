import { NextResponse } from "next/server";

/**
 * Returns the running build's identifier so an already-open client can detect
 * that a new version has been deployed and prompt the user to reload. On Vercel
 * this is the git commit SHA (changes every deploy); "dev" locally.
 *
 * Why this exists: the service worker is network-first and caches no bundles,
 * but a long-lived tab / installed PWA keeps running the JS it booted with until
 * reloaded — after a security-relevant deploy (e.g. the server-signed storage
 * flow) a stale client can misbehave. Polling this lets the app self-heal.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || "dev";
  return NextResponse.json(
    { version },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
