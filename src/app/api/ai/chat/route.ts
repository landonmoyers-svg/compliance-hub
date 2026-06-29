import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a healthcare compliance expert assistant for Lone Peak Psychiatry, a behavioral health practice. You help staff understand and apply:

- HIPAA Privacy and Security Rules (45 CFR Parts 160 and 164)
- OSHA standards for healthcare settings (bloodborne pathogens, hazard communication, emergency action plans)
- DEA regulations for Schedule II-V controlled substances
- State behavioral health licensure and CMHC certification requirements
- Employment law basics (FMLA, ADA, EEO)
- CMS Conditions of Participation
- Joint Commission / NCQA standards as they apply to outpatient behavioral health

Guidelines:
- Give practical, actionable answers grounded in the actual regulatory text
- When a regulation number or CFR citation is relevant, include it
- Flag when something requires a licensed attorney or compliance officer to decide
- Be concise — staff are busy clinicians, not lawyers
- If asked about a specific patient situation, remind the user you cannot give legal or clinical advice about specific cases
- Never make up a regulation — if you are unsure, say so clearly`;

export async function POST(request: NextRequest) {
  // Verify authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as { messages: { role: "user" | "assistant"; content: string }[] };
  const { messages } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return NextResponse.json({ text });
}
