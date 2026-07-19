import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { getOrgName } from "@/lib/org-server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You analyze a BUSINESS / ENTITY document for a behavioral-health practice and return structured metadata a compliance officer will review. These are documents that belong to the practice AS A LEGAL ENTITY — not to an individual clinician.

You are given the record's existing fields and — when available — the ACTUAL DOCUMENT (PDF/image). When the document is attached, READ IT and prefer what it says over the existing fields.

Return ONLY valid JSON:
{"category":"license"|"contract"|"insurance"|"baa"|"lease"|"payer_contract"|"audit"|"vendor"|"formation"|"tax"|"other","title":string,"counterparty":string|null,"identifier":string|null,"issuingAuthority":string|null,"status":"active"|"pending"|"expired"|"terminated"|null,"effectiveDate":string|null,"expirationDate":string|null,"amount":number|null,"summary":string}

Rules:
- "category": what kind of business record this is, read from the document:
    license = a business/operating license or permit issued to the practice (city business license, facility license, controlled-substance facility registration, pharmacy permit).
    contract = a general business contract or service agreement (not a payer, vendor, or lease).
    insurance = an entity-level insurance policy or certificate (general liability, property, cyber, workers' comp, umbrella) held by the business itself.
    baa = a HIPAA Business Associate Agreement.
    lease = a real-estate lease or rental agreement for a location.
    payer_contract = a group/network contract with a health plan or payer (the practice-level agreement, not an individual provider's paneling).
    audit = an audit, accreditation, survey, or attestation record (payer audit, OIG, accreditation body, directory verification).
    vendor = a vendor or supplier service agreement (software, billing service, lab, answering service).
    formation = a business-formation or governance document (articles of organization/incorporation, operating agreement, bylaws, ownership).
    tax = a tax or financial-identity document (W-9, IRS EIN / CP-575 letter, tax filings, 1099 setup).
    other = anything that doesn't fit above.
  Base this on the document CONTENTS, not the filename.
- "title": a clean, specific name (e.g. "Murray Clinic Office Lease", "General Liability Policy", "BAA — Cloud EHR Vendor").
- "counterparty": the OTHER party — landlord, vendor, payer, carrier, issuing agency, auditor — or null.
- "identifier": the contract / license / policy / audit number, or null.
- "issuingAuthority": for licenses/permits, the authority that issued it (city, state agency, accreditor); null otherwise.
- "status": "active" if in force, "pending" if signed by one side / awaiting execution, "expired" if past its end date, "terminated" if cancelled; null if you can't tell.
- "effectiveDate" / "expirationDate": YYYY-MM-DD, or null if not shown. NEVER invent a date — use null when it isn't clearly present. For a lease use the term start/end; for insurance the policy period; for a license the issue/expiration.
- "amount": the contract value, annual rent, or coverage amount as a plain NUMBER OF DOLLARS (no symbols/commas), or null. For insurance use the each-occurrence/aggregate limit if that's what's shown.
- "summary": one short sentence describing what the document is.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const orgName = await getOrgName(supabase);
  const body = await request.json() as {
    title?: string; category?: string; counterparty?: string; identifier?: string;
    fileBase64?: string; mediaType?: string;
  };

  const known = `Practice (entity): ${orgName}\nExisting fields:\n- Title: ${body.title ?? ""}\n- Category: ${body.category ?? ""}\n- Counterparty: ${body.counterparty ?? ""}\n- Identifier: ${body.identifier ?? ""}`;
  const prompt = `${known}\n\n${body.fileBase64 ? "The actual business document is attached above — read it and extract the metadata." : "No document is attached — infer the metadata from the existing fields above."}\n\nReturn the JSON.`;

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
      max_tokens: 500,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    console.error("business-record-analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
