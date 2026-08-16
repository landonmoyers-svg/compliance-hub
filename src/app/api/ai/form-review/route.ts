import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// A pre-submit "documentation coach". It reviews what the user actually wrote on
// a compliance/HR form and flags wording that could weaken the record or expose
// the practice — speculation, blame, admissions of liability, legal conclusions,
// vagueness, or missing required detail — then suggests defensible rewording.
// This is documentation best-practice guidance, NOT legal advice.
const SYSTEM = `You are a careful compliance-documentation coach for a small behavioral-health practice. A staff member has filled out a form that becomes a business record. Review ONLY what they wrote and help them make it accurate, complete, and legally defensible.

Flag entries that:
- SPECULATE or assume cause/intent ("he was obviously angry", "she probably forgot") — records should state observable facts.
- Assign BLAME or make LEGAL CONCLUSIONS ("this was negligent", "we violated", "it's her fault") — describe what happened, not fault/liability.
- ADMIT liability or wrongdoing unnecessarily.
- Are VAGUE where specifics matter (missing who/what/when/where, "recently", "someone").
- Use EMOTIONAL, editorializing, or unprofessional language.
- Are INCOMPLETE for a required field, or internally INCONSISTENT (e.g. dates that don't line up).
- Include content that doesn't belong (e.g. full patient PHI where a de-identified reference is expected).

For each issue return the field key, a severity, a one-sentence plain explanation, and a concrete suggested rewrite that preserves the user's facts but makes them objective and defensible. Do NOT invent facts the user didn't provide — if something is missing, say what to add, don't fabricate it. If an entry is already good, don't flag it. Be encouraging and brief.

Return ONLY valid JSON:
{"issues":[{"fieldKey":"<key>","fieldLabel":"<label>","severity":"high"|"medium"|"low","note":"<one sentence>","suggestion":"<defensible rewrite or what to add, or empty>"}],"overall":"<one short encouraging sentence: ready to submit, or what to tighten first>"}
Return only the JSON object.`;

interface ReviewField { key: string; label: string; type: string; required?: boolean; guidance?: string }

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as {
    templateTitle?: string; purpose?: string; category?: string;
    fields?: ReviewField[]; values?: Record<string, string>;
  };
  const fields = body.fields ?? [];
  const values = body.values ?? {};
  // Only review fields the user actually wrote free text into (skip empty,
  // checkboxes, and dates — nothing to coach there).
  const answered = fields
    .filter((f) => f.type === "text" || f.type === "textarea")
    .map((f) => ({ key: f.key, label: f.label, required: !!f.required, guidance: f.guidance, value: (values[f.key] ?? "").trim() }))
    .filter((f) => f.value.length > 0);

  if (answered.length === 0) {
    return NextResponse.json({ issues: [], overall: "Nothing to review yet — fill in the narrative fields and check again." });
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `FORM: ${body.templateTitle ?? "Untitled"}${body.category ? ` (${body.category})` : ""}\nPURPOSE: ${body.purpose ?? "—"}\n\nWHAT THE USER WROTE (review these):\n${JSON.stringify(answered)}\n\nReturn the JSON.`,
      }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    const parsed = JSON.parse(match[0]) as { issues?: unknown[]; overall?: string };
    const validKeys = new Set(answered.map((f) => f.key));
    const issues = (Array.isArray(parsed.issues) ? parsed.issues : [])
      .filter((i): i is { fieldKey: string; fieldLabel?: string; severity?: string; note?: string; suggestion?: string } =>
        !!i && typeof i === "object" && validKeys.has((i as { fieldKey?: string }).fieldKey ?? ""))
      .map((i) => ({
        fieldKey: i.fieldKey,
        fieldLabel: i.fieldLabel ?? "",
        severity: (["high", "medium", "low"].includes(i.severity ?? "") ? i.severity : "low") as "high" | "medium" | "low",
        note: String(i.note ?? ""),
        suggestion: String(i.suggestion ?? ""),
      }));
    return NextResponse.json({ issues, overall: String(parsed.overall ?? "") });
  } catch (err) {
    console.error("form-review error:", err);
    return NextResponse.json({ error: "AI review failed. Try again." }, { status: 500 });
  }
}
