import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { fileName: string; textContent?: string };
  const { fileName, textContent } = body;

  if (!fileName) return NextResponse.json({ error: "fileName required" }, { status: 400 });

  const prompt = `You are a compliance document classifier for a behavioral health practice.

Analyze this document and return a JSON object with these fields:
- suggestedType: one of "policy", "sop", "form", "reference", "training_material"
- suggestedTitle: clean, properly formatted document title
- complianceArea: one of "hipaa", "osha", "dea", "hr", "clinical", "emergency", "general", or null
- summary: 1-2 sentence summary of what this document covers
- confidence: "high", "medium", or "low" based on how certain you are
- notes: brief explanation of your classification reasoning

File name: ${fileName}
${textContent ? `\nDocument content (first 2000 chars):\n${textContent.slice(0, 2000)}` : "(No text content — classifying from filename only)"}

Respond ONLY with valid JSON, no markdown or explanation.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  try {
    const result = JSON.parse(raw) as {
      suggestedType: string;
      suggestedTitle: string;
      complianceArea: string | null;
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
      summary: "Could not parse document.",
      confidence: "low" as const,
      notes: "AI classification failed — please review manually.",
    });
  }
}
