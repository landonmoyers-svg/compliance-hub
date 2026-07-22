import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { getOrgName } from "@/lib/org-server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You write a complete, practice-ready COMPLIANCE DOCUMENT for a behavioral-health outpatient practice — a policy, SOP, procedure, checklist, or plan — ready to adopt with light edits.

Ground it in the applicable framework (HIPAA, OSHA, CMS, OIG, or state rules) for the topic. Be specific and operational: real roles, thresholds, and steps, not platitudes. Use placeholders like "[main line]" or "[Security Official]" for details the practice fills in — never invent addresses, names, or numbers.

Return the document as GitHub-flavored MARKDOWN ONLY — no JSON, no code fences, no preamble. The FIRST line MUST be a single H1 title (e.g. "# Fire Safety & Evacuation Policy"). Then structure appropriately for the document type — typically: Purpose & Scope; Policy/Procedure; Roles & Responsibilities; step-by-step procedure (numbered); references/citations; review cadence. For a checklist, use checkbox lists. Keep it thorough but scannable.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as { title?: string; documentType?: string; complianceArea?: string; spec?: string; pageTitle?: string };
  if (!body.title && !body.spec) return NextResponse.json({ error: "title or spec required" }, { status: 400 });
  const orgName = await getOrgName(supabase);

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2400,
      system: SYSTEM,
      messages: [{ role: "user", content: `Practice: ${orgName} (behavioral-health outpatient clinic in Utah).
Document to write: ${body.title ?? body.spec}
${body.documentType ? `Type: ${body.documentType}` : ""}
${body.complianceArea ? `Compliance area: ${body.complianceArea}` : ""}
${body.spec && body.title ? `Details: ${body.spec}` : ""}
${body.pageTitle ? `Context: requested from the ${body.pageTitle} page.` : ""}

Return the markdown document now (H1 title first).` }],
    });
    // Plain markdown (robust — large documents can't break JSON parsing).
    let raw = res.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("").trim();
    raw = raw.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const m = raw.match(/^#\s+(.+?)\s*$/m);
    return NextResponse.json({ title: (m?.[1] ?? body.title ?? "New document").trim(), content: raw });
  } catch {
    return NextResponse.json({ error: "The document writer is temporarily unavailable — please try again." }, { status: 502 });
  }
}
