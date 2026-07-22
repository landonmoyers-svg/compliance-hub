import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You analyze an EMPLOYEE / HR personnel document for a behavioral-health practice and return structured metadata a compliance officer will review before saving.

You are given the document's existing fields, a PEOPLE roster of employees (each with an id + name), and — when available — the ACTUAL DOCUMENT (PDF/image). When the document is attached, READ IT and prefer what it says over the existing fields.

Return ONLY valid JSON:
{"documentType":"offer_letter"|"employment_contract"|"i9"|"w4"|"performance_review"|"disciplinary"|"termination"|"benefit_enrollment"|"training_certificate"|"medical"|"background_check"|"other","title":string,"sensitive":boolean,"holderName":string|null,"matchedEmployeeId":string|null,"summary":string}

Rules:
- "documentType": read the document and choose the best fit:
    offer_letter = a job offer letter. employment_contract = an employment agreement/contract.
    i9 = Form I-9 employment eligibility. w4 = Form W-4 / state withholding.
    performance_review = a performance evaluation/review. disciplinary = a write-up, corrective action, PIP, warning.
    termination = a termination/separation letter or resignation. benefit_enrollment = benefits/insurance/401k enrollment forms.
    training_certificate = a completion certificate for a training/course.
    medical = ANY health information about the employee (fitness-for-duty, ADA accommodation, immunization/vaccination record, medical note). background_check = BCI/FBI/OIG-SAM/fingerprint/drug-screen results.
    other = anything else (emergency contact form, direct-deposit form, handbook acknowledgment, etc.).
- "title": a clean, specific, human title (e.g. "2026 Offer Letter", "Form I-9", "Annual Performance Review 2025"). Do not invent a year that isn't shown.
- "sensitive": true when the document is legally access-restricted or private — ALWAYS true for medical, background_check, i9, w4, benefit_enrollment, disciplinary, termination, and offer_letter. false for training certificates and general forms.
- "holderName": the employee this document is about, read from the document (or title), or null.
- "matchedEmployeeId": if the holder clearly matches exactly one person in the PEOPLE roster, return THAT person's exact id. Ignore middle names, maiden/hyphenated last names, and credential suffixes when matching on core first + last name. Return null when there is no single clear match — never guess between two people.
- "summary": one short sentence describing the document.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as {
    title?: string; documentType?: string; employeeName?: string;
    fileBase64?: string; mediaType?: string;
    people?: { id: string; name: string }[];
  };

  const known = `Existing fields:\n- Title: ${body.title ?? ""}\n- Type: ${body.documentType ?? ""}\n- Currently filed under: ${body.employeeName ?? "(unassigned)"}`;
  const roster = `PEOPLE roster (match the employee to one of these; return the id):\n${JSON.stringify((body.people ?? []).slice(0, 200))}`;
  const prompt = `${known}\n\n${roster}\n\n${body.fileBase64 ? "The actual document is attached above — read it and extract the metadata, including whom it belongs to." : "No document is attached — infer the metadata from the existing fields above."}\n\nReturn the JSON.`;

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
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    const raw = response.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("");
    const match = raw.match(/\{[\s\S]*\}/);
    const result = JSON.parse(match ? match[0] : raw);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Analysis failed. Please fill the fields manually." }, { status: 502 });
  }
}
