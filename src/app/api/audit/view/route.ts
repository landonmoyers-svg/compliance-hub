import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Record a client-initiated access event — a page view, a document open, an
 * export, a sign-in/out. The actor is taken from the authenticated session, not
 * the request body, so entries can't be spoofed; the client may only log
 * read/session actions (create/update/delete come from DB triggers). Captures
 * IP, device type, and geolocation (Vercel edge headers) for "from where".
 * Feeds the Audit Trail (HIPAA Security-Rule audit controls, §164.312(b)).
 */
const CLIENT_ACTIONS = new Set(["view", "export", "acknowledge", "sign", "login", "logout"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);

/** Coarse device class from the User-Agent string. */
function deviceType(ua: string | null): string | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  if (/\bipad\b|tablet|playbook|silk/.test(s) || (/android/.test(s) && !/mobile/.test(s))) return "Tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/.test(s)) return "Mobile";
  if (/bot|crawler|spider|curl|wget|python-requests/.test(s)) return "Bot";
  return "Desktop";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    action?: string; entityType?: string; entityId?: string; entityLabel?: string; details?: string; riskLevel?: string;
  };
  const action = CLIENT_ACTIONS.has(body.action ?? "") ? body.action! : "view";
  const riskLevel = RISKS.has(body.riskLevel ?? "") ? body.riskLevel! : "medium";

  const h = request.headers;
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  const ua = h.get("user-agent");
  const city = h.get("x-vercel-ip-city");
  const geoCity = city ? decodeURIComponent(city) : null;
  const geoRegion = h.get("x-vercel-ip-country-region");
  const geoCountry = h.get("x-vercel-ip-country");

  const { data: profile } = await supabase
    .from("profiles").select("full_name, email").eq("user_id", user.id).single();

  const { error } = await supabase.from("audit_logs").insert({
    actor_name: profile?.full_name ?? user.email ?? "Unknown",
    actor_email: profile?.email ?? user.email ?? null,
    action,
    entity_type: body.entityType ?? "page",
    entity_id: body.entityId ?? null,
    entity_label: body.entityLabel ?? null,
    details: body.details ?? null,
    risk_level: riskLevel,
    ip_address: ip,
    user_agent: ua,
    device_type: deviceType(ua),
    geo_city: geoCity,
    geo_region: geoRegion,
    geo_country: geoCountry,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
