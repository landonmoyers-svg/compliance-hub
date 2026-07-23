import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrgName } from "@/lib/org-server";

/**
 * Builds a plain-text snapshot of the practice's OWN live compliance data,
 * scoped by the caller's RLS (the route passes its per-user Supabase client).
 * Shared by the AI-prefill routes (SRA, audits, …) so every module cites the
 * same real evidence. Returns a human-readable block for the model prompt.
 */
export async function buildComplianceSnapshot(supabase: SupabaseClient): Promise<string> {
  const countRows = async (table: string, filter?: (q: ReturnType<ReturnType<typeof supabase.from>["select"]>) => typeof q): Promise<number> => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count } = await q;
    return count ?? 0;
  };

  const [
    orgName, employees, vendorsReq, vendorsSigned, vendorsExpired,
    trainingModules, trainingAssigned, trainingDone,
    backups, lastBackup, auditLogs, incidents, breachAssess,
    documents, sops, regSources, recordVersions, policyAcks, locations,
    credentials, credExpired, sds, oshaRecords, drills, exclusionScreenings, csLogs,
  ] = await Promise.all([
    getOrgName(supabase),
    countRows("employees", (q) => q.eq("employment_status", "active")),
    countRows("vendors", (q) => q.eq("baa_required", true)),
    countRows("vendors", (q) => q.eq("baa_required", true).eq("baa_status", "signed")),
    countRows("vendors", (q) => q.eq("baa_status", "expired")),
    countRows("training_modules"),
    countRows("training_assignments"),
    countRows("training_assignments", (q) => q.not("completed_at", "is", null)),
    countRows("backups"),
    supabase.from("backups").select("created_date").order("created_date", { ascending: false }).limit(1).maybeSingle(),
    countRows("audit_logs"),
    countRows("incidents"),
    countRows("breach_assessments"),
    countRows("documents"),
    // "Categorized" = documents assigned a compliance area. (The documents table
    // has no `category` column — that filter errored and always counted 0.)
    countRows("documents", (q) => q.not("compliance_area", "is", null)),
    countRows("regulatory_sources"),
    countRows("record_versions"),
    countRows("policy_acks"),
    countRows("locations"),
    countRows("credentials"),
    // Expired creds: fetch holder fields so we can exclude former staff below.
    supabase.from("credentials").select("employee_user_id, employee_name").lt("expiration_date", new Date().toISOString().slice(0, 10)),
    countRows("sds_records"),
    countRows("osha_records"),
    countRows("emergency_drills"),
    countRows("exclusion_screenings"),
    countRows("controlled_substance_logs"),
  ]);

  const lastBackupDate = (lastBackup?.data as { created_date?: string } | null)?.created_date;

  // Context: only count expired credentials whose holder still works here.
  const { data: empRows } = await supabase.from("employees").select("user_id, first_name, last_name, employment_status");
  const normName = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const activeIds = new Set<string>();
  const nameActive = new Map<string, boolean>();
  for (const e of empRows ?? []) {
    const active = e.employment_status === "active" || e.employment_status === "on_leave";
    if (e.user_id && active) activeIds.add(e.user_id);
    const n = normName(`${e.first_name} ${e.last_name}`);
    if (n) nameActive.set(n, nameActive.get(n) === true ? true : active);
  }
  const expiredRows = (credExpired?.data ?? []) as { employee_user_id: string | null; employee_name: string | null }[];
  const credExpiredActive = expiredRows.filter((c) => {
    if (c.employee_user_id && activeIds.has(c.employee_user_id)) return true;
    return nameActive.get(normName(c.employee_name)) !== false;
  }).length;

  return `PRACTICE: ${orgName}
LIVE COMPLIANCE-SYSTEM SNAPSHOT (every item is real data already in the app):
- Active employees / workforce: ${employees}
- Locations on file: ${locations}
- Vendors requiring a BAA: ${vendorsReq}; of those, BAAs signed: ${vendorsSigned}; BAAs expired: ${vendorsExpired}
- Provider/staff credentials tracked: ${credentials}; currently expired (current staff only): ${credExpiredActive}
- Training modules available: ${trainingModules}; training assignments: ${trainingAssigned}; completed: ${trainingDone}
- Offsite backups recorded: ${backups}${lastBackupDate ? ` (most recent ${lastBackupDate.slice(0, 10)})` : " (none yet)"}
- Audit-log entries captured (system logs every data change): ${auditLogs}
- Incidents logged: ${incidents}; HIPAA breach four-factor assessments run: ${breachAssess}
- Exclusion/sanction screenings recorded (OIG-LEIE/SAM): ${exclusionScreenings}
- Controlled-substance log entries: ${csLogs}
- Safety Data Sheets on file: ${sds}; OSHA records: ${oshaRecords}; emergency drills logged: ${drills}
- Policy/SOP documents stored: ${documents} (categorized SOPs: ${sops})
- Regulatory sources tracked: ${regSources}
- Retained record versions (6-year retention evidence): ${recordVersions}
- Policy acknowledgements captured: ${policyAcks}
Notes: The app itself enforces unique per-user logins with row-level security, encrypts data in transit (HTTPS/TLS) and at rest (managed Postgres), and keeps a tamper-resistant audit trail. Physical safeguards (locks, screens, device disposal) and endpoint controls (anti-malware, patching, MFA) live outside this system — treat them as unverified unless a document or note evidences them.`;
}
