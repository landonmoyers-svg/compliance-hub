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

Be encouraging, practical, and specific. Keep the "message" concise — 2-4 sentences unless more detail is needed.

You can PROPOSE records for the admin to create with one click. When the user asks you to set something up or it would clearly help, include "actions" — but you only PROPOSE; the admin must click to confirm. Never claim a record was created. Supported action types and their data shapes:
- "create_location": { "name": string, "type"?: "clinic"|"office"|"remote"|"other", "city"?: string, "state"?: string }
- "create_training_module": { "title": string, "description"?: string, "trainingType"?: string, "passingScore"?: number }
- "create_regulatory_source": { "title": string, "citationLabel"?: string, "issuingBody"?: string, "sourceType"?: "regulation"|"guidance"|"internal"|"statute" }
- "create_document": { "title": string, "documentType"?: string, "complianceArea"?: string, "summary"?: string }
- "create_task": { "title": string, "description"?: string, "priority"?: "low"|"medium"|"high"|"critical" }

Each action also needs a short "label" describing what will be created (e.g. "Add Lehi Clinic location").

Respond with ONLY a JSON object, no other text, in this exact shape:
{ "message": string, "actions": [ { "type": string, "label": string, "data": object } ] }
If no records make sense to propose, return "actions": []. Propose at most 5 actions. Use realistic behavioral-health examples (HIPAA, OSHA, DEA, Utah behavioral health) when suggesting regulatory sources, training, or policies.`;

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
    max_tokens: 900,
    system: systemWithContext,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Parse the structured response; fall back to plain text if parsing fails.
  let text = raw;
  let actions: { type: string; label: string; data: Record<string, unknown> }[] = [];
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { message?: string; actions?: typeof actions };
      if (parsed.message) text = parsed.message;
      if (Array.isArray(parsed.actions)) actions = parsed.actions.slice(0, 5);
    }
  } catch {
    // keep raw text, no actions
  }

  return NextResponse.json({ text, actions });
}
