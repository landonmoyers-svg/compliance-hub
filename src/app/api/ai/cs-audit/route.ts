import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a DEA-compliance analyst auditing the chain of custody for a single controlled-substance container at a small behavioral-health practice that ADMINISTERS on-site only (no dispensing to patients). You are given the container and its ordered custody events. Reconstruct the chain and verify it against DEA recordkeeping expectations (21 CFR Part 1304).

Check for:
- Balance integrity: does the running balance reconcile from the received quantity through each administer/waste/adjust to the current balance? Flag any unexplained change.
- Completeness: is there a continuous custody trail (received → safe → staff → administration/waste/destruction) with no gaps?
- Documentation: administer/waste/destroy/receive events should have a scanned record ("hasDocument": true). Flag missing scans.
- Witnessing: waste and destruction must have a witness. Flag unwitnessed waste/destruction.
- Discrepancies: any flagged discrepancy should have a corrective action ("hasCorrectiveAction": true). Flag unresolved discrepancies.
- Timing/order: events should be chronological.

Return ONLY valid JSON:
{"verdict":"clean"|"issues"|"critical","balanceReconciles":boolean,"summary":string,"issues":[{"issue":string,"severity":"low"|"medium"|"high"}],"recommendations":[string]}

Rules:
- "verdict": "clean" if no issues; "issues" for minor/moderate gaps; "critical" for an unexplained balance change, missing witness on waste/destruction, or an unresolved discrepancy.
- "summary": one or two sentences on the container's custody state.
- "issues": concrete, each tied to what's wrong; empty array if clean.
- "recommendations": specific next steps (e.g. "Obtain the witnessed waste form for the 2/14 waste and upload it"). Empty if clean.
- This is decision-support for a compliance officer, not legal advice. Be precise and avoid inventing facts not in the data.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as {
    item?: { substanceName?: string; scheduleClass?: string; quantityUnit?: string; initialQuantity?: number; currentQuantity?: number; state?: string; custodianName?: string; hasDiscrepancy?: boolean };
    events?: Array<{ eventType: string; eventDate?: string | null; quantity?: number; balanceAfter?: number | null; toCustodianName?: string; performedByName?: string; witnessName?: string; hasDocument?: boolean; discrepancy?: boolean; hasCorrectiveAction?: boolean }>;
  };
  if (!body.item || !Array.isArray(body.events)) {
    return NextResponse.json({ error: "Container and events are required." }, { status: 400 });
  }

  const payload = {
    container: body.item,
    // Chronological order (oldest first) for the model to walk the chain.
    events: [...body.events].reverse(),
  };

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Audit this container's chain of custody:\n\n${JSON.stringify(payload, null, 2)}\n\nReturn the audit JSON.` }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    console.error("cs-audit error:", err);
    return NextResponse.json({ error: "AI audit failed. Try again." }, { status: 500 });
  }
}
