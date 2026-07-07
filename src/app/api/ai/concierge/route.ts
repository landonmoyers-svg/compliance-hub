import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { getOrgName } from "@/lib/org-server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const conciergeSystem = (org: string) => `You are the Compliance Setup Concierge for ${org}'s Compliance Hub. Your job is to guide administrators through setting up their compliance program step by step.

IMPORTANT — you CAN see the practice's current data. A live snapshot of what is already in the system (employees, who has app logins, locations, documents, training, regulatory sources, and the configured default account role) is provided to you on every turn under "CURRENT STATE". Use it to give specific, grounded answers. NEVER tell the user you can't read their system, their settings, or their data — you can, and the snapshot is right there. If the user says something is "already added," check the snapshot and confirm the actual count instead of asking them to re-paste it.

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

You can PROPOSE records for the admin to create/invite with one click. When the user asks you to set something up or it would clearly help, include "actions" — but you only PROPOSE; the admin must click to confirm. Never claim a record was created or a login was sent. Supported action types and their data shapes:
- "create_location": { "name": string, "type"?: "clinic"|"office"|"remote"|"other", "city"?: string, "state"?: string }
- "create_employee": { "firstName": string, "lastName": string, "email": string, "title"?: string, "department"?: string, "accountRole"?: "owner"|"admin"|"hr"|"clinical_leadership"|"manager"|"staff"|"contractor"|"read_only", "invite"?: boolean } — creates a NEW employee record AND, when "invite" is true (default true when an email is given), provisions a real app login. Use this only for people NOT already in the directory (not in the snapshot).
- "invite_employee": { "email": string, "accountRole"?: (same enum as above) } — for someone ALREADY in the employee directory who has NO app login yet: provisions their login (creates the Supabase auth account + linked profile and emails them to set a password) and links it to their existing record. Use the email exactly as it appears in the snapshot. If no accountRole is given, the organization's configured default account role is used.
- "invite_all_pending": {} — provisions logins in bulk for EVERY active employee in the directory who does not yet have one, each using the organization's default account role. Propose this (a single action) when the admin wants "everyone" to get access. Tell them in the message how many people that is (from the snapshot) and that roles can be adjusted afterward.
- "create_training_module": { "title": string, "description"?: string, "trainingType"?: string, "passingScore"?: number }
- "create_regulatory_source": { "title": string, "citationLabel"?: string, "issuingBody"?: string, "sourceType"?: "regulation"|"guidance"|"internal"|"statute" }
- "create_document": { "title": string, "documentType"?: string, "complianceArea"?: string, "summary"?: string }
- "create_task": { "title": string, "description"?: string, "priority"?: "low"|"medium"|"high"|"critical" }

Each action also needs a short "label" describing what will happen (e.g. "Invite Jane Coats to the app" or "Invite all 34 employees without logins").

When the user asks to give staff app access and the people are already in the directory (shown in the snapshot), use "invite_employee" / "invite_all_pending" — do NOT use "create_employee" (that would duplicate them). Respect the configured default account role rather than guessing; only override it when the user specifies a role for a specific person.

Respond with ONLY a JSON object, no other text, in this exact shape:
{ "message": string, "actions": [ { "type": string, "label": string, "data": object } ] }
If no records make sense to propose, return "actions": []. Propose at most 5 actions (a single "invite_all_pending" covers everyone). Use realistic behavioral-health examples (HIPAA, OSHA, DEA, Utah behavioral health) when suggesting regulatory sources, training, or policies.`;

/** Live, RLS-scoped snapshot of what's already configured, so the Concierge answers from real data. */
async function buildSnapshot(supabase: Awaited<ReturnType<typeof createClient>>, defaultRole: string): Promise<string> {
  const count = async (table: string, filter?: (q: ReturnType<ReturnType<typeof supabase.from>["select"]>) => typeof q) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count: c } = await q;
    return c ?? 0;
  };

  const [{ data: emps }, locations, documents, trainingModules, regTotal, regCurrent, credentials, insurance, sds] = await Promise.all([
    supabase.from("employees").select("first_name,last_name,email,title,job_role,user_id,employment_status").order("last_name"),
    count("locations"),
    count("documents"),
    count("training_modules"),
    count("regulatory_sources"),
    count("regulatory_sources", (q) => q.eq("review_status", "current")),
    count("credentials"),
    count("insurance_policies"),
    count("sds_records"),
  ]);

  const rows = (emps ?? []) as { first_name: string; last_name: string; email: string | null; title: string | null; job_role: string | null; user_id: string | null; employment_status: string | null }[];
  const active = rows.filter((r) => r.employment_status === "active");
  const withLogin = active.filter((r) => r.user_id);
  const noLogin = active.filter((r) => !r.user_id);
  const noLoginList = noLogin
    .map((r) => `${r.first_name} ${r.last_name}${r.email ? ` <${r.email}>` : " (no email on file)"}${r.title || r.job_role ? ` — ${r.title || r.job_role}` : ""}`)
    .join("\n");

  return `CURRENT STATE (live, read from the system now):
- Employees in directory: ${active.length} active${rows.length !== active.length ? ` (${rows.length - active.length} inactive/terminated not counted)` : ""}
- Employees WITH an app login: ${withLogin.length}
- Employees WITHOUT an app login: ${noLogin.length}
- Configured default account role for new invites: "${defaultRole}"
- Locations: ${locations} · Documents/SOPs: ${documents} · Training modules: ${trainingModules}
- Regulatory sources: ${regTotal} (${regCurrent} marked current) · Credentials: ${credentials} · Insurance policies: ${insurance} · SDS sheets: ${sds}
${noLogin.length > 0 ? `\nActive employees still needing an app login (use invite_employee with the exact email, or invite_all_pending for all of them):\n${noLoginList}` : "\nEvery active employee already has an app login."}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    messages: { role: "user" | "assistant"; content: string }[];
    completedSteps: string[];
  };
  const { messages, completedSteps } = body;

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) {
    return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });
  }

  const orgName = await getOrgName(supabase);
  const { data: settingsRow } = await supabase.from("organization_settings").select("default_account_role").limit(1).maybeSingle();
  const defaultRole = (settingsRow?.default_account_role as string | null) ?? "staff";
  const snapshot = await buildSnapshot(supabase, defaultRole);
  const progress = `\n\n${snapshot}\n\nCurrent setup checklist — steps the admin has marked done: ${completedSteps.length > 0 ? completedSteps.join(", ") : "none yet"}.`;

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      // Large static instructions are cached; the live snapshot + progress vary each turn.
      system: [
        { type: "text", text: conciergeSystem(orgName), cache_control: { type: "ephemeral" } },
        { type: "text", text: progress },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch {
    return NextResponse.json({ text: "The setup concierge is temporarily unavailable — please try again.", actions: [] });
  }

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
