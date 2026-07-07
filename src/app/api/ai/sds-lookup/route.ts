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

  const systemPrompt = `You are an expert in chemical safety and OSHA Hazard Communication (HazCom).
Given a product UPC, barcode, or image of a product label, identify the chemical product and return its Safety Data Sheet (SDS) information.

Return ONLY valid JSON with these exact fields:
{
  "productName": "exact product name",
  "manufacturer": "manufacturer name",
  "upc": "UPC or product code if known",
  "signalWord": "DANGER" | "WARNING" | "CAUTION" | "NONE",
  "hazardSummary": "brief description of main hazards (1-2 sentences)",
  "confidence": "high" | "medium" | "low"
}

Signal word rules:
- DANGER: highly hazardous (flammable liquids, acute toxicity cat 1-3, skin corrosion)
- WARNING: moderately hazardous (acute toxicity cat 4, skin irritation, eye irritation)
- CAUTION: slightly hazardous (minor irritants)
- NONE: non-hazardous

If you cannot identify the product with reasonable confidence, return confidence: "low" and your best guess.
Return only the JSON object, no other text.`;

  try {
    let messageContent: Anthropic.MessageParam["content"];

    if (imageBase64 && mimeType) {
      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: imageBase64,
          },
        },
        {
          type: "text",
          text: "Identify this chemical/hazardous product and return its SDS information as JSON.",
        },
      ];
    } else {
      messageContent = `Look up SDS information for the product with UPC/barcode: ${upc}. Return the SDS data as JSON.`;
    }

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const result = JSON.parse(jsonMatch[0]) as {
      productName: string;
      manufacturer: string;
      upc: string;
      signalWord: string;
      hazardSummary: string;
      confidence: string;
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("SDS lookup error:", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
