import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic();

type IdentifyResult = {
  name: string;
  strength: string | null;
  form: string;
  manufacturer: string | null;
  ndc: string | null;
  unit: string;
  lotNumber: string | null;
  expirationDate: string | null;
  suggestedRoom: string | null;
  suggestedLocationName: string | null;
  confidence: "high" | "medium" | "low";
};

/**
 * Image classification for MEDICATION SAMPLES — the drug-rep sample cartons in
 * the sample closet. Distinct from the consumables identifier: what matters on a
 * sample carton is the drug name, strength, manufacturer, NDC and expiry, not a
 * supply category.
 *
 * The prompt is deliberately strict about not inventing an NDC, lot or expiry —
 * these end up in a controlled-substance-adjacent record, and a plausible-looking
 * invented number is worse than a blank field.
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
    ? `The practice has these sites — if the setting visually resembles one, put its EXACT name in suggestedLocationName, otherwise null:\n${locationNames.map((n) => `- ${n}`).join("\n")}`
    : `No known locations were provided; set suggestedLocationName to null.`;

  const systemPrompt = `You catalog medication SAMPLES for a psychiatry practice — the manufacturer sample cartons, blister packs, pens and inhalers a drug representative leaves behind. You are shown a photo of a sample package or its label.

Return ONLY valid JSON with these exact fields:
{
  "name": "the drug name as printed — brand name first, generic in parentheses if both are shown (e.g. 'Trintellix (vortioxetine)')",
  "strength": "strength exactly as printed, e.g. '10 mg' or '100 mcg/actuation', else null",
  "form": "one of: box, carton, blister_pack, bottle, pen, vial, inhaler, tube, sample_card, other",
  "manufacturer": "the manufacturer/labeller printed on the pack, else null",
  "ndc": "the NDC exactly as printed if clearly legible, else null",
  "unit": "the sensible stocking unit for counting these: box, carton, pack, pen, vial, each",
  "lotNumber": "the lot/LOT number if clearly legible, else null",
  "expirationDate": "expiration/EXP date as YYYY-MM-DD if clearly legible (use the 1st if only month/year given), else null",
  "suggestedRoom": "short guess at storage from visual context (e.g. 'sample closet', 'med room cabinet'), else null",
  "suggestedLocationName": string or null,
  "confidence": "high" | "medium" | "low"
}

${locationHint}

Report an NDC, lot number or expiration date ONLY if you can actually read it in the image — never infer or complete one from knowledge of the product. A blank field is correct; an invented identifier is not. Choose form from the exact list. If you cannot tell what the drug is, set confidence "low" and give your best reading of the label. Return only the JSON object, no other text.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: imageBase64 } },
          { type: "text", text: "Identify this medication sample and return the JSON." },
        ],
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as IdentifyResult;
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("medsample-identify error:", err);
    return NextResponse.json({ error: "Identification failed" }, { status: 500 });
  }
}
