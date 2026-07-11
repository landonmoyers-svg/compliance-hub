import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You analyze a professional CREDENTIAL for a behavioral-health practice — a license, certification, clearance, DEA registration, CPR/BLS/ACLS card, board certification, or an insurance/malpractice certificate — and return structured metadata a compliance officer will review.

You are given the credential's existing fields and, when available, the ACTUAL DOCUMENT (PDF/image). When the document is attached, READ IT and prefer what it says over the existing fields.

Return ONLY valid JSON:
{"credentialType":"license"|"certification"|"clearance"|"insurance"|"training"|"other","credentialName":string,"issuingBody":string|null,"credentialNumber":string|null,"issueDate":string|null,"expirationDate":string|null,"summary":string}

Rules:
- "credentialType": license = a professional license to practice (MD/DO/APRN/PA/RN/LCSW/DEA registration); certification = board certs, CPR/BLS/ACLS, specialty certs; clearance = background checks / OIG-SAM / fingerprint clearances; insurance = malpractice / liability / COI; training = course completion certificates; other = anything else.
- "credentialName": a clean, specific name (e.g. "Utah Physician & Surgeon License", "DEA Registration", "BLS Provider Card").
- "issuingBody": the issuing authority (state board, ANCC, AHA, DEA, insurer…), or null.
- "credentialNumber": the license/registration/certificate number, or null.
- "issueDate" / "expirationDate": YYYY-MM-DD, or null if not shown. NEVER invent a date or number — use null when it isn't clearly present.
- "summary": one short sentence describing what the document is.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as {
    credentialName?: string; credentialType?: string; issuingBody?: string; credentialNumber?: string;
    employeeName?: string; fileBase64?: string; mediaType?: string;
  };

  const known = `Existing fields:\n- Name: ${body.credentialName ?? ""}\n- Type: ${body.credentialType ?? ""}\n- Issuing body: ${body.issuingBody ?? ""}\n- Number: ${body.credentialNumber ?? ""}\n- Held by: ${body.employeeName ?? ""}`;
  const prompt = `${known}\n\n${body.fileBase64 ? "The actual credential document is attached above — read it and extract the metadata." : "No document is attached — infer the metadata from the existing fields above."}\n\nReturn the JSON.`;

  const content: Anthropic.ContentBlockParam[] = [];
  if (body.fileBase64 && body.mediaType === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: body.fileBase64 } });
  } else if (body.fileBase64 && body.mediaType && body.mediaType.startsWith("image/")) {
    content.push({ type: "image", source: { type: "base64", media_type: body.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: body.fileBase64 } });
  }
  content.push({ type: "text", text: prompt });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    console.error("credential-analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
