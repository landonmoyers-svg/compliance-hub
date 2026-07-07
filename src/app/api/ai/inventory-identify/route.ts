import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

type IdentifyResult = {
  itemName: string;
  itemType: string;
  condition: "new" | "good" | "fair" | "poor";
  description: string;
  estimatedValueUsd: number;
  valueRationale: string;
  suggestedLocationName: string | null;
  suggestedSublocation: string | null;
  confidence: "high" | "medium" | "low";
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    imageBase64?: string;
    mimeType?: string;
    locationNames?: string[]; // the org's known Work Locations, to suggest a match
  };
  const { imageBase64, mimeType, locationNames = [] } = body;

  if (!imageBase64 || !mimeType) {
    return NextResponse.json({ error: "An image is required" }, { status: 400 });
  }

  const locationHint = locationNames.length
    ? `The practice has these known locations — if the setting visually resembles one, put its EXACT name in suggestedLocationName, otherwise use null:\n${locationNames.map((n) => `- ${n}`).join("\n")}`
    : `No known locations were provided; set suggestedLocationName to null.`;

  const systemPrompt = `You are an asset-management assistant for a behavioral-health practice. You are shown a photo of a physical item to be catalogued as inventory. Identify the item and estimate its details.

Return ONLY valid JSON with these exact fields:
{
  "itemName": "concise item name (include brand/model if visible)",
  "itemType": "one of: equipment, furniture, electronics, medical, supply, appliance, other",
  "condition": "new" | "good" | "fair" | "poor",
  "description": "1-2 sentence description incl. any visible brand, model, size, distinguishing marks",
  "estimatedValueUsd": number (fair current replacement/resale value in US dollars, your best estimate),
  "valueRationale": "one short sentence explaining the value estimate",
  "suggestedLocationName": string or null,
  "suggestedSublocation": "short guess at a sub-location from visual context (e.g. 'wall-mounted', 'on shelf', 'reception desk'), or null",
  "confidence": "high" | "medium" | "low"
}

${locationHint}

Base the value on the item you actually see. If you cannot identify it confidently, set confidence "low", give your best guess, and keep estimatedValueUsd conservative. Return only the JSON object, no other text.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 640,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageBase64,
            },
          },
          { type: "text", text: "Identify this inventory item and return the JSON." },
        ],
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as IdentifyResult;

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("inventory-identify error:", err);
    return NextResponse.json({ error: "Identification failed" }, { status: 500 });
  }
}
