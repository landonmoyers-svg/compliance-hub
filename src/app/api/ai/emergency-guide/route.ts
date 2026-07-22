import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { getOrgName } from "@/lib/org-server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DRAFT_SYSTEM = `You are an emergency-preparedness planner for a behavioral-health outpatient practice. You write a complete, practice-ready EMERGENCY PLAN for one scenario, ready to adopt with minimal edits.

Ground the plan in the CMS Emergency Preparedness Rule core elements (risk assessment, communication plan, policies & procedures, training & testing), OSHA, and behavioral-health specifics (patient crisis, de-escalation, elopement, workplace violence). Be specific and operational — real roles, thresholds, and steps, not platitudes.

Return ONLY valid JSON: {"title": string, "content": string}
- "title": a clear plan title (e.g. "Fire & Smoke Emergency Response Plan").
- "content": GitHub-flavored MARKDOWN with these sections, in order:
  1. "## Purpose & Scope"
  2. "## Roles & Responsibilities" (name roles: Incident Lead, Safety Officer, Clinical Lead, Front Desk — not individuals)
  3. "## Prevention & Preparedness" (equipment, signage, supplies, training cadence)
  4. "## Response Algorithm" — a NUMBERED, decision-based step-by-step (use "If X → do Y" branches). This is the core: what to do in the first seconds/minutes, who calls 911, evacuate vs. shelter decision, patient & staff safety, accounting for everyone.
  5. "## Communication" (who is notified, in what order, how — internal alert phrase, patients, authorities, families)
  6. "## Patient-Specific Considerations" (patients in session, crisis/agitated patients, mobility, minors)
  7. "## Recovery & After-Action" (all-clear, headcount, documentation, debrief, incident report)
  8. "## Training & Drills" (who trains, how often, drill cadence)
Keep it thorough but scannable. Use the practice's name where natural. Do not invent specific addresses, phone numbers, or staff names — use placeholders like "[main line]" or "[assembly point]" the practice will fill in.`;

const REVIEW_SYSTEM = `You review an existing EMERGENCY PLAN for a behavioral-health practice and find gaps against best practice (CMS Emergency Preparedness core elements, OSHA, behavioral-health specifics).

Return ONLY valid JSON: {"completeness": number, "summary": string, "gaps": string[], "suggestions": string[]}
- "completeness": 0-100, how complete/ready-to-use the plan is.
- "summary": 1-2 sentences on the plan's overall state.
- "gaps": specific missing or weak elements (e.g. "No decision point for evacuate vs. shelter-in-place", "Communication chain doesn't cover notifying families of minors"). 3-8 items.
- "suggestions": concrete, actionable improvements, each one sentence. 3-8 items.
Be specific to what the plan actually says — cite the missing piece, don't give generic advice.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as {
    mode: "draft" | "review";
    planType?: string;
    planLabel?: string;
    content?: string;
    requiredElements?: string[];
    citations?: string[];
    sopContext?: string; // titles + excerpts of the practice's related SOPs
  };
  const orgName = await getOrgName(supabase);
  const reqs = body.requiredElements?.length ? `\n\nThis plan MUST cover these required elements: ${body.requiredElements.join("; ")}.` : "";
  const cites = body.citations?.length ? `\nApplicable rules: ${body.citations.join("; ")}.` : "";
  const sops = body.sopContext ? `\n\nAlign with the practice's EXISTING related policies (reference and stay consistent with them; don't contradict):\n${body.sopContext.slice(0, 6000)}` : "";

  try {
    if (body.mode === "review") {
      if (!body.content?.trim()) return NextResponse.json({ error: "No plan content to review." }, { status: 400 });
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        system: REVIEW_SYSTEM,
        messages: [{ role: "user", content: `Practice: ${orgName}\nScenario: ${body.planLabel ?? body.planType}\n\nPLAN CONTENT:\n${body.content.slice(0, 12000)}\n\nReturn the JSON review.` }],
      });
      return NextResponse.json(parseJson(res));
    }

    // draft
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2400,
      system: DRAFT_SYSTEM,
      messages: [{ role: "user", content: `Practice: ${orgName} (behavioral-health outpatient clinic in Utah).\nWrite the emergency plan for this scenario: ${body.planLabel ?? body.planType}.${cites}${reqs}${sops}\n\nReturn the JSON with title and full markdown content.` }],
    });
    return NextResponse.json(parseJson(res));
  } catch {
    return NextResponse.json({ error: "The planner is temporarily unavailable — please try again." }, { status: 502 });
  }
}

function parseJson(res: Anthropic.Messages.Message): unknown {
  const raw = res.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("");
  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : raw);
}
