import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { buildComplianceSnapshot } from "@/lib/ai/evidence-snapshot";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a HIPAA Security Rule compliance analyst helping a small behavioral-health practice complete its annual Security Risk Assessment (45 CFR §164.308–164.316).

You are given (A) a list of safeguard questions, each with a regulation citation and the practice's typical evidence checkboxes, and (B) a LIVE SNAPSHOT of what the practice actually has configured in its own compliance system. For EACH question, use the snapshot as evidence to propose an answer the human will review.

Return ONLY valid JSON of the form:
{"suggestions":[{"id":string,"status":"yes"|"partial"|"no"|"na","response":string,"riskLevel":"low"|"medium"|"high"|"na","citation":string,"evidence":string[]}]}

Rules:
- "status": "yes" = the safeguard is in place per the evidence; "partial" = partially in place / some gaps; "no" = not evidenced / a gap; "na" = genuinely not applicable to this practice.
- "riskLevel" MUST follow status: yes→low, partial→medium, no→high, na→na.
- "response": ONE or TWO plain-language sentences stating the current state, referencing the SPECIFIC evidence from the snapshot (numbers where available), or naming the gap. Write it so a manager could paste it into an auditor's report.
- "citation": a short source string that combines (1) the in-app evidence you relied on and (2) the regulation, e.g. "Vendor Management: 3 of 4 required BAAs signed · 45 CFR §164.308(b)". If the snapshot has NO evidence for a question, cite the regulation and add "— no evidence in system, verify manually".
- "evidence": choose the subset of the question's provided checkbox options that the snapshot actually supports (exact strings from that question's options; [] if none).
- NEVER claim a control is in place without evidence in the snapshot. When unsure, prefer "partial" or "no" so a human verifies. This is decision-support, not legal advice.
Return only the JSON object, nothing else.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as { findings?: { id: string; question: string; category: string; cfr: string; options: string[] }[] };
  const findings = body.findings ?? [];
  if (findings.length === 0) return NextResponse.json({ error: "No safeguards to analyze." }, { status: 400 });

  // --- Live, RLS-scoped evidence snapshot from the practice's own data ---
  const snapshot = await buildComplianceSnapshot(supabase);

  const questionList = findings.map((f, i) => ({ n: i + 1, id: f.id, category: f.category, cfr: f.cfr, question: f.question, options: f.options }));

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `${snapshot}\n\nSAFEGUARD QUESTIONS (return one suggestion per id):\n${JSON.stringify(questionList)}\n\nReturn the JSON with a suggestion for every id.`,
      }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    const parsed = JSON.parse(match[0]) as { suggestions?: unknown[] };
    return NextResponse.json({ suggestions: parsed.suggestions ?? [] });
  } catch (err) {
    console.error("sra-prefill error:", err);
    return NextResponse.json({ error: "AI prefill failed. Try again." }, { status: 500 });
  }
}
