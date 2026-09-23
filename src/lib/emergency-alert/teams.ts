/**
 * Microsoft Teams messages for Emergency Alert — the Adaptive Cards LP Alert
 * posted to the Emergency Response and Immediate Assistance channels.
 *
 * Webhook URLs are secrets (anyone holding one can post to the channel), so
 * they live in server env vars: TEAMS_WEBHOOK_URL and TEAMS_ASSISTANCE_WEBHOOK_URL.
 * The channel deep links below are not secrets — they only open the channel
 * for someone already in the team.
 */

import type { AssistanceRequest, EmergencyIncident, EmergencyResponse } from "@/lib/data/schema";
import { codeKind } from "./rules";

/** Per-organization Teams channel links (opened after triggering / responding). */
const CHANNELS: Record<string, { emergency: string; assistance: string }> = {
  // Lone Peak Psychiatry
  "c5cdf8c6-4a26-4be3-b2d8-6092e366dcbd": {
    emergency:
      "https://teams.microsoft.com/l/channel/19%3A198780adc5ea4b79b1a2d4a88d05c726%40thread.tacv2/Emergency%20Response%20Channel?groupId=8131e56d-e5b1-4c35-ac4a-66b65e6139da&tenantId=9efa52ce-c50d-4c6b-8e7f-7eeef630b852",
    assistance:
      "https://teams.microsoft.com/l/channel/19%3A922a0b3e813c403a9b4e09e24fc7e339%40thread.tacv2/Immediate%20Assistance%20%20(non-emergent)?groupId=8131e56d-e5b1-4c35-ac4a-66b65e6139da&tenantId=9efa52ce-c50d-4c6b-8e7f-7eeef630b852",
  },
};

export function teamsChannel(orgId: string | null | undefined, which: "emergency" | "assistance"): string | null {
  return (orgId && CHANNELS[orgId]?.[which]) || null;
}

/** Open a Teams channel: the desktop app first, the web client if the app didn't take focus. */
export function openTeams(webUrl: string | null) {
  if (!webUrl || typeof window === "undefined") return;
  window.open(webUrl.replace(/^https:/, "msteams:"), "_blank");
  setTimeout(() => {
    if (!document.hidden) window.open(webUrl, "_blank");
  }, 1500);
}

/* ------------------------------------------------------------- cards */

type Block = Record<string, unknown>;

const text = (t: string, extra: Block = {}): Block => ({ type: "TextBlock", text: t, wrap: true, ...extra });

function card(body: Block[], appUrl: string, actionTitle = "Open Emergency Dashboard") {
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body,
        actions: [{ type: "Action.OpenUrl", title: actionTitle, url: `${appUrl}/emergency` }],
      },
    }],
  };
}

function mountain(iso: string | null | undefined) {
  return new Date(iso ?? Date.now()).toLocaleString("en-US", {
    timeZone: "America/Denver", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
  });
}

function place(i: EmergencyIncident) {
  if (i.isRemote) return `Remote — ${[i.remoteCity, i.remoteState].filter(Boolean).join(", ") || "location unknown"}${i.locationName ? ` (for ${i.locationName})` : ""}`;
  return i.locationName ?? "Unknown site";
}

/** The first alert, posted the moment a code is triggered. */
export function incidentCard(i: EmergencyIncident, siteNotes: string[], appUrl: string, recording: boolean) {
  const test = i.isTest;
  const body: Block[] = [
    {
      type: "Container", style: "emphasis", items: [
        text(test ? "🧪 TEST ALERT — NOT A REAL EMERGENCY" : "🚨 EMERGENCY ALERT", { weight: "Bolder", color: test ? "Warning" : "Attention" }),
        text(`${test ? "[TEST] " : ""}${i.codeName}`, { weight: "Bolder", size: "ExtraLarge", spacing: "None" }),
      ],
    },
    {
      type: "FactSet", facts: [
        { title: "Site", value: place(i) },
        { title: "Exact location", value: i.internalLocation || "Not specified" },
        { title: "Notes", value: i.notes || "None" },
        { title: "Time", value: mountain(i.triggeredAt) },
        { title: "Triggered by", value: i.triggeredByName || "Unknown" },
      ],
    },
  ];
  if (siteNotes.length) {
    body.push({ type: "Container", style: "warning", items: siteNotes.map((n) => text(`⚠️ ${n}`, { color: "Warning" })) });
  }
  const steps = [
    `Open the Emergency Dashboard in Lone Peak Compliance and review the ${i.codeName} steps before responding.`,
    "Keep the Hub and Teams open for the whole incident.",
    "Whoever triggered the alert: click **Meet Now** at the top of this channel.",
    "Responders: join the meeting with your microphone MUTED and volume low — not audible to patients or bystanders.",
  ];
  if (codeKind(i.codeName) === "armed" || codeKind(i.codeName) === "behavioral") {
    steps.push("⚠️ Armed or combative person: turn your speakers OFF before joining.");
  }
  if (recording) steps.push("Audio is being recorded for administrative review. It is kept only on admin devices.");
  body.push({ type: "Container", style: "accent", items: [text("📋 RESPONDER INSTRUCTIONS", { weight: "Bolder", color: "Accent" }), ...steps.map((s) => text(`• ${s}`, { spacing: "Small" }))] });
  return card(body, appUrl);
}

