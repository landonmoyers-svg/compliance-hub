import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { enforceAiCap } from "@/lib/ai/usage";

/**
 * Automated SDS-PDF retrieval. Claude web-searches for the product's official
 * manufacturer Safety Data Sheet, returns candidate DIRECT pdf links, and the
 * SERVER then fetches the actual PDF and stores it in the private `documents`
 * bucket — so the record ends up holding the real document with one click,
 * instead of the old link-out-then-manually-attach flow.
 *
 * We fetch the PDF ourselves (never the browser) so we control redirects,
 * content-type/magic-byte validation, size caps, and SSRF hardening.
 */

const client = new Anthropic();
const BUCKET = "documents";
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

/** Reject non-public hosts before the server fetches a model-supplied URL. */
function isSafePublicUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") ||
    h === "0.0.0.0" || h === "::1" ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) return null;
  return u;
}

interface FindResult {
  found?: boolean;
  pdfUrls?: string[];
  sourceName?: string;
  productName?: string;
  manufacturer?: string;
  casNumber?: string;
  signalWord?: "DANGER" | "WARNING" | "CAUTION" | "NONE";
  hazardStatements?: string;
  revisionDate?: string;
  note?: string;
}

/** Download a candidate URL and confirm it is really a PDF. */
async function fetchPdf(url: URL): Promise<ArrayBuffer | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        // Some SDS hosts 403 a bare fetch; present a normal browser UA.
        "User-Agent": "Mozilla/5.0 (compatible; ComplianceHub-SDS/1.0)",
        Accept: "application/pdf,*/*",
      },
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") || "0");
    if (len && len > MAX_PDF_BYTES) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_PDF_BYTES) return null;
    // Magic bytes: a real PDF starts with "%PDF-". Trust this over content-type,
    // since some servers mislabel PDFs as octet-stream.
    const head = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 5)));
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (head !== "%PDF-" && !ct.includes("application/pdf")) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await enforceAiCap(supabase);
  if (!cap.ok) return NextResponse.json({ error: `Daily AI limit reached (${cap.limit} requests). It resets tomorrow.` }, { status: 429 });

  const { productName, manufacturer, upc } = await request.json() as
    { productName?: string; manufacturer?: string; upc?: string };
  if (!productName?.trim()) {
    return NextResponse.json({ error: "Enter a product name first." }, { status: 400 });
  }

  const target = [
    `Product: ${productName.trim()}`,
    manufacturer?.trim() ? `Manufacturer: ${manufacturer.trim()}` : "",
    upc?.trim() ? `UPC/Product code: ${upc.trim()}` : "",
  ].filter(Boolean).join("\n");

  const system = `You are an expert in OSHA Hazard Communication (HazCom) and Safety Data Sheets. Use the web_search tool to locate the OFFICIAL Safety Data Sheet (SDS/MSDS) PDF for the product below.

Rules:
- Strongly prefer the manufacturer's own website; an authoritative distributor or an SDS aggregator (e.g. a "...sds.pdf" link) is an acceptable fallback.
- Return only DIRECT links to the actual PDF file (URLs that download/open the .pdf), not links to a search page or an HTML viewer.
- Give up to 3 candidate PDF URLs, best first.
- Also report any GHS hazard data visible in the search snippets.

Return ONLY a JSON object, no other text:
{
  "found": boolean,
  "pdfUrls": ["direct .pdf url", "..."],
  "sourceName": "manufacturer or site the SDS came from",
  "productName": "corrected/full product name",
  "manufacturer": "manufacturer name if known, else ''",
  "casNumber": "primary CAS number if applicable, else ''",
  "signalWord": "DANGER" | "WARNING" | "CAUTION" | "NONE",
  "hazardStatements": "GHS H-statements, one per line, or ''",
  "revisionDate": "SDS revision date as YYYY-MM-DD if visible, else ''",
  "note": "one short sentence on what you found or why not"
}
If you cannot find a genuine SDS PDF, set "found": false and "pdfUrls": [].`;

  try {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: `Find the official SDS PDF for:\n${target}` },
    ];
    const tools: Anthropic.Messages.ToolUnion[] = [
      { type: "web_search_20250305", name: "web_search", max_uses: 5 },
    ];

    // web_search runs server-side; a long search turn can stop with
    // stop_reason "pause_turn" — re-send to let it resume.
    let response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system,
      tools,
      messages,
    });
    for (let i = 0; i < 4 && response.stop_reason === "pause_turn"; i++) {
      messages.push({ role: "assistant", content: response.content });
      response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system,
        tools,
        messages,
      });
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in model response");
    const parsed = JSON.parse(jsonMatch[0]) as FindResult;

    const candidates = (parsed.pdfUrls ?? [])
      .map((c) => isSafePublicUrl(String(c)))
      .filter((u): u is URL => u !== null)
      .slice(0, 3);

    if (!parsed.found || candidates.length === 0) {
      return NextResponse.json({
        found: false,
        message: parsed.note || "Couldn't find a downloadable SDS PDF. Try the CPID search and attach it manually.",
      });
    }

    // Try candidates in order until one yields a real PDF.
    let pdf: ArrayBuffer | null = null;
    let sourceUrl = "";
    for (const u of candidates) {
      pdf = await fetchPdf(u);
      if (pdf) { sourceUrl = u.toString(); break; }
    }
    if (!pdf) {
      return NextResponse.json({
        found: false,
        message: "Found a likely SDS but couldn't download a valid PDF from it. Try the CPID search and attach it manually.",
        candidateUrl: candidates[0]?.toString() ?? "",
      });
    }

    const safeName = (parsed.productName || productName)
      .replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 50) || "sds";
    const path = `sds/${Date.now()}-auto-${safeName}.pdf`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (upErr) {
      return NextResponse.json({ error: `Downloaded the SDS but couldn't save it: ${upErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      found: true,
      fileUrl: path,
      sourceUrl,
      sourceName: parsed.sourceName ?? "",
      productName: parsed.productName ?? productName,
      manufacturer: parsed.manufacturer ?? "",
      casNumber: parsed.casNumber ?? "",
      signalWord: parsed.signalWord ?? "NONE",
      hazardStatements: parsed.hazardStatements ?? "",
      revisionDate: parsed.revisionDate ?? "",
      note: parsed.note ?? "",
    });
  } catch (err) {
    console.error("SDS find-pdf error:", err);
    return NextResponse.json({ error: "SDS search failed — try again, or use the CPID search." }, { status: 502 });
  }
}
