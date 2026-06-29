import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_PROMPT = `You are the SOP Assistant for Lone Peak Psychiatry, a behavioral health practice. You help staff understand and apply:

- HIPAA Privacy and Security Rules (45 CFR Parts 160 and 164)
- OSHA standards for healthcare settings (bloodborne pathogens, hazard communication, emergency action plans)
- DEA regulations for Schedule II-V controlled substances
- State behavioral health licensure and CMHC certification requirements
- Employment law basics (FMLA, ADA, EEO)
- CMS Conditions of Participation
- Joint Commission / NCQA standards as they apply to outpatient behavioral health

Guidelines:
- PREFER the practice's own approved policies and regulatory sources listed below. When your answer is covered by one of them, ground your answer in it and cite it by its exact title (e.g. "per your SOP 'Bloodborne Pathogens Exposure Control Plan'").
- If the practice's documents do not cover the question, you may answer from general regulatory knowledge, but say so explicitly ("This isn't covered by a current Lone Peak policy, but in general…") so staff know it's not yet codified internally.
- When a regulation number or CFR citation is relevant, include it.
- Flag when something requires a licensed attorney or compliance officer to decide.
- Be concise — staff are busy clinicians, not lawyers.
- If asked about a specific patient situation, remind the user you cannot give legal or clinical advice about specific cases.
- Never invent a policy or a regulation. If a policy isn't in the list below, do not claim it exists.`;

/** Build a grounding context block from the org's active documents + regulatory sources. */
async function buildOrgContext(supabase: SupabaseClient): Promise<string> {
  const [docsRes, srcRes] = await Promise.all([
    supabase
      .from("documents")
      .select("title, document_type, compliance_area, summary, version, status")
      .eq("status", "active")
      .limit(80),
    supabase
      .from("regulatory_sources")
      .select("title, citation_label, issuing_body, jurisdiction, summary, official_url, review_status")
      .limit(60),
  ]);

  const docs = docsRes.data ?? [];
  const sources = srcRes.data ?? [];

  if (docs.length === 0 && sources.length === 0) {
    return "\n\n(The practice has not yet uploaded any internal policies or regulatory sources. Answer from general regulatory knowledge and recommend codifying key policies.)";
  }

  let ctx = "\n\n=== LONE PEAK APPROVED SOURCES (ground answers in these) ===\n";

  if (docs.length > 0) {
    ctx += `\nInternal policies & SOPs (${docs.length} active):\n`;
    for (const d of docs) {
      const area = d.compliance_area ? ` [${d.compliance_area}]` : "";
      const summary = d.summary ? ` — ${String(d.summary).slice(0, 200)}` : "";
      ctx += `• "${d.title}" (${d.document_type}${area}, v${d.version ?? "1.0"})${summary}\n`;
    }
  }

  if (sources.length > 0) {
    ctx += `\nRegulatory sources tracked by the practice (${sources.length}):\n`;
    for (const s of sources) {
      const cite = s.citation_label ? ` (${s.citation_label})` : "";
      const body = s.issuing_body ? ` — ${s.issuing_body}` : "";
      const summary = s.summary ? `: ${String(s.summary).slice(0, 160)}` : "";
      ctx += `• "${s.title}"${cite}${body}${summary}\n`;
    }
  }

  ctx += "\n=== END APPROVED SOURCES ===";
  return ctx;
}

export async function POST(request: NextRequest) {
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

  let orgContext = "";
  try {
    orgContext = await buildOrgContext(supabase);
  } catch {
    orgContext = ""; // grounding is best-effort; fall back to base prompt
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: BASE_PROMPT + orgContext,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return NextResponse.json({ text });
}
