"use client";

import { useState, useMemo } from "react";
import { Users, Plus, Search, X, FolderOpen, Mail, UserPlus, ShieldCheck, UserX } from "lucide-react";
import { useCollection, useUpdate } from "@/lib/data/hooks";
import { createClient } from "@/lib/supabase/client";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { PersonRecordsPanel } from "@/components/shared/person-records-panel";
import { StatCard } from "@/components/shared/stat-card";
import { roleLabel } from "@/lib/auth/roles";
import { formatName } from "@/lib/format";
import { accountRoles } from "@/lib/data/schema";
import type { ComplianceUserProfile, Employee } from "@/lib/data/schema";
import { toast } from "sonner";

interface ProfileForm {
  fullName: string;
  email: string;
  accountRole: ComplianceUserProfile["accountRole"];
  staffRole: string;
  department: string;
  active: boolean;
}

function ProfileDialog({
  initial,
  defaults,
  onClose,
  onSave,
  saving,
}: {
  initial?: ComplianceUserProfile;
  /** Prefill for a NEW invite (e.g. inviting an existing employee). */
  defaults?: Partial<ProfileForm>;
  onClose: () => void;
  onSave: (data: ProfileForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ProfileForm>(
    initial
      ? {
          fullName: initial.fullName,
          email: initial.email,
          accountRole: initial.accountRole,
          staffRole: initial.staffRole ?? "",
          department: initial.department ?? "",
          active: initial.active,
        }
      : {
          fullName: "",
          email: "",
          accountRole: "staff",
          staffRole: "",
          department: "",
          active: true,
          ...defaults,
        },
  );

  const set =
    (k: keyof ProfileForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const emailValid = form.email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit user" : "Add user"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Full name *</label>
            <input className="input w-full" value={form.fullName} onChange={set("fullName")} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email *</label>
            <input type="email" className="input w-full" value={form.email} onChange={set("email")} placeholder="user@example.com" />
            {!emailValid && <p className="text-xs text-destructive">Enter a valid email.</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Account role</label>
            <select className="input w-full" value={form.accountRole} onChange={set("accountRole")}>
              {accountRoles.map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Staff role</label>
            <input className="input w-full" value={form.staffRole} onChange={set("staffRole")} placeholder="e.g. Registered Nurse" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Department</label>
            <input className="input w-full" value={form.department} onChange={set("department")} placeholder="clinical, hr, admin…" />
          </div>
          <div className="flex items-center gap-2 self-end pb-1">
            <input
              id="active"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
              className="size-4"
            />
            <label htmlFor="active" className="text-sm">Active account</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.fullName.trim() || !form.email.trim() || !emailValid || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// A unified row: one per current employee (with or without a login) plus any
// login accounts that aren't tied to a current employee (e.g. the owner).
interface UserRow {
  key: string;
  name: string;
  email: string;
  jobRole: string;
  accountRole?: ComplianceUserProfile["accountRole"];
  status: "active_login" | "login_disabled" | "no_account";
  profile?: ComplianceUserProfile;
  employee?: Employee;
}

export default function UserManagementPage() {
  const { data, isLoading, isError, refetch } = useCollection("profiles");
  const employeesQ = useCollection("employees");
  const updateMut = useUpdate("profiles");
  const updateEmployee = useUpdate("employees");

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ComplianceUserProfile | null | "new">(null);
  // When inviting an existing employee: prefill + link their record on success.
  const [inviting, setInviting] = useState<Employee | null>(null);
  const [viewingRecords, setViewingRecords] = useState<{ userId?: string | null; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const profiles = useMemo(() => data ?? [], [data]);
  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);

  // Union current employees with login profiles into one roster.
  const rows = useMemo<UserRow[]>(() => {
    const byUserId = new Map<string, ComplianceUserProfile>();
    const byEmail = new Map<string, ComplianceUserProfile>();
    for (const p of profiles) {
      if (p.userId) byUserId.set(p.userId, p);
      if (p.email) byEmail.set(p.email.toLowerCase(), p);
    }
    const usedProfileIds = new Set<string>();
    const out: UserRow[] = [];

    for (const e of employees) {
      if (e.employmentStatus !== "active" && e.employmentStatus !== "on_leave") continue;
      const profile =
        (e.userId ? byUserId.get(e.userId) : undefined) ??
        (e.email ? byEmail.get(e.email.toLowerCase()) : undefined);
      if (profile) usedProfileIds.add(profile.id);
      out.push({
        key: `e:${e.id}`,
        name: formatName(`${e.firstName} ${e.lastName}`.trim()),
        email: e.email || profile?.email || "",
        jobRole: e.jobRole || e.title || profile?.staffRole || "",
        accountRole: profile?.accountRole,
        status: profile ? (profile.active ? "active_login" : "login_disabled") : "no_account",
        profile,
        employee: e,
      });
    }
    // Login accounts not tied to a current employee (owner, admins, etc.).
    for (const p of profiles) {
      if (usedProfileIds.has(p.id)) continue;
      out.push({
        key: `p:${p.id}`,
        name: p.fullName,
        email: p.email,
        jobRole: p.staffRole ?? "",
        accountRole: p.accountRole,
        status: p.active ? "active_login" : "login_disabled",
        profile: p,
      });
    }
    return out;
  }, [profiles, employees]);

  // Sends a set-password / login email via Supabase's built-in email sender —
  // works for anyone with an account (a first-time invitee who never clicked
  // their invite, or a returning user). No custom domain required.
  async function sendLoginEmail(p: ComplianceUserProfile) {
    if (!p.email) { toast.error("This user has no email on file."); return; }
    setSendingTo(p.id);
    try {
      const supabase = createClient();
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/reset` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(p.email.toLowerCase(), { redirectTo });
      if (error) toast.error(error.message);
      else toast.success(`Login email sent to ${p.email}. Ask them to check spam if it doesn't arrive.`);
    } catch {
      toast.error("Couldn't send the email. Please try again.");
    } finally {
      setSendingTo(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.jobRole.toLowerCase().includes(q),
    );
  }, [rows, search]);

  // No-account rows sort first so the "who still needs access" work is up top.
  const STATUS_ORDER: Record<UserRow["status"], number> = { no_account: 0, login_disabled: 1, active_login: 2 };
  const { sorted, sort, toggle } = useSort(filtered, {
    name: (r) => r.name,
    email: (r) => r.email,
    jobRole: (r) => r.jobRole,
    role: (r) => (r.accountRole ? roleLabel(r.accountRole) : ""),
    status: (r) => STATUS_ORDER[r.status],
  });

  const stats = useMemo(() => ({
    total: rows.length,
    withLogin: rows.filter((r) => r.status !== "no_account").length,
    noAccount: rows.filter((r) => r.status === "no_account").length,
  }), [rows]);

  async function handleSave(form: ProfileForm) {
    setSaving(true);
    try {
      const payload = {
        fullName: formatName(form.fullName),
        email: form.email.trim().toLowerCase(),
        accountRole: form.accountRole,
        staffRole: form.staffRole.trim() || undefined,
        department: (form.department.trim() as ComplianceUserProfile["department"]) || undefined,
        active: form.active,
      };
      if (editing && editing !== "new") {
        // Audit (incl. role-change detail) is written server-side by the
        // profiles DB trigger — tamper-resistant and can't be skipped.
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("User updated");
      } else {
        // Provision a real login: invite the user + create a linked profile
        // with their actual auth id (server route, service-role).
        const res = await fetch("/api/admin/invite-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: payload.email,
            fullName: payload.fullName,
            accountRole: payload.accountRole,
            staffRole: payload.staffRole,
            department: payload.department,
          }),
        });
        const data = await res.json() as { ok?: boolean; error?: string; userId?: string };
        if (!res.ok || !data.ok) {
          toast.error(data.error ?? "Failed to invite user.");
          setSaving(false);
          return;
        }
        // If we were inviting an existing employee, link their record to the
        // new login so the two stay unified (name/role propagation, records).
        if (inviting && data.userId) {
          try { await updateEmployee.mutateAsync({ id: inviting.id, patch: { userId: data.userId } }); } catch { /* email-match still unions them */ }
        }
        toast.success("Invitation sent — the user will get an email to set their password.");
      }
      setEditing(null);
      setInviting(null);
      void refetch();
    } catch {
      toast.error("Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  const loading = isLoading || employeesQ.isLoading;

  if (isError || employeesQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="User Management" />
        <ErrorState message="We couldn't load users." onRetry={() => { void refetch(); void employeesQ.refetch(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <ProfileDialog
          initial={editing === "new" ? undefined : editing}
          defaults={editing === "new" && inviting ? {
            fullName: formatName(`${inviting.firstName} ${inviting.lastName}`.trim()),
            email: inviting.email,
            staffRole: inviting.jobRole || inviting.title || "",
            department: inviting.department ?? "",
            accountRole: "staff",
          } : undefined}
          onClose={() => { setEditing(null); setInviting(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {viewingRecords && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setViewingRecords(null)}>
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold">{viewingRecords.name}</h2>
                <p className="text-xs text-muted-foreground">All linked compliance records</p>
              </div>
              <button onClick={() => setViewingRecords(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="overflow-y-auto p-5">
              <PersonRecordsPanel userId={viewingRecords.userId ?? null} name={viewingRecords.name} />
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="User Management"
        description="Every current employee and their app-access status. Invite the ones who still need a login; each account's role controls what they can see and do."
        actions={
          <Button onClick={() => { setInviting(null); setEditing("new"); }}>
            <Plus className="size-4" /> Add user
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Current staff" value={stats.total} icon={Users} loading={loading} />
        <StatCard label="Have a login" value={stats.withLogin} icon={ShieldCheck} tone="success" loading={loading} />
        <StatCard label="No account yet" value={stats.noAccount} icon={UserX} tone={stats.noAccount ? "warning" : "default"} loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input w-full pl-9"
              placeholder="Search by name, email, or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users found"
              description={search ? "Try adjusting your search." : "Add employees in HR, then invite them here."}
              action={<Button onClick={() => { setInviting(null); setEditing("new"); }}><Plus className="size-4" /> Add user</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Name" sortKey="name" sort={sort} onToggle={toggle} />
                    <SortHeader label="Email" sortKey="email" sort={sort} onToggle={toggle} />
                    <SortHeader label="Job role" sortKey="jobRole" sort={sort} onToggle={toggle} />
                    <SortHeader label="Account role" sortKey="role" sort={sort} onToggle={toggle} />
                    <SortHeader label="Access" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.key} className="border-b border-border/50 hover:bg-secondary/20">
                      <td data-label="Name" className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                            {r.name.charAt(0)}
                          </div>
                          <span className="font-medium">{r.name}</span>
                        </div>
                      </td>
                      <td data-label="Email" className="py-3 pr-4 text-muted-foreground">{r.email || "—"}</td>
                      <td data-label="Job role" className="py-3 pr-4 text-muted-foreground">{r.jobRole || "—"}</td>
                      <td data-label="Account role" className="py-3 pr-4">
                        {r.accountRole ? <Badge variant="secondary">{roleLabel(r.accountRole)}</Badge> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td data-label="Access" className="py-3 pr-4">
                        {r.status === "active_login" ? <Badge variant="success">Active login</Badge>
                          : r.status === "login_disabled" ? <Badge variant="secondary">Login disabled</Badge>
                          : <Badge variant="warning">No account</Badge>}
                      </td>
                      <td data-label="" className="py-3">
                        <div className="flex flex-wrap gap-1 md:justify-end">
                          {r.profile ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => void sendLoginEmail(r.profile!)} disabled={!r.email || sendingTo === r.profile.id} title="Email this person a link to set their password and sign in">
                                <Mail className="size-3.5" /> {sendingTo === r.profile.id ? "Sending…" : "Send login email"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setViewingRecords({ userId: r.profile!.userId, name: r.name })}><FolderOpen className="size-3.5" /> Records</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditing(r.profile!)}>Edit</Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" onClick={() => { setInviting(r.employee!); setEditing("new"); }} disabled={!r.email} title={r.email ? "Invite this employee to the app" : "Add an email in HR before inviting"}>
                                <UserPlus className="size-3.5" /> Invite
                              </Button>
                              {!r.email && <span className="self-center text-xs text-muted-foreground">needs email</span>}
                            </>
                          )}
                        </div>
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
