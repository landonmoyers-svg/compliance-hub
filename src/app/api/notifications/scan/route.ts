import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PRIVILEGED = ["owner", "admin", "hr", "clinical_leadership"];

type NewNote = {
  title: string; body?: string; category: string; severity: string;
  entity_type: string; entity_id: string; link: string;
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.length <= 10 ? dateStr + "T00:00:00Z" : dateStr).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((d - Date.now()) / 86_400_000);
}

/** Authorize either a Vercel cron (bearer CRON_SECRET) or a privileged user. */
async function authorize(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return true;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("account_role").eq("user_id", user.id).single();
  return !!data && PRIVILEGED.includes(data.account_role);
}

async function runScan(): Promise<{ created: number }> {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");

  const candidates: NewNote[] = [];

  // Credentials expiring ≤30 days or expired
  const { data: creds } = await admin.from("credentials").select("id, employee_name, credential_name, expiration_date");
  for (const c of creds ?? []) {
    const d = daysUntil(c.expiration_date);
    if (d === null) continue;
    if (d < 0) candidates.push({ title: `Credential expired: ${c.credential_name}`, body: `${c.employee_name}'s ${c.credential_name} expired ${Math.abs(d)} day(s) ago.`, category: "credential", severity: "critical", entity_type: "credentials", entity_id: c.id, link: "/credentials" });
    else if (d <= 30) candidates.push({ title: `Credential expiring: ${c.credential_name}`, body: `${c.employee_name}'s ${c.credential_name} expires in ${d} day(s).`, category: "credential", severity: d <= 7 ? "critical" : "warning", entity_type: "credentials", entity_id: c.id, link: "/credentials" });
  }

  // Training overdue
  const { data: training } = await admin.from("training_assignments").select("id, assigned_to_name, module_title, due_date, status");
  for (const t of training ?? []) {
    if (t.status === "completed") continue;
    const d = daysUntil(t.due_date);
    if (d !== null && d < 0) candidates.push({ title: `Training overdue: ${t.module_title}`, body: `${t.assigned_to_name} is ${Math.abs(d)} day(s) overdue on "${t.module_title}".`, category: "training", severity: "warning", entity_type: "training_assignments", entity_id: t.id, link: "/training" });
  }

  // Documents past review date
  const { data: docs } = await admin.from("documents").select("id, title, review_date, status").eq("status", "active");
  for (const doc of docs ?? []) {
    const d = daysUntil(doc.review_date);
    if (d !== null && d < 0) candidates.push({ title: `Policy review overdue: ${doc.title}`, body: `"${doc.title}" passed its review date ${Math.abs(d)} day(s) ago.`, category: "document", severity: "warning", entity_type: "documents", entity_id: doc.id, link: "/sop-library" });
  }

  // Insurance renewals ≤60 days or expired
  const { data: policies } = await admin.from("insurance_policies").select("id, policy_name, renewal_date");
  for (const p of policies ?? []) {
    const d = daysUntil(p.renewal_date);
    if (d === null) continue;
    if (d < 0) candidates.push({ title: `Insurance lapsed: ${p.policy_name}`, body: `${p.policy_name} renewal was due ${Math.abs(d)} day(s) ago.`, category: "insurance", severity: "critical", entity_type: "insurance_policies", entity_id: p.id, link: "/insurance-vault" });
    else if (d <= 60) candidates.push({ title: `Insurance renewal: ${p.policy_name}`, body: `${p.policy_name} renews in ${d} day(s).`, category: "insurance", severity: d <= 14 ? "critical" : "warning", entity_type: "insurance_policies", entity_id: p.id, link: "/insurance-vault" });
  }

  // Vendor BAA gaps
  const { data: vendors } = await admin.from("vendors").select("id, vendor_name, baa_required, baa_status");
  for (const v of vendors ?? []) {
    if (v.baa_required && v.baa_status !== "signed") candidates.push({ title: `BAA missing: ${v.vendor_name}`, body: `${v.vendor_name} requires a signed BAA (currently ${v.baa_status}).`, category: "vendor", severity: "critical", entity_type: "vendors", entity_id: v.id, link: "/vendor-management" });
  }

  if (candidates.length === 0) return { created: 0 };

  // Dedupe against existing UNREAD notifications for the same entity+category.
  const { data: existing } = await admin.from("notifications").select("entity_id, category").eq("read", false);
  const seen = new Set((existing ?? []).map((e) => `${e.category}:${e.entity_id}`));
  const fresh = candidates.filter((c) => !seen.has(`${c.category}:${c.entity_id}`));
  if (fresh.length === 0) return { created: 0 };

  const { error } = await admin.from("notifications").insert(fresh.map((f) => ({ ...f, read: false })));
  if (error) throw new Error(error.message);
  return { created: fresh.length };
}

export async function GET(request: NextRequest) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runScan();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scan failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
