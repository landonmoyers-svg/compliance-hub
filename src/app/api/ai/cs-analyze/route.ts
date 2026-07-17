import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You read a SCANNED controlled-substance document for a behavioral-health practice — a receiving record, packing slip, invoice, DEA Form 222 / CSOS order, or a paper administration/waste/transfer log — and extract structured fields a compliance officer will review before saving.

You are given the ACTUAL DOCUMENT (PDF/image) and a MODE ("receive" for a delivery/receiving record, or "event" for a paper administration/waste/transfer/count log). READ the document and extract only what is clearly present.

Return ONLY valid JSON:
{"substanceName":string|null,"scheduleClass":"II"|"IIN"|"III"|"IV"|"V"|null,"strength":string|null,"ndc":string|null,"lotNumber":string|null,"expirationDate":string|null,"quantity":number|null,"quantityUnit":string|null,"supplierName":string|null,"orderReference":string|null,"receivedDate":string|null,"eventType":"administer"|"waste"|"destroy"|"transfer_to_safe"|"assign_to_staff"|"return_to_safe"|"count"|"adjust"|null,"eventDate":string|null,"witnessName":string|null,"toCustodianName":string|null,"patientRef":string|null,"summary":string}

Rules:
- "substanceName": the drug/product name (e.g. "Ketamine HCl"), or null.
- "scheduleClass": the DEA schedule if stated or clearly inferable (ketamine = III; most stimulants = II/IIN); else null. Never guess wildly.
- "strength": concentration/strength as written (e.g. "50 mg/mL"), or null.
- "ndc"/"lotNumber": the NDC/product code and lot/batch number, or null.
- "expirationDate"/"receivedDate"/"eventDate": YYYY-MM-DD, or null if not shown. NEVER invent a date.
- "quantity": the numeric quantity (received for a receive doc; administered/wasted/adjusted for an event doc) — a number only — or null. "quantityUnit": the unit (mL, mg, vials, tablets), or null.
- "supplierName": distributor/pharmacy/manufacturer, or null. "orderReference": a DEA 222 number, CSOS order id, or PO/invoice number, or null.
- MODE=event only: "eventType" the kind of transaction if clear (administer/waste/destroy/transfer_to_safe/assign_to_staff/return_to_safe/count/adjust), else null. "witnessName": the second-person witness who signed, or null. "toCustodianName": the staff member the substance was assigned/transferred to, or null. "patientRef": any de-identified patient reference (initials, MRN last 4) — NEVER extract full patient names or full PHI; if only a full name is present, return null.
- "summary": one short sentence describing the document.
- Use null for anything not clearly present. Do not fabricate. This is decision-support; the user verifies before saving.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as { fileBase64?: string; mediaType?: string; mode?: "receive" | "event" };
  if (!body.fileBase64 || !body.mediaType) {
    return NextResponse.json({ error: "Attach a scanned document to extract from." }, { status: 400 });
  }
  const mode = body.mode === "event" ? "event" : "receive";

  const content: Anthropic.ContentBlockParam[] = [];
  if (body.mediaType === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: body.fileBase64 } });
  } else if (body.mediaType.startsWith("image/")) {
    content.push({ type: "image", source: { type: "base64", media_type: body.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: body.fileBase64 } });
  } else {
    return NextResponse.json({ error: "Unsupported file type — upload a PDF or image." }, { status: 400 });
  }
  content.push({ type: "text", text: `MODE: ${mode}. Read the attached controlled-substance document and extract the fields as JSON.` });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    console.error("cs-analyze error:", err);
    return NextResponse.json({ error: "Extraction failed. Enter the fields manually." }, { status: 500 });
  }
}
