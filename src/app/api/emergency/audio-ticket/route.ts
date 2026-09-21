import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_ROLES } from "@/lib/auth/roles";

/**
 * Tickets for incident audio. Audio travels phone → admin device directly
 * (WebRTC), and the signalling channel is shared by the whole organization —
 * so the phone must not trust a device just because it asked. A device that
 * wants the audio first gets a short-lived ticket here (only admins, or people
 * an admin marked "can listen"); the phone sends that ticket back here to
 * verify it before opening a connection. The audio itself never touches this
 * server.
 *
 *   GET  → issue a ticket for the signed-in user (403 if not allowed)
 *   POST {ticket} → verify one presented by another device
 */

const TTL_SECONDS = 60 * 60 * 12;

function secret(): string | null {
  const s = process.env.AUDIO_TICKET_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return s ? `emergency-audio:${s}` : null;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string, key: string) => createHmac("sha256", key).update(body).digest("base64url");

interface Claims { u: string; n: string; o: string; save: boolean; exp: number }

export async function GET() {
  const key = secret();
  if (!key) return NextResponse.json({ error: "Audio tickets aren't configured." }, { status: 501 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: membership }, { data: profile }, { data: responder }] = await Promise.all([
    supabase.from("org_memberships").select("org_id, account_role").eq("user_id", user.id).eq("active", true).limit(1).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("emergency_responder_profiles").select("can_listen_audio").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 403 });
  const privileged = (ADMIN_ROLES as readonly string[]).includes(membership.account_role as string);
  const canListen = privileged || !!responder?.can_listen_audio;
  if (!canListen) return NextResponse.json({ error: "Not permitted to receive incident audio." }, { status: 403 });

  const claims: Claims = {
    u: user.id,
    n: (profile?.full_name as string | undefined) ?? user.email ?? "Admin",
    o: membership.org_id as string,
    save: privileged, // only admins keep recordings; "can listen" people hear live only
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const body = b64(JSON.stringify(claims));
  return NextResponse.json({ ticket: `${body}.${sign(body, key)}`, name: claims.n, canSave: claims.save });
}

export async function POST(request: NextRequest) {
  const key = secret();
  if (!key) return NextResponse.json({ ok: false }, { status: 501 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { ticket } = (await request.json()) as { ticket?: string };
  const [body, sig] = (ticket ?? "").split(".");
  if (!body || !sig) return NextResponse.json({ ok: false });
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return NextResponse.json({ ok: false });

  const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as Claims;
  if (claims.exp < Date.now() / 1000) return NextResponse.json({ ok: false, reason: "expired" });

  // The verifying phone must be in the same organization as the listener.
  const { data: mine } = await supabase.from("org_memberships").select("org_id").eq("user_id", user.id).eq("active", true).eq("org_id", claims.o).maybeSingle();
  if (!mine) return NextResponse.json({ ok: false });

  return NextResponse.json({ ok: true, userId: claims.u, name: claims.n, canSave: claims.save });
}
