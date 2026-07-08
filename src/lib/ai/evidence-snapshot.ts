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
    countRows("documents", (q) => q.ilike("category", "%sop%")),
    countRows("regulatory_sources"),
    countRows("record_versions"),
    countRows("policy_acks"),
    countRows("locations"),
    countRows("credentials"),
    countRows("credentials", (q) => q.lt("expiration_date", new Date().toISOString().slice(0, 10))),
    countRows("sds_records"),
    countRows("osha_records"),
    countRows("emergency_drills"),
    countRows("exclusion_screenings"),
    countRows("controlled_substance_logs"),
  ]);

  const lastBackupDate = (lastBackup?.data as { created_date?: string } | null)?.created_date;

  return `PRACTICE: ${orgName}
LIVE COMPLIANCE-SYSTEM SNAPSHOT (every item is real data already in the app):
- Active employees / workforce: ${employees}
- Locations on file: ${locations}
- Vendors requiring a BAA: ${vendorsReq}; of those, BAAs signed: ${vendorsSigned}; BAAs expired: ${vendorsExpired}
- Provider/staff credentials tracked: ${credentials}; currently expired: ${credExpired}
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
