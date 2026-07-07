import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a Chief Compliance Officer writing a concise quarterly compliance report for the Board of Directors of Lone Peak Psychiatry, a behavioral-health practice. You are given the current status of the program across the OIG's seven elements of an effective compliance program, plus key metrics.

Write a board-ready report (250–400 words) with:
- A one-paragraph executive summary (overall health + tone: confident, candid).
- A short bulleted status of the seven elements, noting strengths and any gaps.
- 3–5 prioritized recommendations / focus areas for next quarter.
Be specific to the metrics provided; do not invent numbers. Professional, plain English, no fluff. Start directly with the executive summary (no "Dear Board").`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as { elements: { name: string; status: string; metric: string }[]; overall: number; period?: string };
  const lines = (body.elements ?? []).map((e) => `- ${e.name}: ${e.status} (${e.metric})`).join("\n");
  const content = `Reporting period: ${body.period ?? "current quarter"}\nOverall program score: ${body.overall}%\n\nSeven elements status:\n${lines}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("");
    return NextResponse.json({ text });
  } catch (err) {
    console.error("board-report error:", err);
    return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
  }
}
