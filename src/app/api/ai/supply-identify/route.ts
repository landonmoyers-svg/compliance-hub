import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic();

type IdentifyResult = {
  name: string;
  itemType: string;
  itemNumber: string | null;
  suggestedRoom: string | null;
  suggestedLocationName: string | null;
  confidence: "high" | "medium" | "low";
};

/**
 * Image classification for the STAFF SUPPLY inventory — movable, lower-value
 * office items (keyboards, mice, cables, adapters, monitors…). Identifies the
 * item, its type, and any visible asset/serial label so staff can catalog it
 * from a photo. Value estimation is intentionally omitted (these are low-value).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as { imageBase64?: string; mimeType?: string; locationNames?: string[] };
  const { imageBase64, mimeType, locationNames = [] } = body;
  if (!imageBase64 || !mimeType) {
    return NextResponse.json({ error: "An image is required" }, { status: 400 });
  }

  const locationHint = locationNames.length
    ? `The practice has these known locations — if the setting visually resembles one, put its EXACT name in suggestedLocationName, otherwise null:\n${locationNames.map((n) => `- ${n}`).join("\n")}`
    : `No known locations were provided; set suggestedLocationName to null.`;

  const systemPrompt = `You catalog movable office supplies and low-value IT equipment for a clinic (keyboards, mice, HDMI/USB cables, adapters, docking stations, monitors, headsets, webcams, desk phones, small furniture). You are shown a photo of one such item.

Return ONLY valid JSON with these exact fields:
{
  "name": "concise item name incl. brand/model if visible (e.g. 'Logitech K120 USB Keyboard')",
  "itemType": "one of: keyboard, mouse, monitor, cable, adapter, dock, headset, webcam, phone, laptop, tablet, printer, furniture, other",
  "itemNumber": "any asset tag / serial / model number visibly printed on the item, else null",
  "suggestedRoom": "short guess at where it sits from visual context (e.g. 'reception desk', 'IT closet', 'exam room'), else null",
  "suggestedLocationName": string or null,
  "confidence": "high" | "medium" | "low"
}

${locationHint}

Only report an itemNumber you can actually read in the image — never invent one. If unsure of the item, set confidence "low" and give your best guess. Return only the JSON object, no other text.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: imageBase64 } },
          { type: "text", text: "Identify this office supply item and return the JSON." },
        ],
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as IdentifyResult;
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("supply-identify error:", err);
    return NextResponse.json({ error: "Identification failed" }, { status: 500 });
  }
}
