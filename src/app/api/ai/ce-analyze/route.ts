import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You (Sage) read a SCANNED continuing-education document for a behavioral-health practice — a certificate of completion, CME/CE certificate, transcript, or attendance letter — and extract structured fields a compliance officer will review before saving.

You are given the ACTUAL DOCUMENT (PDF/image). READ it and extract only what is clearly present.

Return ONLY valid JSON:
{"title":string|null,"provider":string|null,"hours":number|null,"category":"general"|"pharmacology"|"ethics"|"controlled_substance"|"infection_control"|"other"|null,"completedDate":string|null,"appliesTo":string|null,"confidence":"high"|"medium"|"low","summary":string}

Rules:
- "title": the activity/course/session name as written, or null.
- "provider": the accredited provider, sponsor, or accrediting body that issued the credit (e.g. "APA", "AANP", "Utah Medical Association"), or null.
- "hours": the number of CE/CME contact hours / credits earned — a number only (e.g. 1.5) — or null. If it lists both "credits" and "contact hours" and they differ, prefer contact hours.
- "category": choose the best fit — "pharmacology" for pharmacology / psychopharmacology / prescribing content; "controlled_substance" for DEA / MATE / opioid / controlled-substance-prescribing training; "ethics" for ethics/boundaries/law-&-ethics; "infection_control" for infection control / bloodborne pathogens; "general" for ordinary clinical CE; "other" if none fit. null only if genuinely unclear.
- "completedDate": the completion/issue date as YYYY-MM-DD, or null. NEVER invent a date.
- "appliesTo": the license or requirement it counts toward if stated (e.g. "APRN", "DEA MATE", "RN", "LCSW"), or null.
- "confidence": your overall confidence in the extraction.
- "summary": one short sentence describing the certificate.
- Use null for anything not clearly present. Do not fabricate. This is decision-support; the user verifies before saving.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as { fileBase64?: string; mediaType?: string };
  if (!body.fileBase64 || !body.mediaType) {
    return NextResponse.json({ error: "Attach a certificate to process." }, { status: 400 });
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (body.mediaType === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: body.fileBase64 } });
  } else if (body.mediaType.startsWith("image/")) {
    content.push({ type: "image", source: { type: "base64", media_type: body.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: body.fileBase64 } });
  } else {
    return NextResponse.json({ error: "Unsupported file type — upload a PDF or image." }, { status: 400 });
  }
  content.push({ type: "text", text: "Read the attached continuing-education certificate and extract the fields as JSON." });

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
    console.error("ce-analyze error:", err);
    return NextResponse.json({ error: "Couldn't read the certificate. Enter the fields manually." }, { status: 500 });
  }
}
