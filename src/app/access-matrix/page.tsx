"use client";

import { ShieldCheck, Info } from "lucide-react";
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

interface Area { area: string; basis: string; access: Record<RoleKey, Access>; }
const A = (owner: Access, admin: Access, hr: Access, cl: Access, mgr: Access, staff: Access, con: Access, ro: Access): Record<RoleKey, Access> =>
  ({ owner, admin, hr, clinical_leadership: cl, manager: mgr, staff, contractor: con, read_only: ro });

const AREAS: Area[] = [
  { area: "Policies & SOPs", basis: "All workforce must access policies; only admins author them.", access: A("M", "M", "V", "V", "V", "V", "V", "V") },
  { area: "My training & credentials", basis: "Everyone manages their own; self-service.", access: A("O", "O", "O", "O", "O", "O", "O", "O") },
  { area: "All staff training & credentials", basis: "Compliance oversight function.", access: A("M", "M", "M", "M", "V", "-", "-", "V") },
  { area: "Report an incident", basis: "Anyone must be able to report a concern.", access: A("M", "M", "M", "M", "M", "M", "M", "-") },
  { area: "Incident investigation & CAPA", basis: "Compliance-managed.", access: A("M", "M", "M", "M", "-", "-", "-", "V") },
  { area: "HR files / Employee Vault", basis: "Minimum necessary — HR + ownership only.", access: A("M", "V", "M", "-", "-", "-", "-", "-") },
  { area: "Payroll", basis: "Financial-sensitive — owner/HR only.", access: A("M", "-", "M", "-", "-", "-", "-", "-") },
  { area: "Performance & disciplinary", basis: "HR + the person's manager (own team).", access: A("M", "V", "M", "-", "V", "-", "-", "-") },
  { area: "HIPAA / Risk / Breach / SRA", basis: "Security & privacy oversight.", access: A("M", "M", "V", "M", "-", "-", "-", "V") },
  { area: "Controlled substances log", basis: "DEA — clinical leadership + admin.", access: A("M", "M", "-", "M", "-", "-", "-", "V") },
  { area: "Exclusion screening", basis: "Screen before hire / monthly — HR + admin.", access: A("M", "M", "M", "-", "-", "-", "-", "V") },
  { area: "Vendors / BAAs / Insurance", basis: "Business & contract management.", access: A("M", "M", "V", "-", "-", "-", "-", "V") },
  { area: "Inventory / SDS / OSHA", basis: "Operational safety — broad view, admin manage.", access: A("M", "M", "V", "V", "V", "V", "-", "V") },
  { area: "Audit trail", basis: "Tamper-evidence — leadership review only.", access: A("V", "V", "-", "-", "-", "-", "-", "-") },
  { area: "Org chart & role requirements", basis: "HR/leadership define; staff view.", access: A("M", "M", "M", "V", "V", "V", "-", "V") },
  { area: "User management & Settings", basis: "System administration.", access: A("M", "M", "-", "-", "-", "-", "-", "-") },
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
      <PageHeader title="Role Access Matrix" description="Who can see and do what, by role — mapped to the HIPAA minimum-necessary principle and compliance best practice." />

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex gap-3 py-4">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">How access is enforced</p>
            <p className="text-muted-foreground">Sensitive data (payroll, HR files, disciplinary, performance, risk, controlled substances, audit log, screenings) is protected server-side by database row-level security. Those tables are currently gated to the <span className="font-medium text-foreground">privileged roles — Owner, Admin, HR, and Clinical Leadership</span> — so the enforced boundary matches the “Manage/View” rows below for those roles. This matrix is the documented policy; a few rows below (e.g. Payroll = Owner/HR only) are intentionally <span className="font-medium text-foreground">stricter than the current technical enforcement</span> and are the recommended next tightening.</p>
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
                      <div className="font-medium">{row.area}</div>
                      <div className="text-xs text-muted-foreground">{row.basis}</div>
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
