import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  WATCH_TOPICS, fetchTopic, alertRowFrom, defaultSince, type ScanHit,
} from "@/lib/federal-register";

/**
 * Pull newly published federal rules and proposed rules that touch the
 * obligations we track, and file them for review.
 *
 * Runs on the weekly cron or on demand from Employment Law. Never overwrites a
 * reviewed alert: dedupe is by the publisher's own document number.
 */

async function authorize(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return true;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("account_role").eq("user_id", user.id).single();
  return !!data && (ADMIN_ROLES as readonly string[]).includes(data.account_role);
}

interface ScanResult {
  since: string;
  topicsChecked: number;
  documentsMatched: number;
  inserted: number;
  alreadyKnown: number;
  warnings: string[];
}

async function runScan(sinceParam?: string): Promise<ScanResult> {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");

  // Look back to the last thing we filed, with a floor so a long gap doesn't
  // pull years of history in one go.
  const { data: latest } = await admin
    .from("law_alerts")
    .select("publication_date")
    .order("publication_date", { ascending: false })
    .limit(1);
  const lastSeen = latest?.[0]?.publication_date as string | undefined;
  const since = sinceParam ?? (lastSeen && lastSeen > defaultSince(365) ? lastSeen : defaultSince());

  const warnings: string[] = [];
  const hits: ScanHit[] = [];

  for (const topic of WATCH_TOPICS) {
    try {
      const r = await fetchTopic(topic, since);
      if (r.warning) warnings.push(r.warning);
      hits.push(...r.hits);
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : `Failed on "${topic.term}"`);
    }
  }

  if (hits.length === 0) {
    return { since, topicsChecked: WATCH_TOPICS.length, documentsMatched: 0, inserted: 0, alreadyKnown: 0, warnings };
  }

  // Map each hit to the obligation it belongs to, per org.
  const { data: obligations } = await admin
    .from("law_obligations")
    .select("id, org_id, title");
  const { data: orgRows } = await admin.from("organizations").select("id");
  const orgIds = (orgRows ?? []).map((o) => o.id as string);

  const { data: known } = await admin.from("law_alerts").select("org_id, document_number");
  const knownKey = new Set((known ?? []).map((k) => `${k.org_id}:${k.document_number}`));

  const rows: Record<string, unknown>[] = [];
  let alreadyKnown = 0;

  for (const orgId of orgIds) {
    const orgObligations = (obligations ?? []).filter((o) => o.org_id === orgId);
    for (const hit of hits) {
      const key = `${orgId}:${hit.doc.document_number}`;
      if (knownKey.has(key)) { alreadyKnown++; continue; }
      knownKey.add(key); // a document can match two topics — file it once

      const match = orgObligations.find((o) =>
        (o.title as string).toLowerCase().includes(hit.topic.obligationMatch.toLowerCase()));
      rows.push({ ...alertRowFrom(hit, (match?.id as string) ?? null), org_id: orgId });
    }
  }

  if (rows.length === 0) {
    return {
      since, topicsChecked: WATCH_TOPICS.length, documentsMatched: hits.length,
      inserted: 0, alreadyKnown, warnings,
    };
  }

  // Service-role inserts have no auth.uid(), so set_org_id() can't derive the
  // org — org_id is stamped above.
  const { error } = await admin.from("law_alerts").insert(rows);
  if (error) throw new Error(error.message);

  return {
    since, topicsChecked: WATCH_TOPICS.length, documentsMatched: hits.length,
    inserted: rows.length, alreadyKnown, warnings,
  };
}

export async function GET(request: NextRequest) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const since = request.nextUrl.searchParams.get("since") ?? undefined;
  try {
    return NextResponse.json(await runScan(since ?? undefined));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Regulatory scan failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
