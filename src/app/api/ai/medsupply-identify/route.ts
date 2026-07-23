import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic();

type IdentifyResult = {
  name: string;
  category: string;
  unit: string;
  lotNumber: string | null;
  expirationDate: string | null;
  suggestedRoom: string | null;
  suggestedLocationName: string | null;
  confidence: "high" | "medium" | "low";
};

/**
 * Image classification for the MEDICAL CONSUMABLES tracker — disposable clinical
 * supplies (gloves, syringes, gauze, alcohol pads, tubing…). Identifies the
 * product, a sensible stocking unit, and reads a lot number / expiration date
 * off the packaging when visible so staff can log a received lot from a photo.
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

  const systemPrompt = `You catalog consumable medical supplies for a behavioral-health clinic (exam gloves, syringes/needles, gauze, alcohol prep pads, bandages, tubing, specimen containers, sanitizing wipes, paper goods). You are shown a photo of a product or its packaging/box.

Return ONLY valid JSON with these exact fields:
{
  "name": "concise product name incl. brand, size/gauge if visible (e.g. 'Nitrile Exam Gloves, Medium')",
  "category": "one of: ppe, wound_care, injection, diagnostic, phlebotomy, cleaning, paper_goods, medication_adjacent, other",
  "unit": "the most sensible stocking unit you see: box, case, each, pair, roll, pack, bag",
  "lotNumber": "the lot/LOT number printed on the packaging if clearly legible, else null",
  "expirationDate": "expiration/EXP date as YYYY-MM-DD if clearly legible (use the 1st if only month/year), else null",
  "suggestedRoom": "short guess at storage from visual context (e.g. 'supply closet', 'exam room cabinet'), else null",
  "suggestedLocationName": string or null,
  "confidence": "high" | "medium" | "low"
}

${locationHint}

Only report a lotNumber or expirationDate you can actually read — never invent them. Choose the category from the exact list. If unsure of the product, set confidence "low" and give your best guess. Return only the JSON object, no other text.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: imageBase64 } },
          { type: "text", text: "Identify this medical consumable and return the JSON." },
        ],
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as IdentifyResult;
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("medsupply-identify error:", err);
    return NextResponse.json({ error: "Identification failed" }, { status: 500 });
  }
}
