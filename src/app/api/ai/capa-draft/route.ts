import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a healthcare compliance analyst at a small behavioral-health practice drafting a Corrective and Preventive Action (CAPA) for a reported incident. Given the incident, propose a practical CAPA the compliance officer will review and edit.

Return ONLY valid JSON:
{"title":string,"rootCause":string,"actionPlan":string,"citation":string}

Rules:
- "title": a short CAPA title (max ~8 words).
- "rootCause": the most likely root cause in one sentence, phrased as a category + specifics (e.g. "Process gap — no offboarding checklist to revoke access").
- "actionPlan": 2–4 concrete steps as a single string, each step on its own line prefixed "1. ", "2. ", etc. Make them specific and verifiable.
- "citation": the most relevant regulation or standard for this incident's category, e.g. "45 CFR §164.308(a)(1)(ii)(C) (sanction/CAPA)" for HIPAA, an OSHA standard for safety, or "Practice policy — verify against SOP" when no external rule applies.
- Keep it grounded and practical for a small outpatient psychiatry practice. This is decision-support, not legal advice.
Return only the JSON object.`;

const CATEGORY_HINT: Record<string, string> = {
  privacy_hipaa: "HIPAA Privacy/Security Rule (45 CFR Part 164)",
  safety_osha: "OSHA General Duty Clause / relevant OSHA standard",
  billing: "payer billing/coding policy and False Claims Act considerations",
  hr_conduct: "workforce sanction policy and HR procedure",
  medication: "controlled-substance handling / medication-safety procedure",
  security: "HIPAA Security Rule technical/administrative safeguards (45 CFR §164.308–312)",
  other: "applicable practice policy / SOP",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as { title?: string; category?: string; description?: string; severity?: string };
  if (!body.title && !body.description) return NextResponse.json({ error: "Describe the incident first." }, { status: 400 });

  const hint = CATEGORY_HINT[body.category ?? "other"] ?? CATEGORY_HINT.other;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `Incident: ${body.title ?? ""}\nCategory: ${body.category ?? "other"} (most relevant standard: ${hint})\nSeverity: ${body.severity ?? "unknown"}\nDetails: ${body.description ?? "(none provided)"}\n\nDraft the CAPA JSON.`,
      }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    console.error("capa-draft error:", err);
    return NextResponse.json({ error: "AI draft failed. Try again." }, { status: 500 });
  }
}
