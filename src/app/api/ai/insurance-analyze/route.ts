import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You analyze an INSURANCE POLICY document for a behavioral-health practice — professional liability / malpractice, general liability, cyber, workers' comp, an individual malpractice rider, etc. — and return structured metadata the holder will review.

You are given the policy's existing fields and, when available, the ACTUAL DOCUMENT (PDF/image). When the document is attached, READ IT and prefer what it says over the existing fields.

Return ONLY valid JSON:
{"policyType":"malpractice"|"general_liability"|"cyber"|"workers_comp"|"property"|"other","policyName":string,"carrierName":string|null,"policyNumber":string|null,"coverageAmount":number|null,"annualPremium":number|null,"renewalDate":string|null,"summary":string}

Rules:
- "policyType": malpractice = professional liability / medical malpractice; general_liability = business general liability; cyber = cyber/data-breach; workers_comp = workers' compensation; property = property/casualty; other = anything else.
- "policyName": a clean, specific name (e.g. "Professional Liability — Claims Made", "Cyber Liability").
- "carrierName": the insurer/carrier, or null.
- "policyNumber": the policy number, or null.
- "coverageAmount" / "annualPremium": whole US DOLLARS as a number (not cents, no "$" or commas), or null if not clearly shown. NEVER invent a figure.
- "renewalDate": the renewal/expiration date as YYYY-MM-DD, or null if not shown. NEVER invent a date.
- "summary": one short sentence describing the policy.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as {
    policyName?: string; policyType?: string; carrierName?: string; policyNumber?: string;
    fileBase64?: string; mediaType?: string;
  };

  const known = `Existing fields:\n- Name: ${body.policyName ?? ""}\n- Type: ${body.policyType ?? ""}\n- Carrier: ${body.carrierName ?? ""}\n- Number: ${body.policyNumber ?? ""}`;
  const prompt = `${known}\n\n${body.fileBase64 ? "The actual policy document is attached above — read it and extract the metadata." : "No document is attached — infer the metadata from the existing fields above."}\n\nReturn the JSON.`;

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
    console.error("insurance-analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
