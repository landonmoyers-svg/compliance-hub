import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You transcribe a document to plain text so it can be searched and quoted by a policy assistant. Return the document's FULL readable text, verbatim, preserving headings, lists, and paragraph breaks. Do NOT summarize, comment, or add anything that isn't in the document. Output only the transcribed text.`;

/** Read a PDF or image document and return its plain text (for grounding the
 *  SOP/Policy assistant). Client-extractable formats (txt, docx) are handled in
 *  the browser; this endpoint covers scanned/binary PDFs and images. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as { fileBase64?: string; mediaType?: string };
  if (!body.fileBase64 || !body.mediaType) return NextResponse.json({ error: "fileBase64 and mediaType required" }, { status: 400 });

  const content: Anthropic.ContentBlockParam[] = [];
  if (body.mediaType === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: body.fileBase64 } });
  } else if (body.mediaType.startsWith("image/")) {
    content.push({ type: "image", source: { type: "base64", media_type: body.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: body.fileBase64 } });
  } else {
    return NextResponse.json({ error: "Unsupported media type" }, { status: 400 });
  }
  content.push({ type: "text", text: "Transcribe this document to plain text, verbatim." });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("").trim();
    return NextResponse.json({ text });
  } catch (err) {
    console.error("extract-text error:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
