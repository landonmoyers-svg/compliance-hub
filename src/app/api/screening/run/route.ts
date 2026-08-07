import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Automated exclusion screening against the OIG-LEIE (free, no key) and — when a
// SAM_API_KEY is configured — SAM.gov. We only ever DOWNLOAD public lists and
// match names locally; nothing is written here. The page records the results
// (clears auto-recorded; potential name matches flagged for human review, since
// name collisions are common — we never auto-assert an exclusion).

export const maxDuration = 60;

const LEIE_URL = "https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface LeieRow {
  lastName: string; firstName: string; busName: string;
  general: string; specialty: string; npi: string;
  exclType: string; exclDate: string; city: string; state: string;
}
interface LeieIndex {
  at: number;
  byPerson: Map<string, LeieRow[]>;   // "LAST|FIRST" -> rows
  businesses: { name: string; row: LeieRow }[];
  byNpi: Map<string, LeieRow>;
  count: number;
}

let LEIE_CACHE: LeieIndex | null = null;

const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Minimal RFC-4180-ish CSV line parser (handles quoted fields with commas). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function getLeie(): Promise<LeieIndex> {
  if (LEIE_CACHE && Date.now() - LEIE_CACHE.at < CACHE_TTL_MS) return LEIE_CACHE;
  const res = await fetch(LEIE_URL, { headers: { "user-agent": "compliance-hub-screening" } });
  if (!res.ok) throw new Error(`LEIE download failed (${res.status})`);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const cLast = col("LASTNAME"), cFirst = col("FIRSTNAME"), cBus = col("BUSNAME"),
    cGen = col("GENERAL"), cSpec = col("SPECIALTY"), cNpi = col("NPI"),
    cType = col("EXCLTYPE"), cDate = col("EXCLDATE"), cCity = col("CITY"), cState = col("STATE");

  const byPerson = new Map<string, LeieRow[]>();
  const businesses: { name: string; row: LeieRow }[] = [];
  const byNpi = new Map<string, LeieRow>();
  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = parseCsvLine(lines[i]);
    const row: LeieRow = {
      lastName: f[cLast] ?? "", firstName: f[cFirst] ?? "", busName: f[cBus] ?? "",
      general: f[cGen] ?? "", specialty: f[cSpec] ?? "", npi: f[cNpi] ?? "",
      exclType: f[cType] ?? "", exclDate: f[cDate] ?? "", city: f[cCity] ?? "", state: f[cState] ?? "",
    };
    count++;
    const bn = norm(row.busName);
    if (bn) businesses.push({ name: bn, row });
    const ln = norm(row.lastName), fn = norm(row.firstName);
    if (ln) {
      const key = `${ln}|${fn}`;
      const arr = byPerson.get(key); if (arr) arr.push(row); else byPerson.set(key, [row]);
    }
    if (row.npi && /^\d+$/.test(row.npi) && Number(row.npi) > 0) byNpi.set(row.npi, row);
  }
  LEIE_CACHE = { at: Date.now(), byPerson, businesses, byNpi, count };
  return LEIE_CACHE;
}

interface Subject { key: string; type: "staff" | "vendor" | "other"; name: string; firstName?: string; lastName?: string; npi?: string; }
interface MatchHit { source: "OIG-LEIE" | "SAM.gov"; name: string; detail: string; }

function matchLeie(idx: LeieIndex, s: Subject): MatchHit[] {
  const hits: MatchHit[] = [];
  const push = (r: LeieRow) => {
    const who = r.busName || `${r.lastName}, ${r.firstName}`.trim();
    const bits = [r.general || r.specialty, r.exclType ? `§${r.exclType}` : "", r.exclDate ? `excl ${r.exclDate}` : "", [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean);
    hits.push({ source: "OIG-LEIE", name: who, detail: bits.join(" · ") });
  };
  if (s.npi && /^\d+$/.test(s.npi) && Number(s.npi) > 0) {
    const r = idx.byNpi.get(s.npi); if (r) push(r);
  }
  if (s.type === "vendor" || s.type === "other") {
    const n = norm(s.name);
    if (n) for (const b of idx.businesses) if (b.name === n || b.name.includes(n) || n.includes(b.name)) push(b.row);
  }
  // Person match by last+first (derive from explicit fields, else split the name).
  let last = norm(s.lastName ?? ""), first = norm(s.firstName ?? "");
  if (!last && s.name) { const parts = s.name.trim().split(/\s+/); if (parts.length >= 2) { first = norm(parts[0]); last = norm(parts[parts.length - 1]); } }
  if (last) for (const r of idx.byPerson.get(`${last}|${first}`) ?? []) push(r);
  // de-dupe
  const seen = new Set<string>();
  return hits.filter((h) => { const k = `${h.source}:${h.name}:${h.detail}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

async function matchSam(key: string, s: Subject): Promise<{ checked: boolean; hits: MatchHit[] }> {
  try {
    const url = new URL("https://api.sam.gov/entity-information/v4/entities");
    url.searchParams.set("api_key", key);
    url.searchParams.set("includeSections", "exclusions");
    url.searchParams.set("exclusionName", s.name);
    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok) return { checked: false, hits: [] };
    const data = await res.json() as { excludedEntity?: { exclusionName?: string; classificationType?: string; exclusionType?: string; activationDate?: string }[] };
    const hits: MatchHit[] = (data.excludedEntity ?? []).map((e) => ({
      source: "SAM.gov", name: e.exclusionName ?? s.name,
      detail: [e.exclusionType || e.classificationType, e.activationDate ? `active ${e.activationDate}` : ""].filter(Boolean).join(" · "),
    }));
    return { checked: true, hits };
  } catch {
    return { checked: false, hits: [] };
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subjects } = await request.json() as { subjects: Subject[] };
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return NextResponse.json({ error: "No subjects to screen." }, { status: 400 });
  }
  if (subjects.length > 500) return NextResponse.json({ error: "Too many subjects in one run (max 500)." }, { status: 400 });

  let idx: LeieIndex;
  try { idx = await getLeie(); }
  catch { return NextResponse.json({ error: "Couldn't download the OIG-LEIE list right now. Try again shortly." }, { status: 502 }); }

  const samKey = process.env.SAM_API_KEY;
  const results = [];
  for (const s of subjects) {
    const leie = matchLeie(idx, s);
    const sam = samKey ? await matchSam(samKey, s) : { checked: false, hits: [] };
    results.push({
      key: s.key,
      hits: [...leie, ...sam.hits],
      samChecked: sam.checked,
      clear: leie.length === 0 && sam.hits.length === 0,
    });
  }

  return NextResponse.json({
    results,
    leieCount: idx.count,
    samEnabled: !!samKey,
    screenedDate: new Date().toISOString().slice(0, 10),
  });
}
