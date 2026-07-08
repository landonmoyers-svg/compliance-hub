import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You prefill a form for a healthcare practice using ONLY the known CONTEXT provided (the assigned employee's record, the organization, and today's date). Map each form field to a value when the context clearly supplies it; otherwise leave it out.

Return ONLY valid JSON:
{"values":{"<fieldKey>":"<value>"},"sources":{"<fieldKey>":"<short source>"}}

Rules:
- Only include a field in "values" when you can fill it from the CONTEXT. Do NOT guess names, dates, IDs, or clinical facts that aren't in the context.
- For a field of type "select", the value MUST be exactly one of that field's options (or omit it).
- For "date" fields, use YYYY-MM-DD. "Today"/"date signed"/"date completed" → the provided today's date.
- For "checkbox" fields, only fill "true" when the context clearly warrants it; otherwise omit.
- "sources": for every key you filled, give a 2–4 word source, e.g. "Employee record", "Org settings", "Today's date".
- Prefer leaving a field blank over filling it wrong. This is decision-support; a human reviews before submitting.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as {
    fields?: { key: string; label: string; type: string; options?: string[] }[];
    context?: Record<string, string>;
  };
  const fields = (body.fields ?? []).filter((f) => f.type !== "textarea");
  if (fields.length === 0) return NextResponse.json({ values: {}, sources: {} });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `CONTEXT (the only facts you may use):\n${JSON.stringify(body.context ?? {})}\n\nFORM FIELDS to fill:\n${JSON.stringify(fields)}\n\nReturn the JSON.`,
      }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    const parsed = JSON.parse(match[0]) as { values?: Record<string, string>; sources?: Record<string, string> };
    return NextResponse.json({ values: parsed.values ?? {}, sources: parsed.sources ?? {} });
  } catch (err) {
    console.error("form-prefill error:", err);
    return NextResponse.json({ error: "AI prefill failed. Try again." }, { status: 500 });
  }
}
