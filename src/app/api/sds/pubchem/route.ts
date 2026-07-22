import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Look up a substance in PubChem (NIH's authoritative chemical database — free,
 * no key) by product name or CAS number, and return its real GHS classification:
 * signal word, hazard (H) statements, and CAS. This is a KNOWN-DATABASE import,
 * not an AI guess. Best matched for chemicals/CAS numbers; many branded consumer
 * products aren't in PubChem — in that case we return notFound so the UI can fall
 * back to the AI lookup.
 */

const PUG = "https://pubchem.ncbi.nlm.nih.gov/rest";

async function firstCid(query: string): Promise<number | null> {
  const url = `${PUG}/pug/compound/name/${encodeURIComponent(query)}/cids/JSON`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const json = await res.json() as { IdentifierList?: { CID?: number[] } };
  return json.IdentifierList?.CID?.[0] ?? null;
}

/** Recursively collect PUG-View { Name, Value } information nodes. */
function collectInfo(node: unknown, acc: { Name?: string; Value?: unknown }[]): void {
  if (Array.isArray(node)) { for (const n of node) collectInfo(n, acc); return; }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.Name === "string" && "Value" in o) acc.push(o as { Name?: string; Value?: unknown });
    for (const k of Object.keys(o)) collectInfo(o[k], acc);
  }
}

function valueStrings(value: unknown): string[] {
  const v = value as { StringWithMarkup?: { String?: string }[] } | undefined;
  return (v?.StringWithMarkup ?? []).map((s) => s.String ?? "").filter(Boolean);
}

function normalizeSignal(s: string): "DANGER" | "WARNING" | "CAUTION" | "NONE" {
  const u = s.toUpperCase();
  if (u.includes("DANGER")) return "DANGER";
  if (u.includes("WARNING")) return "WARNING";
  if (u.includes("CAUTION")) return "CAUTION";
  return "NONE";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query } = await request.json() as { query?: string };
  if (!query?.trim()) return NextResponse.json({ error: "Enter a product name or CAS number." }, { status: 400 });
  const q = query.trim();
  const isCas = /^\d{2,7}-\d{2}-\d$/.test(q);

  try {
    const cid = await firstCid(q);
    if (!cid) return NextResponse.json({ notFound: true, message: "Not found in PubChem — try the exact chemical name or CAS number, or use AI lookup." });

    const ghsRes = await fetch(`${PUG}/pug_view/data/compound/${cid}/JSON?heading=GHS+Classification`, { headers: { Accept: "application/json" } });
    let signalWord: "DANGER" | "WARNING" | "CAUTION" | "NONE" = "NONE";
    let hazardStatements = "";
    if (ghsRes.ok) {
      const info: { Name?: string; Value?: unknown }[] = [];
      collectInfo(await ghsRes.json(), info);
      for (const i of info) {
        if (i.Name === "Signal") { const s = valueStrings(i.Value)[0]; if (s) signalWord = normalizeSignal(s); }
        if (i.Name && /hazard statement/i.test(i.Name)) {
          const hs = valueStrings(i.Value).filter((s) => /^H\d{3}/.test(s.trim()));
          if (hs.length) hazardStatements = hs.join("\n");
        }
      }
    }

    return NextResponse.json({
      source: "PubChem",
      pubchemCid: cid,
      pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
      casNumber: isCas ? q : "",
      signalWord,
      hazardStatements,
      hazardSummary: hazardStatements ? "GHS classification imported from PubChem — verify against the manufacturer's SDS." : "",
    });
  } catch {
    return NextResponse.json({ error: "PubChem lookup failed — try again, or use AI lookup." }, { status: 502 });
  }
}
