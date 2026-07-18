import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You analyze a professional CREDENTIAL for a behavioral-health practice — a license, board certification, DEA registration, CPR/BLS/ACLS card, immunization record, background check, etc. — and return structured metadata a compliance officer will review.

You are given the credential's existing fields, a PEOPLE roster of app users (each with userId + name), and — when available — the ACTUAL DOCUMENT (PDF/image). When the document is attached, READ IT and prefer what it says over the existing fields.

Return ONLY valid JSON:
{"credentialType":"license"|"certification"|"dea"|"cpr_bls_acls"|"immunization"|"background_check"|"other","credentialClass":"rn"|"aprn"|"aprn_cs"|"pa"|"dea"|"board_cert"|"other","boardType":"FNP"|"PMHNP"|"PA"|null,"credentialName":string,"issuingBody":string|null,"credentialNumber":string|null,"issueDate":string|null,"expirationDate":string|null,"holderName":string|null,"matchedUserId":string|null,"summary":string}

Rules:
- "credentialType": license = a professional license to practice (MD/DO/APRN/PMHNP/PA/RN/LCSW/DOPL professional license); dea = a DEA registration/certificate specifically; certification = board certifications and specialty certs; cpr_bls_acls = CPR/BLS/ACLS cards; immunization = vaccination/immunization records; background_check = background checks / BCI/FBI / OIG-SAM / fingerprint clearances; other = anything that isn't a clinician credential (e.g. a conflict-of-interest declaration or an HR form).
- "credentialClass": the CLINICAL taxonomy, decided by READING THE DOCUMENT ITSELF (not its filename or title). Determine what the document actually is:
    rn = a Registered Nurse license with NO advanced-practice scope.
    aprn = an Advanced Practice Registered Nurse license WITHOUT controlled-substance authority stated on it.
    aprn_cs = an APRN license that GRANTS controlled-substance authority/prescribing (look for "controlled substance", "CSR", schedules II–V on the license itself), OR a separate APRN controlled-substance license.
    pa = a Physician Assistant license.
    dea = a DEA registration/controlled-substance registration certificate.
    board_cert = a board certification (e.g. ANCC PMHNP-BC, AANP FNP, NCCPA PA-C).
    other = anything that is not one of the above (CPR/BLS card, immunization, background check, CV, diploma, payer/insurance agreement, HR form, etc.).
  Base this ONLY on the document contents; if no document is attached, use the existing fields as a weak hint and prefer "other" when genuinely unsure.
- "boardType": for board_cert only, the certification's practice focus read from the document — "FNP" (Family NP), "PMHNP" (Psychiatric-Mental Health NP), or "PA" (physician assistant / NCCPA). null for everything else.
- "credentialName": a clean, specific name (e.g. "Utah Physician & Surgeon License", "DEA Registration", "BLS Provider Card").
- "issuingBody": the issuing authority (state board/DOPL, ANCC, AHA, DEA…), or null.
- "credentialNumber": the license/registration/certificate number, or null.
- "issueDate" / "expirationDate": YYYY-MM-DD, or null if not shown. NEVER invent a date or number — use null when it isn't clearly present.
- "holderName": the full name of the person this credential belongs to, as read from the document (or its title), or null if you truly cannot tell.
- "matchedUserId": if the holder clearly corresponds to exactly one person in the PEOPLE roster, return THAT person's exact userId string. The document's holder name often includes a MIDDLE name, a hyphenated or maiden last name, or a credential SUFFIX (NP, NP-P, PMHNP, APRN, PA, PA-C, MD, DO) — ignore those and match on the core first + last name (e.g. "Landon Robert Moyers, NP-P" matches "Landon Moyers"; "Vanessa E. Martinez-Quezada, PA" matches "Vanessa Martinez"). A last name alone is enough when it's unambiguous in the roster. Return null only when there is genuinely no single clear match; never guess between two similar names.
- "summary": one short sentence describing what the document is.
Return only the JSON object.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.`, capped: true }, { status: 429 });

  const body = await request.json() as {
    credentialName?: string; credentialType?: string; issuingBody?: string; credentialNumber?: string;
    employeeName?: string; fileBase64?: string; mediaType?: string;
    people?: { userId: string; name: string }[];
  };

  const known = `Existing fields:\n- Name: ${body.credentialName ?? ""}\n- Type: ${body.credentialType ?? ""}\n- Issuing body: ${body.issuingBody ?? ""}\n- Number: ${body.credentialNumber ?? ""}\n- Currently held by: ${body.employeeName ?? "(unassigned)"}`;
  const roster = `PEOPLE roster (match the holder to one of these; return the userId):\n${JSON.stringify((body.people ?? []).slice(0, 200))}`;
  const prompt = `${known}\n\n${roster}\n\n${body.fileBase64 ? "The actual credential document is attached above — read it and extract the metadata, including who it belongs to." : "No document is attached — infer the metadata from the existing fields above."}\n\nReturn the JSON.`;

  const content: Anthropic.ContentBlockParam[] = [];
  if (body.fileBase64 && body.mediaType === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: body.fileBase64 } });
  } else if (body.fileBase64 && body.mediaType && body.mediaType.startsWith("image/")) {
    content.push({ type: "image", source: { type: "base64", media_type: body.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: body.fileBase64 } });
  }
  content.push({ type: "text", text: prompt });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model output");
    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    console.error("credential-analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
