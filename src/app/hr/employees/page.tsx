"use client";

import { Fragment, useState, useMemo } from "react";
import { Users, Plus, Search, X, FolderOpen, AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { PersonRecordsPanel } from "@/components/shared/person-records-panel";
import { DuplicateFinder, dupNorm } from "@/components/shared/duplicate-finder";
import { formatDate, dateInputToISO } from "@/lib/dates";
import { provisionLogin } from "@/lib/admin";
import { formatName, humanizeLabel } from "@/lib/format";
import { roleLabel } from "@/lib/auth/roles";
import { accountRoles } from "@/lib/data/schema";
import type { Employee } from "@/lib/data/schema";
import { toast } from "sonner";

const STATUS_VARIANT = {
  active: "success",
  on_leave: "warning",
  terminated: "destructive",
  resigned: "secondary",
  laid_off: "secondary",
} as const;

const DEPARTMENTS = [
  "clinical",
  "administrative",
  "billing",
  "hr",
  "management",
  "it",
  "other",
] as const;

/* ----------------------------- dialog ------------------------------- */

interface EmployeeForm {
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  jobRole: string;
  department: string;
  employmentStatus: Employee["employmentStatus"];
  workerType: Employee["workerType"];
  hireDate: string;
  inviteToApp: boolean;
  accountRole: string;
}

const EMPTY: EmployeeForm = {
  firstName: "",
  lastName: "",
  email: "",
  title: "",
  jobRole: "",
  department: "",
  employmentStatus: "active",
  workerType: "employee",
  hireDate: "",
  inviteToApp: false,
  accountRole: "staff",
};

function EmployeeDialog({
  initial,
  roles,
  onClose,
  onSave,
  saving,
}: {
  initial?: Employee;
  /** Canonical job-role list (Org Chart source of truth). */
  roles: string[];
  onClose: () => void;
  onSave: (data: EmployeeForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<EmployeeForm>(
    initial
      ? {
          firstName: initial.firstName,
          lastName: initial.lastName,
          email: initial.email,
          title: initial.title ?? "",
          jobRole: initial.jobRole ?? "",
          department: initial.department ?? "",
          employmentStatus: initial.employmentStatus,
          workerType: initial.workerType ?? "employee",
          hireDate: initial.hireDate ?? "",
          inviteToApp: false,
          accountRole: "staff",
        }
      : EMPTY,
  );
  // Job role sourced from the canonical list; "＋ Add new role…" reveals a text input.
  const [addingRole, setAddingRole] = useState(false);

  const set =
    (k: keyof EmployeeForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const emailValid = form.email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const canSave =
    form.firstName.trim() &&
    form.lastName.trim() &&
    emailValid &&
    // Email is only required when we're creating a login to invite them.
    (!form.inviteToApp || form.email.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit employee" : "Add employee"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">First name *</label>
            <input className="input w-full" value={form.firstName} onChange={set("firstName")} placeholder="First name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Last name *</label>
            <input className="input w-full" value={form.lastName} onChange={set("lastName")} placeholder="Last name" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Email</label>
            <input type="email" className="input w-full" value={form.email} onChange={set("email")} placeholder="work@example.com (optional)" />
            {!emailValid && <p className="text-xs text-destructive">Enter a valid email address.</p>}
            <p className="text-xs text-muted-foreground">Optional — leave blank for a former or contract worker with no login. Required only to invite them to the app.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title (display)</label>
            <input className="input w-full" value={form.title} onChange={set("title")} placeholder="e.g. Registered Nurse" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Job role</label>
            {addingRole ? (
              <div className="flex gap-2">
                <input className="input w-full" autoFocus value={form.jobRole} onChange={set("jobRole")} placeholder="New role name" />
                <Button type="button" variant="outline" size="sm" onClick={() => setAddingRole(false)}>Done</Button>
              </div>
            ) : (
              <select className="input w-full" value={form.jobRole} onChange={(e) => { if (e.target.value === "__add__") { setForm((p) => ({ ...p, jobRole: "" })); setAddingRole(true); } else set("jobRole")(e); }}>
                <option value="">— None —</option>
                {form.jobRole && !roles.includes(form.jobRole) && <option value={form.jobRole}>{form.jobRole}</option>}
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value="__add__">＋ Add new role…</option>
              </select>
            )}
            <p className="text-xs text-muted-foreground">Drives this person&apos;s required competencies (Org Chart / Competency matrix). Shared role list.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Department</label>
            <select className="input w-full" value={form.department} onChange={set("department")}>
              <option value="">— None —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{humanizeLabel(d)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Worker type</label>
              <select className="input w-full" value={form.workerType} onChange={set("workerType")}>
                <option value="employee">Employee (W‑2)</option>
                <option value="contractor">Contractor (1099)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Employment status</label>
              <select className="input w-full" value={form.employmentStatus} onChange={set("employmentStatus")}>
                <option value="active">Active</option>
                <option value="on_leave">On leave</option>
                <option value="terminated">Terminated</option>
                <option value="resigned">Resigned</option>
                <option value="laid_off">Laid off</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Hire date</label>
            <input type="date" className="input w-full" value={form.hireDate} onChange={set("hireDate")} />
          </div>

          {/* Provision a real login — only when adding a new employee */}
          {!initial && (
            <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4 sm:col-span-2">
              {!form.email.trim() && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>No email entered — this person won’t be invited to the app and can’t sign in. That’s fine for a former or contract worker; add an email later to invite them.</span>
                </div>
              )}
              <label className={cn("flex items-center gap-2 text-sm font-medium", !form.email.trim() && "opacity-60")}>
                <input type="checkbox" checked={form.inviteToApp} disabled={!form.email.trim()} onChange={(e) => setForm((p) => ({ ...p, inviteToApp: e.target.checked }))} className="size-4" />
                Create a login and invite this employee to the app
              </label>
              {form.inviteToApp && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Account role</label>
                  <select className="input w-full" value={form.accountRole} onChange={set("accountRole")}>
                    {accountRoles.filter((r) => r !== "inactive").map((r) => (
                      <option key={r} value={r}>{roleLabel(r)}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Sends an email invitation to set a password. Creates the Supabase auth account and a linked profile.</p>
                </div>
              )}
            </div>
          )}
          {initial?.userId && (
            <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-xs text-success sm:col-span-2">
              This employee has an app login linked to their profile.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!canSave || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function EmployeesPage() {
  const { data, isLoading, isError, refetch } = useCollection("employees");
  const reqsQ = useCollection("roleRequirements");
  const createMut = useCreate("employees");
  const updateMut = useUpdate("employees");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Employee["employmentStatus"] | "all">("all");
  const [editing, setEditing] = useState<Employee | null | "new">(null);
  const [viewingRecords, setViewingRecords] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const employees = useMemo(() => data ?? [], [data]);
  // CC-6: canonical job-role list = the same source the Org Chart uses
  // (employee job roles ∪ role-requirement roles), so roles stay unified.
  const roles = useMemo(
    () => Array.from(new Set([
      ...employees.map((e) => e.jobRole).filter(Boolean) as string[],
      ...(reqsQ.data ?? []).map((r) => r.jobRole),
    ])).sort(),
    [employees, reqsQ.data],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) => {
      if (filterStatus !== "all" && e.employmentStatus !== filterStatus) return false;
      const name = `${e.firstName} ${e.lastName}`.toLowerCase();
      if (q && !name.includes(q) && !e.email.toLowerCase().includes(q) && !(e.title ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, search, filterStatus]);

  const { sorted, sort, toggle } = useSort(filtered, {
    name: (e) => `${e.firstName} ${e.lastName}`,
    email: (e) => e.email,
    title: (e) => e.title,
    department: (e) => e.department,
    hireDate: (e) => e.hireDate,
    status: (e) => e.employmentStatus,
  }, { key: "name", dir: "asc" });

  // Current staff (active / on leave) list first, alphabetical; former staff go
  // into a collapsed section at the end. When a specific status filter is on,
  // fall back to a single flat list.
  const isCurrent = (e: Employee) => e.employmentStatus === "active" || e.employmentStatus === "on_leave";
  const currentRows = sorted.filter(isCurrent);
  const pastRows = sorted.filter((e) => !isCurrent(e));

  const renderRow = (e: Employee) => (
    <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
      <td data-label="Name" className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
            {e.firstName.charAt(0)}{e.lastName.charAt(0)}
          </div>
          <span className="font-medium">{e.firstName} {e.lastName}</span>
          {e.workerType === "contractor" && <Badge variant="outline" className="border-primary/40 text-primary">Contractor</Badge>}
        </div>
      </td>
      <td data-label="Email" className="py-3 pr-4 text-muted-foreground">{e.email || "—"}</td>
      <td data-label="Title" className="py-3 pr-4">{e.title ?? "—"}</td>
      <td data-label="Department" className="py-3 pr-4 capitalize">{e.department ? humanizeLabel(e.department) : "—"}</td>
      <td data-label="Hire date" className="py-3 pr-4">{e.hireDate ? formatDate(e.hireDate) : "—"}</td>
      <td data-label="Status" className="py-3 pr-4">
        <Badge variant={STATUS_VARIANT[e.employmentStatus]}>{humanizeLabel(e.employmentStatus)}</Badge>
      </td>
      <td data-label="" className="py-3">
        <div className="flex gap-1 md:justify-end">
          <Button size="sm" variant="ghost" onClick={() => setViewingRecords(e)}><FolderOpen className="size-3.5" /> Records</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Edit</Button>
        </div>
      </td>
    </tr>
  );

  const stats = useMemo(() => ({
    active: employees.filter((e) => e.employmentStatus === "active").length,
    onLeave: employees.filter((e) => e.employmentStatus === "on_leave").length,
    inactive: employees.filter((e) => e.employmentStatus !== "active" && e.employmentStatus !== "on_leave").length,
  }), [employees]);

  async function handleSave(form: EmployeeForm) {
    setSaving(true);
    try {
      const payload = {
        firstName: formatName(form.firstName),
        lastName: formatName(form.lastName),
        email: form.email.trim().toLowerCase(),
        title: form.title.trim() || undefined,
        jobRole: form.jobRole.trim() || null,
        department: (form.department as Employee["department"]) || undefined,
        employmentStatus: form.employmentStatus,
        workerType: form.workerType,
        hireDate: form.hireDate ? dateInputToISO(form.hireDate) : undefined,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Employee updated");
      } else {
        const created = await createMut.mutateAsync(payload);
        if (form.inviteToApp) {
          const result = await provisionLogin({
            email: payload.email,
            fullName: `${payload.firstName} ${payload.lastName}`,
            accountRole: form.accountRole,
            staffRole: payload.title,
            department: form.department || undefined,
          });
          if (result.ok) {
            // Link the new employee record to its auth login.
            if (result.userId) await updateMut.mutateAsync({ id: created.id, patch: { userId: result.userId } });
            toast.success("Employee added and invited — they will get an email to set a password.");
          } else {
            toast.error(`Employee added, but the login could not be created: ${result.error}`);
          }
        } else {
          toast.success("Employee added");
        }
      }
      setEditing(null);
      void refetch();
    } catch {
      toast.error("Failed to save employee");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Employees" />
        <ErrorState message="We couldn't load employees." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <EmployeeDialog
          initial={editing === "new" ? undefined : editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {viewingRecords && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setViewingRecords(null)}>
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold">{viewingRecords.firstName} {viewingRecords.lastName}</h2>
                <p className="text-xs text-muted-foreground">{viewingRecords.email ? `${viewingRecords.email} · ` : ""}all linked compliance records</p>
              </div>
              <button onClick={() => setViewingRecords(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="overflow-y-auto p-5">
              <PersonRecordsPanel userId={viewingRecords.userId ?? null} name={`${viewingRecords.firstName} ${viewingRecords.lastName}`} />
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Employees"
        description="Searchable employee directory with employment status and department information."
        actions={
          <div className="flex flex-wrap gap-2">
            <DuplicateFinder
              items={employees}
              collection="employees"
              keyOf={(e) => dupNorm(e.email) || (dupNorm(e.firstName) + dupNorm(e.lastName)) || null}
              describe={(e) => ({ title: `${e.firstName} ${e.lastName}`.trim(), subtitle: [e.email, e.title].filter(Boolean).join(" · "), badges: e.workerType === "contractor" ? ["Contractor"] : undefined })}
              score={(e) => (e.userId ? 2 : 0) + (e.email ? 1 : 0)}
            />
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add employee
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active" value={stats.active} icon={Users} tone="success" loading={isLoading} />
        <StatCard label="On leave" value={stats.onLeave} icon={Users} tone="warning" loading={isLoading} />
        <StatCard label="Inactive" value={stats.inactive} icon={Users} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search name, email, or title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(["all", "active", "on_leave", "terminated"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {humanizeLabel(s)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No employees found"
              description={search || filterStatus !== "all" ? "Try adjusting your search or filter." : "Add your first employee."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add employee</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Name" sortKey="name" sort={sort} onToggle={toggle} />
                    <SortHeader label="Email" sortKey="email" sort={sort} onToggle={toggle} />
                    <SortHeader label="Title" sortKey="title" sort={sort} onToggle={toggle} />
                    <SortHeader label="Department" sortKey="department" sort={sort} onToggle={toggle} />
                    <SortHeader label="Hire date" sortKey="hireDate" sort={sort} onToggle={toggle} />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filterStatus !== "all"
                    ? sorted.map(renderRow)
                    : (
                      <>
                        {currentRows.map(renderRow)}
                        {pastRows.length > 0 && (
                          <Fragment>
                            <tr className="border-b border-border bg-secondary/40">
                              <td colSpan={7} className="py-2">
                                <button
                                  type="button"
                                  onClick={() => setShowPast((v) => !v)}
                                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                  <ChevronRight className={cn("size-4 transition-transform", showPast && "rotate-90")} />
                                  Past employees <Badge variant="secondary">{pastRows.length}</Badge>
                                </button>
                              </td>
                            </tr>
                            {showPast && pastRows.map(renderRow)}
                          </Fragment>
                        )}
                      </>
                    )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