/** Someone responded, or updated their status. */
export function responseCard(i: EmergencyIncident, r: EmergencyResponse, kind: "response" | "status", appUrl: string) {
  const status = r.status.replace("_", " ");
  const last = r.statusUpdates[r.statusUpdates.length - 1];
  return card([
    text(kind === "response" ? `✅ ${r.responderName ?? "Someone"} is responding` : `🔄 ${r.responderName ?? "Responder"}: ${status}`, { weight: "Bolder", size: "Medium" }),
    {
      type: "FactSet", facts: [
        { title: "Incident", value: `${i.isTest ? "[TEST] " : ""}${i.codeName} — ${place(i)}${i.internalLocation ? ` · ${i.internalLocation}` : ""}` },
        { title: "Role", value: r.responseRole || "—" },
        { title: "Assisting as", value: r.assistanceType || "—" },
        ...(r.itemsBringing.length ? [{ title: "Bringing", value: r.itemsBringing.join(", ") }] : []),
        ...(r.estimatedArrival ? [{ title: "ETA", value: r.estimatedArrival }] : []),
        { title: "Where", value: r.isRemote ? "Supporting remotely" : "On-site" },
        ...((kind === "status" ? last?.message : r.message) ? [{ title: "Message", value: (kind === "status" ? last?.message : r.message) as string }] : []),
      ],
    },
  ], appUrl);
}

export function resolvedCard(i: EmergencyIncident, appUrl: string) {
  const mins = i.resolvedAt ? Math.round((new Date(i.resolvedAt).getTime() - new Date(i.triggeredAt).getTime()) / 60000) : null;
  return card([
    text(`✅ RESOLVED — ${i.isTest ? "[TEST] " : ""}${i.codeName}`, { weight: "Bolder", size: "Large", color: "Good" }),
    {
      type: "FactSet", facts: [
        { title: "Site", value: `${place(i)}${i.internalLocation ? ` · ${i.internalLocation}` : ""}` },
        { title: "Resolved by", value: i.resolvedByName || "—" },
        { title: "Resolved at", value: mountain(i.resolvedAt) },
        ...(mins !== null ? [{ title: "Duration", value: `${mins} min` }] : []),
      ],
    },
    text("All clear. Please return to normal operations.", { isSubtle: true }),
  ], appUrl, "View incident history");
}

export function evacuationCard(i: EmergencyIncident, appUrl: string) {
  const what = i.evacuationStatus === "evacuate" ? "🚪 EVACUATE — move to the assembly point now" : "🔒 SHELTER IN PLACE — lock down and secure";
  return card([
    text(`${i.isTest ? "[TEST] " : ""}${i.codeName} — ${place(i)}`, { weight: "Bolder" }),
    text(what, { weight: "Bolder", size: "Large", color: "Attention" }),
  ], appUrl);
}

const URGENCY: Record<AssistanceRequest["urgency"], string> = { now: "🔴 NOW", within_5_mins: "🟡 Within 5 minutes" };

export function assistanceCard(a: AssistanceRequest, kind: "request" | "response" | "resolved", appUrl: string, who?: string, eta?: string) {
  const head =
    kind === "request" ? `🙋 Assistance requested — ${a.assistanceType}`
    : kind === "response" ? `👋 ${who ?? "Someone"} is coming to help${eta ? ` (${eta})` : ""}`
    : `✅ Assistance request handled`;
  return card([
    text(head, { weight: "Bolder", size: "Medium" }),
    {
      type: "FactSet", facts: [
        { title: "Requested by", value: a.requestedByName },
        { title: "Where", value: a.locationName || "—" },
        { title: "Urgency", value: URGENCY[a.urgency] },
        ...(a.notes ? [{ title: "Details", value: a.notes }] : []),
        ...(kind === "resolved" ? [{ title: "Handled by", value: a.resolvedByName || "—" }] : []),
      ],
    },
    text("Non-emergency request.", { isSubtle: true }),
  ], appUrl, "Open Emergency Dashboard");
}

export async function postToTeams(webhook: string | undefined, payload: unknown): Promise<{ ok: boolean; status?: number; reason?: string }> {
  if (!webhook) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "network" };
  }
}
