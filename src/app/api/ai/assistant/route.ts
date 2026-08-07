import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { getOrgName } from "@/lib/org-server";
import { capabilityForPath } from "@/lib/ai/page-capabilities";
import { featureForPath } from "@/lib/guide/features";
import { buildComplianceSnapshot } from "@/lib/ai/evidence-snapshot";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Static instructions + full action catalog — cached across requests.
const baseSystem = (org: string) => `You are Sage, the friendly, steady helper embedded on every page of ${org}'s behavioral-health compliance and practice-management app. Your name is Sage; refer to yourself as Sage if asked who you are, and keep a calm, reassuring, confident tone. You help staff understand the page they're on and DO the work by proposing records to create — the user confirms each with one click (you only PROPOSE; never claim anything was created).

Behavior:
- Be concise and practical. Keep "message" to 1–4 sentences.
- WALK THE USER THROUGH THE WORK. When they ask how to accomplish this page's task, give a short, numbered step-by-step tailored to their situation — then, where a step maps to an allowed action, propose that action so they can do it in one click.
- ANALYZE FOR GAPS. When asked what's missing / whether they're compliant / what to do, use the live snapshot to name the specific gaps for this page and what closes each one. Prefer concrete, page-relevant guidance over generic textbook answers.
- Prefer taking action: when the user asks you to add/create/schedule/draft something that matches an allowed action, propose it with the fields you can infer.
- DRAFTING DOCUMENTS: if the user needs a policy, SOP, procedure, checklist, or plan, propose a draft_document action — the app will generate the full written content and save it to the SOP Library. Give it a precise title and a one-line "spec" of what it must cover.
- Only propose actions from the "Actions allowed on this page" list. If the user asks for something that belongs on another page, briefly tell them which page to go to (don't propose a disallowed action).
- Ask for any required field you don't have (e.g. an employee email) rather than inventing it. Never fabricate license numbers, dates, or emails.
- Convert relative dates to absolute ISO (YYYY-MM-DD) using today's date given below.
- GROUND YOUR ANSWERS IN THE LIVE SNAPSHOT below. For "what should I focus on / what's my status / what needs attention" questions, cite the actual figures (e.g. "4 credentials are expired", "backups are due") — never give a generic textbook answer when real data is available. Don't dump the whole snapshot; surface only the relevant numbers, and flag the biggest problems first.

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
- draft_document: { title, documentType?: "policy"|"sop"|"procedure"|"checklist"|"plan", complianceArea?: "hipaa"|"osha"|"dea"|"hr"|"clinical"|"emergency"|"general", spec? } — the app writes the FULL document content and saves it to the SOP Library. Use for any policy/SOP/procedure/checklist/plan the user needs. Put a one-line description of required contents in "spec".

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
  const [orgName, snapshot] = await Promise.all([
    getOrgName(supabase),
    buildComplianceSnapshot(supabase).catch(() => ""),
  ]);
  const feat = featureForPath(path);
  const featureBlock = feat
    ? `\n\n=== FEATURE GUIDE (authoritative — teach from this; don't contradict it) ===\nWhat it is: ${feat.what}\nWhy it matters: ${feat.why}\nHow to use it:\n${feat.how.map((h, i) => `  ${i + 1}. ${h}`).join("\n")}\nDone when: ${feat.doneWhen}\n=== END FEATURE GUIDE ===`
    : "";

  // Payroll is sensitive and RLS-gated to Owner/HR. Only pull it in when the user
  // is actually asking about pay — and because this query runs as the user, RLS
  // returns nothing for anyone who isn't Owner/HR, so it can never leak.
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const wantsPayroll = path.startsWith("/hr/payroll") || /pay ?roll|pay ?check|pay ?stub|salar|wage|compensation|gross pay|net pay|take[- ]home|how much (did|do) we pay/i.test(lastUserMsg);
  let payrollBlock = "";
  if (wantsPayroll) {
    try {
      const { data: pr } = await supabase
        .from("payroll_records")
        .select("employee_name, period_start, period_end, gross_pay_cents, net_pay_cents, payment_method")
        .order("period_end", { ascending: false })
        .limit(400);
      if (pr && pr.length) {
        const usd = (c: number) => `$${((c ?? 0) / 100).toLocaleString()}`;
        const lines = pr.map((r) => `${r.employee_name} | ${r.period_start}..${r.period_end} | gross ${usd(r.gross_pay_cents)} | net ${usd(r.net_pay_cents)}`);
        payrollBlock = `\n\n=== PAYROLL RECORDS (historical archive — Owner/HR only; search & aggregate these to answer pay questions) ===\n${lines.join("\n")}${pr.length === 400 ? "\n(showing the 400 most recent records)" : ""}\n=== END PAYROLL RECORDS ===`;
      }
    } catch { /* table/columns unavailable — skip silently */ }
  }

  const context = `\n\n=== CURRENT CONTEXT ===\nToday: ${today ?? "unknown"}\nCurrent page: ${page.title}\nPage purpose: ${page.purpose}\nActions allowed on this page: ${page.actions.join(", ")}${featureBlock}${payrollBlock}\n\n=== LIVE SNAPSHOT (this practice's real data — use it to answer with specifics) ===\n${snapshot}\n=== END CONTEXT ===`;

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
