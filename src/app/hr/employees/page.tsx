"use client";

import { useState, useMemo } from "react";
import { Users, Plus, Search } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate, dateInputToISO } from "@/lib/dates";
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
  department: string;
  employmentStatus: Employee["employmentStatus"];
  hireDate: string;
}

const EMPTY: EmployeeForm = {
  firstName: "",
  lastName: "",
  email: "",
  title: "",
  department: "",
  employmentStatus: "active",
  hireDate: "",
};

function EmployeeDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: Employee;
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
          department: initial.department ?? "",
          employmentStatus: initial.employmentStatus,
          hireDate: initial.hireDate ?? "",
        }
      : EMPTY,
  );

  const set =
    (k: keyof EmployeeForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const emailValid = form.email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const canSave =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    emailValid;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
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
            <label className="text-sm font-medium">Email *</label>
            <input type="email" className="input w-full" value={form.email} onChange={set("email")} placeholder="work@example.com" />
            {!emailValid && <p className="text-xs text-destructive">Enter a valid email address.</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title / role</label>
            <input className="input w-full" value={form.title} onChange={set("title")} placeholder="e.g. Registered Nurse" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Department</label>
            <select className="input w-full" value={form.department} onChange={set("department")}>
              <option value="">— None —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
              ))}
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Hire date</label>
            <input type="date" className="input w-full" value={form.hireDate} onChange={set("hireDate")} />
          </div>
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
  const createMut = useCreate("employees");
  const updateMut = useUpdate("employees");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Employee["employmentStatus"] | "all">("all");
  const [editing, setEditing] = useState<Employee | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const employees = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) => {
      if (filterStatus !== "all" && e.employmentStatus !== filterStatus) return false;
      const name = `${e.firstName} ${e.lastName}`.toLowerCase();
      if (q && !name.includes(q) && !e.email.toLowerCase().includes(q) && !(e.title ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, search, filterStatus]);

  const stats = useMemo(() => ({
    active: employees.filter((e) => e.employmentStatus === "active").length,
    onLeave: employees.filter((e) => e.employmentStatus === "on_leave").length,
    inactive: employees.filter((e) => e.employmentStatus !== "active" && e.employmentStatus !== "on_leave").length,
  }), [employees]);

  async function handleSave(form: EmployeeForm) {
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        title: form.title.trim() || undefined,
        department: (form.department as Employee["department"]) || undefined,
        employmentStatus: form.employmentStatus,
        hireDate: form.hireDate ? dateInputToISO(form.hireDate) : undefined,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Employee updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Employee added");
      }
      setEditing(null);
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
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Employees"
        description="Searchable employee directory with employment status and department information."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add employee
          </Button>
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
                {s === "all" ? "All" : s === "on_leave" ? "On leave" : s.charAt(0).toUpperCase() + s.slice(1)}
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Email</th>
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Department</th>
                    <th className="pb-2 pr-4 font-medium">Hire date</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                            {e.firstName.charAt(0)}{e.lastName.charAt(0)}
                          </div>
                          <span className="font-medium">{e.firstName} {e.lastName}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{e.email}</td>
                      <td className="py-3 pr-4">{e.title ?? "—"}</td>
                      <td className="py-3 pr-4 capitalize">{e.department ?? "—"}</td>
                      <td className="py-3 pr-4">{e.hireDate ? formatDate(e.hireDate) : "—"}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={STATUS_VARIANT[e.employmentStatus]}>
                          {e.employmentStatus === "on_leave" ? "On leave" : e.employmentStatus.charAt(0).toUpperCase() + e.employmentStatus.slice(1)}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Edit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
