import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Read a controlled-substance delivery from its paperwork: the packing slip and
 * the photos of the boxes, in one pass, so a whole shipment can be logged at once.
 *
 * Deliberately uses Sonnet, not the Haiku the rest of the app defaults to. On a
 * real packing slip Haiku misread the customer DEA number, the order number and
 * a handwritten lot — and a wrong lot or serial number in a custody record is
 * worse than no record. Deliveries are rare, so the cost difference is small.
 */
const SYSTEM = `You read PHOTOS taken when a medical practice receives a controlled-substance shipment, so every container can be logged into a custody system. You may be given a packing slip / invoice / DEA 222 order, photos of the BOXES with their printed labels, or both — sometimes in one photo.

Staff ANNOTATE these by hand. The handwriting carries what the print does not: the lot number, the date actually received, how many vials are in a box, and the letter each box is assigned ("1 = A", "4 = D as in dog"). Read handwriting and print with equal care.

Printed box labels (DSCSA 2D barcodes) show GTIN, SN (serial number), LOT and EXP. EXP as "2028/05" means May 2028 — return it as 2028-05-31 (last day of the stated month) and set expirationIsMonth true.

Return ONLY valid JSON:
{"documentKind":"packing_slip"|"box_labels"|"both"|"other",
 "supplierName":string|null,"supplierDea":string|null,"shipToName":string|null,"shipToAddress":string|null,"customerDea":string|null,"poNumber":string|null,"orderNumber":string|null,"packingSlipNumber":string|null,"orderDate":string|null,"receivedDate":string|null,
 "lines":[{"sku":string|null,"description":string|null,"packDescription":string|null,"ndc":string|null,"scheduleClass":"II"|"IIN"|"III"|"IV"|"V"|null,"boxCount":number|null,"unitsPerBox":number|null,"unitVolume":number|null,"unitVolumeUom":string|null,"strengthPerUnit":string|null,"lotNumber":string|null,"lotNote":string|null,"expirationDate":string|null}],
 "boxes":[{"boxNumber":number|null,"assignedLetter":string|null,"gtin":string|null,"serialNumber":string|null,"lotNumber":string|null,"expirationDate":string|null,"expirationIsMonth":boolean,"unitsInBox":number|null}],
 "handwrittenNotes":string|null,"confidence":"high"|"medium"|"low","summary":string}

Rules:
- Dates YYYY-MM-DD. "9/22/26" is 2026-09-22. NEVER invent a date.
- "boxCount": physical boxes on that line (a "Boxes" column, or handwriting like "boxes 1-4"). "unitsPerBox": vials inside EACH box — usually handwritten ("each box = 10 vials") or derivable from a pack like "10X5ML MDV" (10 vials of 5 mL). If they disagree, prefer the handwriting and say so in "lotNote".
- "boxes": one entry per physical box you can actually see a label for. "assignedLetter" is the handwritten letter for that box (A, B, C, D) — a note like "4 = D as in dog" means that box's identity is the LETTER D — the number is only how it was marked at first, so return boxNumber 4 AND assignedLetter "D". Copy GTIN, SN, LOT, EXP exactly as printed, digit for digit. If two boxes appear to share a serial number, you misread one — return null for the one you are unsure of rather than repeating it.
- Serial numbers and lot numbers are the whole point of this record. Transcribe them character by character. If a digit is blurred or cut off, return null for that field. A blank is safe; a wrong serial number is not.
- "expirationDate": from the box label if present ("EXP: 2028/05" → 2028-05-31, expirationIsMonth true). Packing slips rarely show it — null then.
- "scheduleClass": ketamine = III; null unless clear.
- Never fabricate. Null beats a guess. Set "confidence" for the read overall.
- "summary": one sentence a person would recognize.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as { files?: { base64: string; mediaType: string }[] };
  const files = (body.files ?? []).slice(0, 6);
  if (files.length === 0) return NextResponse.json({ error: "Attach the packing slip and/or photos of the boxes." }, { status: 400 });

  const content: Anthropic.ContentBlockParam[] = [];
  for (const f of files) {
    if (f.mediaType === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } });
    } else if (f.mediaType.startsWith("image/")) {
      content.push({ type: "image", source: { type: "base64", media_type: f.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: f.base64 } });
    } else {
      return NextResponse.json({ error: "Upload photos (JPG/PNG/HEIC converted) or a PDF." }, { status: 400 });
    }
  }
  content.push({ type: "text", text: "Read this controlled-substance delivery — the printed paperwork AND any handwriting or box labels — and return the JSON." });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    console.error("cs-manifest error:", err);
    return NextResponse.json({ error: "Couldn't read the delivery. Enter it by hand." }, { status: 500 });
  }
}
