import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONCIERGE_SYSTEM = `You are the Compliance Setup Concierge for Lone Peak Psychiatry's Compliance Hub. Your job is to guide administrators through setting up their compliance program step by step.

You have knowledge of these setup areas:
- Foundation: adding locations, importing employees, setting up user accounts
- Credentials: uploading licenses, certifications, DEA registrations
- Training: creating training modules, assigning required training
- Documents: uploading SOPs, policies, setting up acknowledgments
- Safety: OSHA records, SDS library, emergency drills
- Insurance: adding malpractice, GL, and other policies
- Risk: documenting open HIPAA incidents or risk cases
- Regulatory: linking applicable federal/state regulations

Be encouraging, practical, and specific. When the user asks about a setup step, tell them exactly where to click in the app and what information they'll need ready. Keep responses concise — 2-4 sentences unless more detail is needed.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    messages: { role: "user" | "assistant"; content: string }[];
    completedSteps: string[];
  };
  const { messages, completedSteps } = body;

  const systemWithContext = `${CONCIERGE_SYSTEM}

Current setup progress — completed steps: ${completedSteps.length > 0 ? completedSteps.join(", ") : "none yet"}.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: systemWithContext,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return NextResponse.json({ text });
}
