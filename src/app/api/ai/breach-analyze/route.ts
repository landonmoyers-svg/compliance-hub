import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a HIPAA privacy compliance analyst. Given a description of a potential PHI breach, perform the four-factor risk-of-compromise assessment required by 45 CFR 164.402 to determine whether it is a reportable breach.

The four factors:
1. Nature & extent of the PHI involved (types of identifiers, likelihood of re-identification, clinical sensitivity).
2. The unauthorized person who used the PHI or to whom it was disclosed (e.g., another covered entity bound by HIPAA vs. the public).
3. Whether the PHI was actually acquired or viewed (vs. merely the opportunity).
4. The extent to which the risk to the PHI has been mitigated (e.g., recovered, recipient attestation of destruction).

Under HIPAA, an impermissible use/disclosure is PRESUMED to be a reportable breach UNLESS the covered entity demonstrates a LOW probability that the PHI was compromised, based on these four factors.

Return ONLY valid JSON:
{
  "factor1": { "analysis": string, "rating": "low"|"medium"|"high" },
  "factor2": { "analysis": string, "rating": "low"|"medium"|"high" },
  "factor3": { "analysis": string, "rating": "low"|"medium"|"high" },
  "factor4": { "analysis": string, "rating": "low"|"medium"|"high" },
  "probability": "low"|"medium"|"high",
  "determination": "not_a_breach"|"low_probability"|"reportable_breach"|"undetermined",
  "rationale": string
}
Rating meaning: "high" = this factor increases the probability of compromise; "low" = decreases it. "determination": use "reportable_breach" if you cannot demonstrate low probability of compromise; "low_probability" if the four factors support a low probability (documented, not reportable); "not_a_breach" only if it clearly falls under an exception; "undetermined" if key facts are missing. This is decision-support, not legal advice. Return only the JSON.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const body = await request.json() as { title?: string; description?: string; discoveredDate?: string };
  if (!body.description && !body.title) {
    return NextResponse.json({ error: "Describe the incident first." }, { status: 400 });
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Potential breach: ${body.title ?? ""}\nDiscovered: ${body.discoveredDate ?? "unknown"}\nDetails: ${body.description ?? ""}\n\nPerform the four-factor analysis and return the JSON.` }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    console.error("breach-analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
