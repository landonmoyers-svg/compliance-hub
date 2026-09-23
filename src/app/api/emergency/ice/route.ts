import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Network servers for the phone → admin audio link. STUN is always included.
 * A TURN relay is added when configured (TURN_URLS comma-separated, plus
 * TURN_USERNAME / TURN_CREDENTIAL) — needed on networks that block direct
 * peer connections (common on cellular). A relay only forwards the already
 * encrypted stream; it can't hear or keep the audio. Signed-in users only, so
 * the relay credentials aren't handed to the public.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const iceServers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = process.env.TURN_URLS?.split(",").map((u) => u.trim()).filter(Boolean);
  if (turn?.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({ urls: turn, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return NextResponse.json({ iceServers, relay: iceServers.length > 1 }, { headers: { "Cache-Control": "no-store" } });
}
