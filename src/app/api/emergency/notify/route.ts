import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emergencyIncidentMap, emergencyResponseMap, assistanceRequestMap, emergencySiteSettingsMap } from "@/lib/data/emergency-mappers";
import type { WorkLocation } from "@/lib/data/schema";
import { siteContext } from "@/lib/emergency-alert/rules";
import {
  assistanceCard, evacuationCard, incidentCard, postToTeams, resolvedCard, responseCard,
} from "@/lib/emergency-alert/teams";
import { sendEmergencyPush } from "@/lib/emergency-alert/push-server";

/**
 * Fan an emergency event out to the channels that reach people who don't have
 * the Hub open: the Teams channel (and, when configured, browser push).
 *
 * The caller names WHAT happened (event + record id); the server re-reads the
 * record with the caller's own session, so RLS decides whether they may see it
 * and nobody can post arbitrary text to the practice's Teams channel.
 */

const PROD_APP_URL = "https://compliance-hub-lone-peak.vercel.app";

type Event =
  | { event: "incident"; id: string }
  | { event: "response"; id: string }
  | { event: "status"; id: string }
  | { event: "resolved"; id: string }
  | { event: "evacuation"; id: string }
  | { event: "assistance"; id: string }
  | { event: "assistance_response"; id: string; who?: string; eta?: string }
  | { event: "assistance_resolved"; id: string };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as Event;
  if (!body?.id || !body?.event) return NextResponse.json({ error: "event and id are required" }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || PROD_APP_URL;
  const emergencyHook = process.env.TEAMS_WEBHOOK_URL;
  const assistanceHook = process.env.TEAMS_ASSISTANCE_WEBHOOK_URL || process.env.TEAMS_WEBHOOK_URL;

  const loadIncident = async (id: string) => {
    const { data } = await supabase.from("emergency_incidents").select("*").eq("id", id).maybeSingle();
    return data ? emergencyIncidentMap.from(data) : null;
  };

  switch (body.event) {
    case "incident": {
      const i = await loadIncident(body.id);
      if (!i) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const [{ data: settingsRows }, { data: locRows }, { data: codeRow }] = await Promise.all([
        supabase.from("emergency_site_settings").select("*"),
        supabase.from("locations").select("id, name"),
        i.codeId ? supabase.from("emergency_codes").select("audio_recording_enabled").eq("id", i.codeId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const notes = siteContext(i, (settingsRows ?? []).map(emergencySiteSettingsMap.from), (locRows ?? []) as WorkLocation[]).map((m) => m.text);
      const recording = !!(codeRow as { audio_recording_enabled?: boolean } | null)?.audio_recording_enabled;
      const [teams, push] = await Promise.all([
        postToTeams(emergencyHook, incidentCard(i, notes, appUrl, recording)),
        sendEmergencyPush(user.id, {
          title: `${i.isTest ? "[TEST] " : "🚨 "}${i.codeName}`,
          body: `${i.locationName ?? "Remote"}${i.internalLocation ? ` · ${i.internalLocation}` : ""} — ${i.triggeredByName ?? ""}`,
          tag: `incident-${i.id}`,
          url: "/emergency",
          urgent: !i.isTest,
        }),
      ]);
      return NextResponse.json({ teams, push });
    }
    case "response":
    case "status": {
      const { data } = await supabase.from("emergency_responses").select("*").eq("id", body.id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const r = emergencyResponseMap.from(data);
      const i = await loadIncident(r.incidentId);
      if (!i) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ teams: await postToTeams(emergencyHook, responseCard(i, r, body.event, appUrl)) });
    }
    case "resolved":
    case "evacuation": {
      const i = await loadIncident(body.id);
      if (!i) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const payload = body.event === "resolved" ? resolvedCard(i, appUrl) : evacuationCard(i, appUrl);
      const push = body.event === "evacuation"
        ? await sendEmergencyPush(user.id, {
            title: i.evacuationStatus === "evacuate" ? "EVACUATE NOW" : "SHELTER IN PLACE",
            body: `${i.codeName} — ${i.locationName ?? ""}`,
            tag: `incident-${i.id}`,
            url: "/emergency",
            urgent: true,
          })
        : undefined;
      return NextResponse.json({ teams: await postToTeams(emergencyHook, payload), push });
    }
    case "assistance":
    case "assistance_response":
    case "assistance_resolved": {
      const { data } = await supabase.from("assistance_requests").select("*").eq("id", body.id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const a = assistanceRequestMap.from(data);
      const kind = body.event === "assistance" ? "request" : body.event === "assistance_response" ? "response" : "resolved";
      const extra = body.event === "assistance_response" ? body : undefined;
      return NextResponse.json({ teams: await postToTeams(assistanceHook, assistanceCard(a, kind, appUrl, extra?.who, extra?.eta)) });
    }
    default:
      return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }
}
