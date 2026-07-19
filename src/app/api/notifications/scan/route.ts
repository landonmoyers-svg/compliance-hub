import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supersededCredentialIds, type CredClass } from "@/lib/credentials";

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

  // Reminder windows are configurable in Settings → Notifications.
  const { data: settingsRows } = await admin
    .from("organization_settings")
    .select("credential_reminder_days, training_reminder_days, insurance_reminder_days")
    .limit(1);
  const s = settingsRows?.[0];
  const credWindow = s?.credential_reminder_days ?? 30;
  const trainWindow = s?.training_reminder_days ?? 14;
  const insWindow = s?.insurance_reminder_days ?? 60;

  const candidates: NewNote[] = [];

  // Context: only warn about people who still work here. A former employee's
  // expired license or unfinished training is history, not an action item.
  const { data: emps } = await admin.from("employees").select("user_id, first_name, last_name, employment_status");
  const normName = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const activeIds = new Set<string>();
  const nameStatus = new Map<string, boolean>(); // normalized name -> is active
  for (const e of emps ?? []) {
    const active = e.employment_status === "active" || e.employment_status === "on_leave";
    if (e.user_id && active) activeIds.add(e.user_id);
    const n = normName(`${e.first_name} ${e.last_name}`);
    if (n) nameStatus.set(n, nameStatus.get(n) === true ? true : active);
  }
  // Unknown people stay warnable — never silence a warning we can't attribute.
  const personIsActive = (userId: string | null, name: string | null) => {
    if (userId && activeIds.has(userId)) return true;
    const byName = nameStatus.get(normName(name));
    return byName !== false;
  };

  // Credentials expiring within the configured window or expired (active staff only)
  const { data: creds } = await admin.from("credentials").select("id, employee_user_id, employee_name, credential_name, credential_type, credential_class, board_type, credential_number, expiration_date, issue_date, created_date, location_id");
  // Superseded copies (an old license replaced by a current one) are history — a
  // provider with a current license must not get "expired" alerts for the old one.
  const supersededIds = supersededCredentialIds((creds ?? []).map((c) => ({
    id: c.id, employeeUserId: c.employee_user_id, employeeName: c.employee_name,
    credentialName: c.credential_name, credentialType: c.credential_type,
    credentialClass: c.credential_class as CredClass | null, boardType: c.board_type,
    credentialNumber: c.credential_number, expirationDate: c.expiration_date,
    issueDate: c.issue_date, createdDate: c.created_date, locationId: c.location_id,
  })));
  // Clear any existing unread credential alerts that were raised for a copy that
  // is now superseded (the provider has since filed a current replacement).
  if (supersededIds.size > 0) {
    await admin.from("notifications").delete().eq("category", "credential").eq("read", false).in("entity_id", [...supersededIds]);
  }
  for (const c of creds ?? []) {
    if (!personIsActive(c.employee_user_id, c.employee_name)) continue;
    if (supersededIds.has(c.id)) continue;
    const d = daysUntil(c.expiration_date);
    if (d === null) continue;
    if (d < 0) candidates.push({ title: `Credential expired: ${c.credential_name}`, body: `${c.employee_name} ${c.credential_name} expired ${Math.abs(d)} day(s) ago.`, category: "credential", severity: "critical", entity_type: "credentials", entity_id: c.id, link: "/credentials" });
    else if (d <= credWindow) candidates.push({ title: `Credential expiring: ${c.credential_name}`, body: `${c.employee_name} ${c.credential_name} expires in ${d} day(s).`, category: "credential", severity: d <= 7 ? "critical" : "warning", entity_type: "credentials", entity_id: c.id, link: "/credentials" });
  }

  // Training overdue or due within the configured window (active staff only)
  const { data: training } = await admin.from("training_assignments").select("id, assigned_to_user_id, assigned_to_name, module_title, due_date, status");
  for (const t of training ?? []) {
    if (t.status === "completed") continue;
    if (!personIsActive(t.assigned_to_user_id, t.assigned_to_name)) continue;
    const d = daysUntil(t.due_date);
    if (d === null) continue;
    if (d < 0) candidates.push({ title: `Training overdue: ${t.module_title}`, body: `${t.assigned_to_name} is ${Math.abs(d)} day(s) overdue on ${t.module_title}.`, category: "training", severity: "warning", entity_type: "training_assignments", entity_id: t.id, link: "/training" });
    else if (d <= trainWindow) candidates.push({ title: `Training due soon: ${t.module_title}`, body: `${t.assigned_to_name} has ${d} day(s) left on ${t.module_title}.`, category: "training", severity: "info", entity_type: "training_assignments", entity_id: t.id, link: "/training" });
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
    else if (d <= insWindow) candidates.push({ title: `Insurance renewal: ${p.policy_name}`, body: `${p.policy_name} renews in ${d} day(s).`, category: "insurance", severity: d <= 14 ? "critical" : "warning", entity_type: "insurance_policies", entity_id: p.id, link: "/insurance-vault" });
  }

  // Vendor BAA gaps
  const { data: vendors } = await admin.from("vendors").select("id, vendor_name, baa_required, baa_status");
  for (const v of vendors ?? []) {
    if (v.baa_required && v.baa_status !== "signed") candidates.push({ title: `BAA missing: ${v.vendor_name}`, body: `${v.vendor_name} requires a signed BAA (currently ${v.baa_status}).`, category: "vendor", severity: "critical", entity_type: "vendors", entity_id: v.id, link: "/vendor-management" });
  }

  // Provider re-credentialing due within the credential window or overdue (active providers only)
  const { data: enrollments } = await admin.from("payer_enrollments").select("id, provider_user_id, provider_name, payer_name, enrollment_status, recredential_date");
  for (const e of enrollments ?? []) {
    if (e.enrollment_status === "terminated" || e.enrollment_status === "denied") continue;
    if (!personIsActive(e.provider_user_id, e.provider_name)) continue;
    const d = daysUntil(e.recredential_date);
    if (d === null) continue;
    if (d < 0) candidates.push({ title: `Re-credentialing overdue: ${e.payer_name}`, body: `${e.provider_name}'s ${e.payer_name} paneling was due for re-credentialing ${Math.abs(d)} day(s) ago.`, category: "payer", severity: "critical", entity_type: "payer_enrollments", entity_id: e.id, link: "/payer-enrollment" });
    else if (d <= credWindow) candidates.push({ title: `Re-credentialing due: ${e.payer_name}`, body: `${e.provider_name}'s ${e.payer_name} paneling is due for re-credentialing in ${d} day(s).`, category: "payer", severity: d <= 14 ? "critical" : "warning", entity_type: "payer_enrollments", entity_id: e.id, link: "/payer-enrollment" });
  }

  // Payer contract renewals within the insurance window or lapsed
  const { data: payerContracts } = await admin.from("payer_contracts").select("id, payer_name, contract_status, renewal_date");
  for (const c of payerContracts ?? []) {
    if (c.contract_status === "terminated" || c.contract_status === "expired") continue;
    const d = daysUntil(c.renewal_date);
    if (d === null) continue;
    if (d < 0) candidates.push({ title: `Payer contract renewal overdue: ${c.payer_name}`, body: `The ${c.payer_name} contract renewal was due ${Math.abs(d)} day(s) ago.`, category: "payer", severity: "critical", entity_type: "payer_contracts", entity_id: c.id, link: "/payer-enrollment" });
    else if (d <= insWindow) candidates.push({ title: `Payer contract renewal: ${c.payer_name}`, body: `The ${c.payer_name} contract renews in ${d} day(s).`, category: "payer", severity: d <= 14 ? "critical" : "warning", entity_type: "payer_contracts", entity_id: c.id, link: "/payer-enrollment" });
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
