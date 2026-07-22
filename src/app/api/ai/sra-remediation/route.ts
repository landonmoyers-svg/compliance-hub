import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";
import { getOrgName } from "@/lib/org-server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You draft a concrete, practice-ready REMEDIATION PLAN for a single HIPAA Security Rule safeguard gap at a behavioral-health outpatient practice. The safeguard is currently a partial or full gap; write what the practice should actually DO to close it.

Return ONLY valid JSON: {"remediation": string, "owner": string, "dueWeeks": number}
- "remediation": 2-5 concrete, imperative steps addressing THIS specific safeguard and its CFR citation — real actions (configure X, document Y, assign Z), not restating the requirement. Where the app already has a tool (Vendor Management/BAAs, Training, Backups, Audit Trail, Policies/SOP Library, Onboarding/Offboarding), reference using it. Number the steps.
- "owner": the role best suited to own this (e.g. "Security Official", "IT / managed service provider", "HR", "Office Manager"). A role, not a person.
- "dueWeeks": a realistic target to complete, as an integer number of weeks (2-12; use fewer for high-risk quick wins).
Be specific and proportionate for a small practice. Return only the JSON.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as { question?: string; cfr?: string; status?: string; response?: string };
  if (!body.question) return NextResponse.json({ error: "question required" }, { status: 400 });
  const orgName = await getOrgName(supabase);

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: "user", content: `Practice: ${orgName}\nSafeguard: ${body.question}\nCitation: ${body.cfr ?? "HIPAA Security Rule"}\nCurrent status: ${body.status ?? "gap"}\nNotes so far: ${body.response || "(none)"}\n\nDraft the remediation plan JSON.` }],
    });
    const raw = res.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("");
    const match = raw.match(/\{[\s\S]*\}/);
    return NextResponse.json(JSON.parse(match ? match[0] : raw));
  } catch {
    return NextResponse.json({ error: "The planner is temporarily unavailable — please try again." }, { status: 502 });
  }
}
