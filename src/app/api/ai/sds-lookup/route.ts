import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic();

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as { upc?: string; imageBase64?: string; mimeType?: string };
  const { upc, imageBase64, mimeType } = body;

  if (!upc && !imageBase64) {
    return NextResponse.json({ error: "Provide a UPC/barcode or an image" }, { status: 400 });
  }

  const systemPrompt = `You are an expert in chemical safety and OSHA Hazard Communication (HazCom). You have a web_search tool — USE IT to look up the ACTUAL current Safety Data Sheet for the product from the web; do not rely on memory.

Given a product UPC/barcode or a photo of a product label: first identify the exact product name, manufacturer, and UPC. Then search the web RIGHT NOW for its real SDS and extract the data from that document.
Run searches like:
  - "<product> <manufacturer> safety data sheet PDF"
  - "<product> SDS filetype:pdf"
  - "<product> SDS site:sds.chemtel.net"
  - the manufacturer's official website
Find a REAL direct link to the SDS PDF (or the specific SDS product page) from the search results.

Return ONLY valid JSON with these exact fields:
{
  "productName": "exact product name",
  "manufacturer": "manufacturer name",
  "upc": "UPC or product code if known, else empty string",
  "casNumber": "primary CAS number if applicable, else empty string",
  "signalWord": "DANGER" | "WARNING" | "CAUTION" | "NONE",
  "hazardSummary": "1-2 sentence plain-language summary of the main hazards",
  "hazardStatements": "the key GHS hazard (H) statements, one per line (e.g. 'H225 Highly flammable liquid and vapor'). Empty string if non-hazardous.",
  "firstAid": "concise first-aid measures by route (eyes / skin / inhalation / ingestion), one per line",
  "handling": "key handling & storage precautions, one per line",
  "ppe": "recommended personal protective equipment (e.g. 'Gloves; safety glasses; ventilation')",
  "revisionDate": "the SDS revision/issue date if shown (YYYY-MM-DD), else empty string",
  "sdsSourceUrl": "a REAL direct URL to the SDS PDF or SDS product page you found in the search results — never a search-results page, never google.com, never a guessed/homepage URL. Empty string if truly none found.",
  "confidence": "high" | "medium" | "low"
}

Signal word rules:
- DANGER: highly hazardous (flammable liquids, acute toxicity cat 1-3, skin corrosion)
- WARNING: moderately hazardous (acute toxicity cat 4, skin irritation, eye irritation)
- CAUTION: slightly hazardous (minor irritants)
- NONE: non-hazardous

Ground every field in the SDS you find on the web. If a field genuinely doesn't apply or you can't find it, use an empty string — do NOT invent a CAS number, H-code, or URL. Set confidence by how well the found SDS matches the product. Return only the JSON object, no other text.`;

  try {
    const content: Anthropic.ContentBlockParam[] = [];
    if (imageBase64 && mimeType) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: imageBase64 },
      });
      content.push({ type: "text", text: "Identify this product from the label photo, search the web for its current SDS, and return the JSON." });
    } else {
      content.push({ type: "text", text: `Search the web for the current SDS of the product with UPC/barcode ${upc}, and return the JSON.` });
    }

    // Live web grounding — the equivalent of the original app's
    // add_context_from_internet: the model searches the web for the real SDS.
    const tools: Anthropic.Messages.ToolUnion[] = [
      { type: "web_search_20250305", name: "web_search", max_uses: 5 },
    ];
    const convo: Anthropic.MessageParam[] = [{ role: "user", content }];
    const sys = [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }];
    let response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system: sys,
      tools,
      messages: convo,
    });
    // web_search runs server-side; a long turn can pause — resume it.
    for (let i = 0; i < 4 && response.stop_reason === "pause_turn"; i++) {
      convo.push({ role: "assistant", content: response.content });
      response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        system: sys,
        tools,
        messages: convo,
      });
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const result = JSON.parse(jsonMatch[0]) as Record<string, string>;

    // Guard against a non-real SDS URL (search page / google / non-http) so the
    // UI never surfaces junk — mirrors the original app's URL guards.
    const url = String(result.sdsSourceUrl ?? "");
    if (!/^https?:\/\//i.test(url) || /(google|bing|duckduckgo)\.[a-z.]+\/(search|url)|\/search\?/i.test(url)) {
      result.sdsSourceUrl = "";
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("SDS lookup error:", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
