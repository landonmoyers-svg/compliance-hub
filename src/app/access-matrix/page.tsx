"use client";

import { ShieldCheck, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Documented, best-practice access policy (minimum-necessary). This is the
// reference matrix; server-side enforcement is via Supabase RLS + is_privileged()
// (owner/admin/hr/clinical_leadership) on sensitive tables — see the note below.
type Access = "M" | "V" | "O" | "-";
const ROLES = [
  { key: "owner", label: "Owner" },
  { key: "admin", label: "Admin" },
  { key: "hr", label: "HR" },
  { key: "clinical_leadership", label: "Clinical Ldr" },
  { key: "manager", label: "Manager" },
  { key: "staff", label: "Staff" },
  { key: "contractor", label: "Contractor" },
  { key: "read_only", label: "Read-only" },
] as const;
type RoleKey = typeof ROLES[number]["key"];

// `gap` = the documented policy in this row is FINER than the row-level security
// actually enforces (RLS gates most sensitive tables at a single "privileged"
// tier = owner/admin/hr/clinical_leadership). Set it where enforcement is looser
// than policy, so the row is visibly flagged as "policy, not yet enforced."
interface Area { area: string; basis: string; access: Record<RoleKey, Access>; gap?: string; }
const A = (owner: Access, admin: Access, hr: Access, cl: Access, mgr: Access, staff: Access, con: Access, ro: Access): Record<RoleKey, Access> =>
  ({ owner, admin, hr, clinical_leadership: cl, manager: mgr, staff, contractor: con, read_only: ro });

const AREAS: Area[] = [
  { area: "Policies & SOPs", basis: "All workforce must access policies; only admins author them.", access: A("M", "M", "V", "V", "V", "V", "V", "V") },
  { area: "My training & credentials", basis: "Everyone manages their own; self-service.", access: A("O", "O", "O", "O", "O", "O", "O", "O") },
  { area: "All staff training & credentials", basis: "Compliance oversight function.", access: A("M", "M", "M", "M", "V", "-", "-", "V") },
  { area: "Report an incident", basis: "Anyone must be able to report a concern.", access: A("M", "M", "M", "M", "M", "M", "M", "-") },
  { area: "Incident investigation & CAPA", basis: "Compliance-managed.", access: A("M", "M", "M", "M", "-", "-", "-", "V") },
  { area: "HR files / Employee Vault", basis: "Minimum necessary — HR + ownership only.", access: A("M", "V", "M", "-", "-", "-", "-", "-"), gap: "Sensitive/medical docs are correctly gated (HR/admin/owner + per-user grant); but Clinical Leadership can still view non-sensitive employee documents." },
  { area: "Payroll", basis: "Financial-sensitive — owner/HR only.", access: A("M", "-", "M", "-", "-", "-", "-", "-"), gap: "RLS grants every privileged role — Admin and Clinical Leadership can read/write payroll, not just Owner/HR." },
  { area: "Performance & disciplinary", basis: "HR + the person's manager (own team).", access: A("M", "V", "M", "-", "V", "-", "-", "-"), gap: "RLS grants all privileged roles, so Clinical Leadership has access; and a Manager's own-team view is not enforced (managers get none)." },
  { area: "HIPAA / Risk / Breach / SRA", basis: "Security & privacy oversight.", access: A("M", "M", "V", "M", "-", "-", "-", "V") },
  { area: "Controlled substances log", basis: "DEA — clinical leadership + admin.", access: A("M", "M", "-", "M", "-", "-", "-", "V"), gap: "RLS grants all privileged roles, so HR can access the controlled-substance log even though policy excludes HR." },
  { area: "Exclusion screening", basis: "Screen before hire / monthly — HR + admin.", access: A("M", "M", "M", "-", "-", "-", "-", "V"), gap: "RLS grants all privileged roles, so Clinical Leadership has access even though policy excludes it." },
  { area: "Vendors / BAAs / Insurance", basis: "Business & contract management.", access: A("M", "M", "V", "-", "-", "-", "-", "V") },
  { area: "Inventory / SDS / OSHA", basis: "Operational safety — broad view, admin manage.", access: A("M", "M", "V", "V", "V", "V", "-", "V") },
  { area: "Audit trail", basis: "Tamper-evidence — leadership review only.", access: A("V", "V", "-", "-", "-", "-", "-", "-"), gap: "The activity/audit log is readable by every privileged role, so HR and Clinical Leadership can view it even though policy limits it to Owner/Admin." },
  { area: "Org chart & role requirements", basis: "HR/leadership define; staff view.", access: A("M", "M", "M", "V", "V", "V", "-", "V") },
  { area: "User management & Settings", basis: "System administration.", access: A("M", "M", "-", "-", "-", "-", "-", "-"), gap: "RLS lets every privileged role write profiles and org settings, so HR and Clinical Leadership can change roles/settings even though policy limits this to Owner/Admin." },
  { area: "Chief of Staff / Exec dashboards", basis: "Program leadership cockpit.", access: A("M", "M", "V", "V", "-", "-", "-", "V") },
];

const CELL: Record<Access, { label: string; cls: string }> = {
  M: { label: "Manage", cls: "bg-success/15 text-success" },
  V: { label: "View", cls: "bg-warning/15 text-warning" },
  O: { label: "Own", cls: "bg-primary/10 text-primary" },
  "-": { label: "—", cls: "text-muted-foreground/50" },
};

export default function AccessMatrixPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Role Permissions" description="Who can see and do what, by role — mapped to the HIPAA minimum-necessary principle and compliance best practice." />

      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="flex gap-3 py-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Rows marked ⚠ are documented policy the database doesn&apos;t yet enforce at this granularity</p>
            <p className="text-muted-foreground">Row-level security gates sensitive tables at a single &ldquo;privileged&rdquo; tier — Owner, Admin, HR, and Clinical Leadership. Rows whose policy is finer than that (e.g. Payroll = Owner/HR only) are enforced only at the coarse tier, so an extra privileged role can currently reach them. Each such row is flagged below with the specific gap.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4 text-primary" /> Access by role</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 font-medium">Data / module</th>
                  {ROLES.map((r) => <th key={r.key} className="px-2 pb-2 text-center text-xs font-medium">{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {AREAS.map((row) => (
                  <tr key={row.area} className="border-b border-border/50 align-top">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1.5 font-medium">{row.area}{row.gap && <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-label="Not fully enforced" />}</div>
                      <div className="text-xs text-muted-foreground">{row.basis}</div>
                      {row.gap && <div className="mt-1 text-xs text-warning">Not fully enforced — {row.gap}</div>}
                    </td>
                    {ROLES.map((r) => {
                      const a = row.access[r.key];
                      return <td key={r.key} className="px-1.5 py-2.5 text-center"><span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${CELL[a].cls}`}>{CELL[a].label}</span></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span><span className="mr-1 rounded bg-success/15 px-1.5 py-0.5 font-medium text-success">Manage</span> create/edit</span>
            <span><span className="mr-1 rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning">View</span> read-only</span>
            <span><span className="mr-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">Own</span> only their own records</span>
            <span><span className="mr-1 text-muted-foreground/50">—</span> no access</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
