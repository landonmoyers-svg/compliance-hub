import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Generates the guidance layer for a form template: a short "how to complete
// this properly" header (documentation best-practices + legal-protective
// framing) plus per-field help text, and — where it clearly improves accuracy —
// upgrades a free-text field to a dropdown/date/checkbox with sensible options.
// Output is decision-support the practice reviews; it is not legal advice.
const SYSTEM = `You improve a fillable compliance/HR form for a small behavioral-health practice so that a non-expert can complete it correctly, accurately, and in a way that protects the practice legally. You are given the form's title, category, purpose, and its fields.

Produce two things:

1. "completionGuidance": 2–4 short sentences (plain text, no markdown headers) telling the person how to complete THIS form well. Always ground it in documentation best-practices appropriate to the form type: record observable facts not speculation or blame, avoid admissions of liability or legal conclusions, be specific (who/what/when/where), complete it promptly while details are fresh, and note that it becomes a business record. Tailor the emphasis to the form (e.g. incident/root-cause → objective facts + no fault-finding; HR discipline → consistent, factual, non-discriminatory language + the employee's opportunity to respond; PHI authorization → scope/expiration precision). Keep it encouraging and brief. Do NOT give legal advice or cite statutes.

2. "fields": for EACH input field, keep its "key" and "label" EXACTLY, and provide:
   - "guidance": one short sentence on what to enter and how to phrase it accurately/defensibly (or "" if truly self-evident like a signature).
   - "type": keep the existing type UNLESS a change clearly improves accuracy. You may upgrade a free-text field to "select" (when answers are a small known set — provide "options"), "date" (for a date), "checkbox" (yes/no attestation), or "number". Never downgrade a textarea narrative to a dropdown. Only output "select" with 2+ options.
   - "options": for "select" only, the allowed choices (short, mutually exclusive). Empty otherwise.

Return ONLY valid JSON:
{"completionGuidance":"<text>","fields":[{"key":"<key>","label":"<label>","guidance":"<text>","type":"text|textarea|date|number|checkbox|select","options":["..."]}]}
Return only the JSON object.`;

interface InField { key: string; label: string; type: string; options?: string[]; required?: boolean }

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as {
    title?: string; category?: string; description?: string; bodyText?: string; fields?: InField[];
  };
  const fields = body.fields ?? [];
  if (fields.length === 0) return NextResponse.json({ error: "Template has no fields." }, { status: 400 });

  const VALID_TYPES = new Set(["text", "textarea", "date", "number", "checkbox", "select"]);
  const userMsg = `FORM TITLE: ${body.title ?? "Untitled"}\nCATEGORY: ${body.category ?? "other"}\nPURPOSE: ${body.description ?? body.bodyText ?? "—"}\n\nFIELDS:\n${JSON.stringify(fields.map((f) => ({ key: f.key, label: f.label, type: f.type })))}\n\nReturn the JSON.`;

  type Parsed = { completionGuidance?: string; fields?: { key?: string; guidance?: string; type?: string; options?: string[] }[] };
  async function generateOnce(): Promise<Parsed> {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    return JSON.parse(match[0]) as Parsed;
  }

  try {
    // Haiku occasionally returns JSON with an empty/missing completionGuidance;
    // retry a couple of times so a form never silently ends up unguided.
    let parsed: Parsed = {};
    for (let attempt = 0; attempt < 3; attempt++) {
      parsed = await generateOnce();
      if ((parsed.completionGuidance ?? "").trim()) break;
    }
    if (!(parsed.completionGuidance ?? "").trim()) throw new Error("Model returned no guidance");

    // Merge the model output back onto the REAL fields (never trust it to
    // reconstruct the field set — only enrich existing keys).
    const byKey = new Map((parsed.fields ?? []).map((f) => [f.key ?? "", f]));
    const mergedFields = fields.map((f) => {
      const g = byKey.get(f.key);
      let type = f.type;
      let options = f.options ?? [];
      // Apply a type upgrade only when it's valid and, for select, has options.
      if (g?.type && VALID_TYPES.has(g.type) && g.type !== f.type) {
        if (g.type === "select") {
          const opts = (g.options ?? []).map((o) => String(o).trim()).filter(Boolean);
          if (opts.length >= 2) { type = "select"; options = opts; }
        } else if (g.type !== "select") {
          type = g.type;
          if (g.type !== "select") options = [];
        }
      }
      return {
        key: f.key,
        label: f.label,
        type: type as InField["type"],
        required: !!f.required,
        options,
        guidance: (g?.guidance ?? "").trim() || undefined,
      };
    });

    return NextResponse.json({
      completionGuidance: String(parsed.completionGuidance ?? "").trim(),
      fields: mergedFields,
    });
  } catch (err) {
    console.error("form-guidance error:", err);
    return NextResponse.json({ error: "Guidance generation failed. Try again." }, { status: 500 });
  }
}
