import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { buildComplianceSnapshot } from "@/lib/ai/evidence-snapshot";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a healthcare compliance auditor helping a small behavioral-health practice run an internal audit / mock survey (HIPAA, OSHA, payer, or internal).

You are given (A) a list of audit checklist items (each with a category and the audit type) and (B) a LIVE SNAPSHOT of what the practice actually has in its own compliance system. For EACH item, use the snapshot as evidence to propose a result the human will review.

Return ONLY valid JSON:
{"suggestions":[{"id":string,"result":"pass"|"partial"|"fail"|"na","severity":"low"|"medium"|"high","finding":string,"remediation":string,"citation":string}]}

Rules:
- "result": "pass" = evidence shows the item is satisfied; "partial" = partly satisfied / minor gaps; "fail" = not evidenced / a real gap; "na" = not applicable to this practice.
- "severity": only meaningful for partial/fail (how serious the gap is); use "low" for pass/na.
- "finding": ONE plain sentence describing what the evidence shows (state the numbers). For pass, describe the positive evidence; for partial/fail, describe the gap. Empty string "" only if truly nothing to say.
- "remediation": for partial/fail, ONE concrete next step to close the gap; "" for pass/na.
- "citation": a short source combining the in-app evidence and, where relevant, the standard, e.g. "Vendor Management: 3 of 4 BAAs signed · 45 CFR §164.308(b)" or "Training: 12 of 14 assignments complete". If the snapshot has no evidence, say "no evidence in system — verify manually".
- NEVER mark "pass" without supporting evidence in the snapshot. When unsure, use "partial" or "fail" so a human verifies. Decision-support, not legal advice.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as { items?: { id: string; question: string; category: string }[]; auditType?: string };
  const items = body.items ?? [];
  if (items.length === 0) return NextResponse.json({ error: "No audit items to analyze." }, { status: 400 });

  const snapshot = await buildComplianceSnapshot(supabase);
  const itemList = items.map((it, i) => ({ n: i + 1, id: it.id, category: it.category, question: it.question }));

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `Audit type: ${body.auditType ?? "internal"}\n\n${snapshot}\n\nAUDIT ITEMS (return one suggestion per id):\n${JSON.stringify(itemList)}\n\nReturn the JSON with a suggestion for every id.`,
      }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    const parsed = JSON.parse(match[0]) as { suggestions?: unknown[] };
    return NextResponse.json({ suggestions: parsed.suggestions ?? [] });
  } catch (err) {
    console.error("audit-prefill error:", err);
    return NextResponse.json({ error: "AI prefill failed. Try again." }, { status: 500 });
  }
}
