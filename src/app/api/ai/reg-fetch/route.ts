import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Fetch the CURRENT version of a tracked regulatory source's referenced document
 * (public government regulations/laws/guidance) for internal reference: Sage web-
 * fetches the official URL and/or searches for the current text, and returns a
 * plain-language summary, the key provisions, and the effective/version label.
 * The page stores this on the source so Policy Q&A can give full answers.
 */

const SYSTEM = `You (Sage) retrieve the CURRENT version of a referenced regulation, law, or official guidance document for a behavioral-health practice's internal reference. These are public government sources.

Use the web_fetch tool on the official URL when one is given, and web_search to confirm the current/effective version and catch recent changes. Base your answer ONLY on what you retrieve — do not fabricate provisions or dates.

Return ONLY valid JSON:
{
  "summary": "1-2 sentence plain-language summary of what this document requires or covers",
  "keyProvisions": "the key requirements/provisions a practice must follow, as concise lines separated by newlines (start each with '- ')",
  "version": "the current edition / effective date / last-revised date as stated (e.g. 'Effective Jan 1, 2024' or, if none is shown, 'Current as of <today's date>')",
  "note": "one short note about any recent update or an important caveat, or empty string"
}

If you cannot retrieve the live document, summarize it from established knowledge and set "note" to say the live source could not be fetched and to verify at the official link. Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const { source } = await request.json() as {
    source?: { title?: string; citationLabel?: string; issuingBody?: string; jurisdiction?: string; officialUrl?: string; sourceType?: string };
  };
  if (!source?.title) return NextResponse.json({ error: "Missing source." }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Retrieve the current version of this document (today is ${today}):
Title: ${source.title}
Citation: ${source.citationLabel || "—"}
Issuing body: ${source.issuingBody || "—"}
Jurisdiction: ${source.jurisdiction || "—"}
Type: ${source.sourceType || "regulation"}
Official URL: ${source.officialUrl || "(none — search for the authoritative current source)"}

${source.officialUrl ? "Fetch the official URL above, then" : "Search for the authoritative current source, then"} summarize the current version and its key provisions. Return the JSON.`;

  const tools: Anthropic.Messages.ToolUnion[] = [
    { type: "web_search_20250305", name: "web_search", max_uses: 4 },
    { type: "web_fetch_20250910", name: "web_fetch", max_uses: 3 },
  ];

  try {
    const convo: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
    let response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools,
      messages: convo,
    });
    // web_search / web_fetch run server-side; a long turn can pause — resume it.
    for (let i = 0; i < 4 && response.stop_reason === "pause_turn"; i++) {
      convo.push({ role: "assistant", content: response.content });
      response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools,
        messages: convo,
      });
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    const d = JSON.parse(match[0]) as { summary?: string; keyProvisions?: string; version?: string; note?: string };
    return NextResponse.json({
      summary: d.summary ?? "",
      content: d.keyProvisions ?? "",
      version: d.version ?? `Current as of ${today}`,
      note: d.note ?? "",
    });
  } catch (err) {
    console.error("reg-fetch error:", err);
    return NextResponse.json({ error: "Couldn't fetch the current version. Try again, or open the official link." }, { status: 502 });
  }
}
