import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Central client-error sink. Every error caught by the app's error boundaries
 * POSTs here. We always log it server-side (so it shows up in Vercel logs — real
 * central visibility, the thing that was missing) and, when SENTRY_DSN is set,
 * forward it to Sentry via the dependency-free envelope endpoint. No DSN → the
 * forward is simply skipped, so this is safe to ship before Sentry is set up.
 */
interface ClientErrorBody {
  message?: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  context?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  let body: ClientErrorBody = {};
  try { body = (await request.json()) as ClientErrorBody; } catch { /* ignore malformed */ }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Structured so it's greppable in Vercel logs.
  console.error("[client-error]", JSON.stringify({
    message: body.message ?? "Unknown error",
    url: body.url,
    at: new Date().toISOString(),
    ip,
    context: body.context,
    stack: body.stack?.split("\n").slice(0, 8).join("\n"),
  }));

  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    try { await forwardToSentry(dsn, body); } catch { /* never fail the request on a forward error */ }
  }
  return NextResponse.json({ ok: true });
}

/** Send an event to Sentry using the public envelope endpoint — no SDK needed.
 *  DSN shape: https://<publicKey>@<host>/<projectId> */
async function forwardToSentry(dsn: string, body: ClientErrorBody): Promise<void> {
  const m = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn);
  if (!m) return;
  const [, key, host, projectId] = m;
  const url = `https://${host}/api/${projectId}/envelope/?sentry_key=${key}&sentry_version=7`;
  const eventId = (globalThis.crypto?.randomUUID?.() ?? "").replace(/-/g, "");
  const sentAt = new Date().toISOString();
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: "javascript",
    level: "error",
    logger: "client-error-boundary",
    exception: { values: [{ type: "ClientError", value: body.message ?? "Unknown error" }] },
    request: { url: body.url, headers: body.userAgent ? { "User-Agent": body.userAgent } : undefined },
    extra: { stack: body.stack, ...body.context },
  };
  const envelope =
    JSON.stringify({ event_id: eventId, sent_at: sentAt }) + "\n" +
    JSON.stringify({ type: "event" }) + "\n" +
    JSON.stringify(event);
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope" },
    body: envelope,
  });
}
