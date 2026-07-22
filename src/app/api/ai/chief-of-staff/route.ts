import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { getOrgName } from "@/lib/org-server";
import { sageIdentity, sageAwareness } from "@/lib/ai/sage";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const buildSystem = (org: string) => `${sageIdentity(org, "the compliance officer's prioritized plan (a daily briefing)")}

You receive the officer's current prioritized work items (already ranked by risk and urgency) and produce a short, energizing morning briefing that makes them feel in control and a step ahead — never overwhelmed.

Rules:
- Be concise: 4–7 sentences total. Lead with what's genuinely urgent (overdue / today), then the smart move for the week.
- Batch like-with-like ("knock out the three credential renewals together"), and suggest the single most efficient order to tackle the top items.
- Call out where they're actually AHEAD or in good shape, so it feels like winning, not drowning.
- Respect the officer's stated focus areas and preferences.
- Practical and warm, not corporate. No preamble like "Here is your briefing" — just start.
- Never invent items beyond those provided. If the list is short or empty, reassure them they're on top of it and note anything worth doing to stay ahead.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as {
    items: { title: string; why: string; bucket: string; category: string; risk: number; dueLabel?: string }[];
    focusAreas?: string; agentNotes?: string; name?: string; today?: string;
  };
  const items = (body.items ?? []).slice(0, 40);

  const lines = items.map((i) => `- [${i.bucket}] (risk ${i.risk}) ${i.title}${i.dueLabel ? ` — ${i.dueLabel}` : ""} — ${i.why}`).join("\n");
  const context = `Today: ${body.today ?? "unknown"}\nOfficer: ${body.name ?? "the compliance officer"}\nStated focus areas: ${body.focusAreas || "none specified"}\nPreferences the officer told you: ${body.agentNotes || "none specified"}\n\nCurrent prioritized work items (${items.length}):\n${lines || "(nothing outstanding)"}`;

  const [orgName, awareness] = await Promise.all([getOrgName(supabase), sageAwareness(supabase)]);
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 640,
      system: [
        { type: "text", text: buildSystem(orgName), cache_control: { type: "ephemeral" } },
        { type: "text", text: awareness },
      ],
      messages: [{ role: "user", content: context }],
    });
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("");
    return NextResponse.json({ text });
  } catch (err) {
    console.error("chief-of-staff error:", err);
    return NextResponse.json({ error: "Briefing failed" }, { status: 500 });
  }
}
