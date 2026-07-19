import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { getOrgName } from "@/lib/org-server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as { fileName: string; textContent?: string; fileBase64?: string; mediaType?: string };
  const { fileName, textContent, fileBase64, mediaType } = body;

  if (!fileName) return NextResponse.json({ error: "fileName required" }, { status: 400 });

  const orgName = await getOrgName(supabase);
  const prompt = `You are a compliance document classifier and router for a behavioral health practice (${orgName}). Your job is to read a document and decide WHICH part of the compliance system it belongs in.

Analyze this document and return a JSON object with these fields:
- suggestedType: one of "policy", "sop", "form", "reference", "training_material", "credential", "license", "sds", "incident_report", "insurance_policy", "regulation", "hr_record"
- suggestedTitle: clean, properly formatted document title
- complianceArea: one of "hipaa", "osha", "dea", "hr", "clinical", "emergency", "general", or null
- suggestedDestination: WHERE this document should be filed. Choose exactly one:
  - "sop_library" — policies, standard operating procedures, procedures, manuals, acknowledgment forms
  - "credentialing" — professional licenses, certifications, DEA registrations, board certifications, CPR/BLS/ACLS cards, malpractice certificates (anything tied to an individual's qualification to practice)
  - "employee_vault" — HR & personnel documents tied to an INDIVIDUAL employee: offer letters, employment contracts, I-9, W-4, performance reviews, disciplinary actions, termination letters, benefit enrollment
  - "business_records" — documents the PRACTICE ENTITY owns (not an individual person): business/operating licenses & permits, general contracts & service agreements, real-estate leases/rental agreements, Business Associate Agreements (BAAs), group/network payer contracts, audits/accreditation/survey records, vendor agreements, formation/governance docs (articles of organization, operating agreement, bylaws), and company tax/identity records (W-9, IRS EIN / CP-575 letter)
  - "forms" — blank or fillable form TEMPLATES and questionnaires meant to be completed: intake forms, consent/acknowledgment form templates, HR onboarding forms, and blank application/credentialing/enrollment forms. Choose this for an EMPTY template to be filled out — NOT a completed/signed instance (a signed credential or agreement goes to its own destination).
  - "sds_library" — Safety Data Sheets (SDS/MSDS) for chemicals or hazardous products
  - "osha" — OSHA injury/illness logs (300/300A/301), incident reports, exposure reports, safety inspections
  - "insurance" — insurance policies, certificates of insurance, malpractice/general liability/cyber coverage documents
  - "regulatory_sources" — government regulations, CFR citations, official agency guidance, statutes (the rules themselves, not the practice's own policies)
  - "training" — training curricula, course materials, training decks
- destinationReason: one short sentence explaining why this destination, citing a signal from the document (e.g. "Contains a DEA registration number and expiration date").
- summary: 1-2 sentence summary of what this document covers
- confidence: "high", "medium", or "low" based on how certain you are
- notes: brief explanation of your classification reasoning

Distinguish carefully: a DEA *registration certificate* → credentialing; a DEA *dispensing/inventory log* → osha is wrong, use "sop_library" only if it's a procedure, otherwise credentialing for the registration. A *policy about* HIPAA → sop_library; the *HIPAA regulation text itself* → regulatory_sources.

File name: ${fileName}
${fileBase64
    ? "\nThe ACTUAL DOCUMENT is attached above. READ ITS CONTENTS — the identifiers, headings, and body text — to classify it. Do NOT rely on the file name alone; the file name is often generic or wrong."
    : textContent
      ? `\nDocument content:\n${textContent.slice(0, 8000)}`
      : "(No readable content could be extracted — classify from the file name only, and set confidence no higher than \"medium\".)"}

Respond ONLY with valid JSON, no markdown or explanation.`;

  // When we have the real file bytes, hand Claude the document/image directly so
  // it classifies from actual contents (PDFs and images read natively, incl. scans).
  const content: Anthropic.ContentBlockParam[] = [];
  if (fileBase64 && mediaType === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } });
  } else if (fileBase64 && mediaType && mediaType.startsWith("image/")) {
    content.push({ type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: fileBase64 } });
  }
  content.push({ type: "text", text: prompt });

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content }],
    });
  } catch {
    return NextResponse.json({
      suggestedType: "reference",
      suggestedTitle: fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
      complianceArea: null,
      suggestedDestination: "sop_library",
      destinationReason: "Defaulted — the classifier service was unavailable.",
      summary: "Classification unavailable.",
      confidence: "low" as const,
      notes: "AI classifier temporarily unavailable — please review manually.",
    });
  }

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const result = JSON.parse(match ? match[0] : raw) as {
      suggestedType: string;
      suggestedTitle: string;
      complianceArea: string | null;
      suggestedDestination: string;
      destinationReason: string;
      summary: string;
      confidence: "high" | "medium" | "low";
      notes: string;
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      suggestedType: "reference",
      suggestedTitle: fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
      complianceArea: null,
      suggestedDestination: "sop_library",
      destinationReason: "Defaulted — classification could not be parsed.",
      summary: "Could not parse document.",
      confidence: "low" as const,
      notes: "AI classification failed — please review manually.",
    });
  }
}
