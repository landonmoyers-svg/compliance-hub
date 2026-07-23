import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Sage checks whether the practice's SOPs are in alignment with a specific
 * regulation/law: is it covered, by which SOP(s), what's missing, and what to
 * change. Grounded ONLY in the SOP text provided — decision support, verify.
 */

const SYSTEM = `You are Sage, a behavioral-health compliance assistant. Given ONE regulation/law/guidance and the practice's Standard Operating Procedures (SOPs) provided to you, assess whether the SOPs are in ALIGNMENT with that regulation.

Judge only from the SOP text provided — do not assume policies exist if they aren't shown. Be specific and practical.

Return ONLY valid JSON:
{
  "coverage": "covered" | "partial" | "gap",
  "coveringSops": ["exact SOP titles that address this regulation"],
  "aligned": ["specific requirements the SOPs DO satisfy"],
  "gaps": ["specific requirements of this regulation the SOPs do NOT address or contradict"],
  "recommendations": ["concrete SOP edits or new SOPs to close the gaps"],
  "summary": "1-2 sentence plain-language verdict"
}

Rules:
- "covered": an SOP clearly and substantially addresses the regulation's requirements.
- "partial": some requirements addressed, others missing or vague.
- "gap": no SOP meaningfully addresses this regulation.
- coveringSops must be titles from the provided SOPs (empty if none).
- Keep arrays short and concrete. Do not invent citations. Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as {
    source?: { title?: string; citationLabel?: string; issuingBody?: string; jurisdiction?: string; sourceType?: string };
    sops?: { title?: string; area?: string; summary?: string; content?: string }[];
  };
  const source = body.source;
  if (!source?.title) return NextResponse.json({ error: "Missing regulation." }, { status: 400 });

  const sops = (body.sops ?? []).slice(0, 12).map((s) => ({
    title: (s.title ?? "").slice(0, 200),
    area: (s.area ?? "").slice(0, 120),
    summary: (s.summary ?? "").slice(0, 400),
    content: (s.content ?? "").slice(0, 1500),
  }));

  const prompt = `REGULATION / LAW to align to:
Title: ${source.title}
Citation: ${source.citationLabel || "—"}
Issuing body: ${source.issuingBody || "—"}
Jurisdiction: ${source.jurisdiction || "—"}
Type: ${source.sourceType || "regulation"}

The practice's SOPs (title — area — summary — content excerpt):
${sops.length === 0 ? "(No SOPs were matched to this regulation.)" : sops.map((s, i) => `#${i + 1} ${s.title} — ${s.area || "n/a"}\nSummary: ${s.summary || "n/a"}\nExcerpt: ${s.content || "n/a"}`).join("\n\n")}

Assess alignment and return the JSON.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    console.error("sop-alignment error:", err);
    return NextResponse.json({ error: "Alignment check failed. Try again." }, { status: 500 });
  }
}
