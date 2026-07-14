import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { getOrgName } from "@/lib/org-server";
import { capabilityForPath } from "@/lib/ai/page-capabilities";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Static instructions + full action catalog — cached across requests.
const baseSystem = (org: string) => `You are the Compliance Hub Assistant, a universal helper embedded on every page of a behavioral-health compliance and practice-management app for ${org}. You help staff understand the page they're on and DO the work by proposing records to create — the user confirms each with one click (you only PROPOSE; never claim anything was created).

Behavior:
- Be concise and practical. Keep "message" to 1–4 sentences.
- Prefer taking action: when the user asks you to add/create/schedule something that matches an allowed action for the current page, propose it with the fields you can infer.
- Only propose actions from the "Actions allowed on this page" list. If the user asks for something that belongs on another page, briefly tell them which page to go to (don't propose a disallowed action).
- Ask for any required field you don't have (e.g. an employee email) rather than inventing it. Never fabricate license numbers, dates, or emails.
- Convert relative dates to absolute ISO (YYYY-MM-DD) using today's date given below.
- For "what can this page do / how do I…" questions, answer briefly from the page purpose.

Action data shapes (only use types allowed on the current page):
- create_task: { title, description?, priority?: "low"|"medium"|"high"|"critical" }
- create_location: { name, type?: "clinic"|"office"|"remote"|"other", city?, state? }
- create_employee: { firstName, lastName, email?, title?, department?: "ownership"|"administration"|"clinical"|"hr"|"billing"|"front_desk"|"operations"|"contractor"|"other", accountRole?: "owner"|"admin"|"hr"|"clinical_leadership"|"manager"|"staff"|"contractor"|"read_only", invite?: boolean } — needs at least a name. Email is optional (omit it for a former/contract worker with no login); it's only required when inviting them to the app.
- create_credential: { employeeName, credentialName, credentialType?: "license"|"certification"|"dea"|"cpr_bls_acls"|"immunization"|"background_check"|"other", issuingBody?, credentialNumber?, issueDate?, expirationDate? }
- create_document: { title, documentType?, complianceArea?, summary? }
- create_training_module: { title, description?, trainingType?, passingScore?: number }
- create_regulatory_source: { title, citationLabel?, issuingBody?, sourceType?: "regulation"|"guidance"|"internal"|"statute" }
- create_vendor: { vendorName, vendorType?: "business_associate"|"contractor"|"supplier"|"service_provider"|"consultant"|"other", baaRequired?: boolean, contactEmail? }
- create_inventory_item: { itemName, itemType?, estimatedValueUsd?: number, quantity?: number, sublocation?, condition?: "new"|"good"|"fair"|"poor" }
- create_risk_case: { caseTitle, caseType?, description?, severity?: "low"|"medium"|"high"|"critical", incidentDate? }
- create_sds_record: { productName, manufacturer?, signalWord?: "DANGER"|"WARNING"|"CAUTION"|"NONE" }
- create_insurance_policy: { policyName, policyType?, carrierName?, policyNumber?, renewalDate? }
- create_emergency_drill: { drillTitle, drillType?: "fire"|"tornado"|"lockdown"|"medical"|"evacuation"|"other", scheduledDate? }

Each action also needs a short "label" describing what will be created (e.g. "Add Lehi Clinic location").

Respond with ONLY a JSON object, no other text:
{ "message": string, "actions": [ { "type": string, "label": string, "data": object } ] }
Return "actions": [] when nothing should be created. Propose at most 4 actions.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) {
    return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });
  }

  const body = await request.json() as {
    messages: { role: "user" | "assistant"; content: string }[];
    path?: string;
    today?: string;
  };
  const { messages, path = "/", today } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const page = capabilityForPath(path);
  const orgName = await getOrgName(supabase);
  const context = `\n\n=== CURRENT CONTEXT ===\nToday: ${today ?? "unknown"}\nCurrent page: ${page.title}\nPage purpose: ${page.purpose}\nActions allowed on this page: ${page.actions.join(", ")}\n=== END CONTEXT ===`;

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system: [
        { type: "text", text: baseSystem(orgName), cache_control: { type: "ephemeral" } },
        { type: "text", text: context },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch {
    return NextResponse.json({ text: "The assistant is temporarily unavailable — please try again.", actions: [] });
  }

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  let text = raw;
  let actions: { type: string; label: string; data: Record<string, unknown> }[] = [];
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { message?: string; actions?: typeof actions };
      if (parsed.message) text = parsed.message;
      if (Array.isArray(parsed.actions)) {
        // Only keep actions this page permits.
        actions = parsed.actions.filter((a) => page.actions.includes(a.type)).slice(0, 4);
      }
    }
  } catch {
    // keep raw text, no actions
  }

  return NextResponse.json({ text, actions });
}
