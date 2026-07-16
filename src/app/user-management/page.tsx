"use client";

import { useState, useMemo } from "react";
import { Users, Plus, Search, X, FolderOpen, Mail } from "lucide-react";
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
import { roleLabel } from "@/lib/auth/roles";
import { accountRoles } from "@/lib/data/schema";
import type { ComplianceUserProfile } from "@/lib/data/schema";
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
  onClose,
  onSave,
  saving,
}: {
  initial?: ComplianceUserProfile;
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

export default function UserManagementPage() {
  const { data, isLoading, isError, refetch } = useCollection("profiles");
  const updateMut = useUpdate("profiles");

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ComplianceUserProfile | null | "new">(null);
  const [viewingRecords, setViewingRecords] = useState<ComplianceUserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const profiles = useMemo(() => data ?? [], [data]);

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
    return profiles.filter(
      (p) => !q || p.fullName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [profiles, search]);

  const { sorted, sort, toggle } = useSort(filtered, {
    name: (p) => p.fullName,
    email: (p) => p.email,
    role: (p) => roleLabel(p.accountRole),
    status: (p) => (p.active ? "Active" : "Inactive"),
  });

  async function handleSave(form: ProfileForm) {
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
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
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          toast.error(data.error ?? "Failed to invite user.");
          setSaving(false);
          return;
        }
        toast.success("Invitation sent — the user will get an email to set their password.");
      }
      setEditing(null);
      void refetch();
    } catch {
      toast.error("Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="User Management" />
        <ErrorState message="We couldn't load users." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <ProfileDialog
          initial={editing === "new" ? undefined : editing}
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
                <h2 className="font-semibold">{viewingRecords.fullName}</h2>
                <p className="text-xs text-muted-foreground">{viewingRecords.email} · all linked compliance records</p>
              </div>
              <button onClick={() => setViewingRecords(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="overflow-y-auto p-5">
              <PersonRecordsPanel userId={viewingRecords.userId} name={viewingRecords.fullName} />
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="User Management"
        description="Manage user accounts and role assignments. All roles use a single source of truth: accountRole."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add user
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input w-full pl-9"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users found"
              description={search ? "Try adjusting your search." : "Add your first user."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add user</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Name" sortKey="name" sort={sort} onToggle={toggle} />
                    <SortHeader label="Email" sortKey="email" sort={sort} onToggle={toggle} />
                    <SortHeader label="Role" sortKey="role" sort={sort} onToggle={toggle} />
                    <th className="pb-2 pr-4 font-medium">Permissions</th>
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => {
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Name" className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                              {p.fullName.charAt(0)}
                            </div>
                            <span className="font-medium">{p.fullName}</span>
                          </div>
                        </td>
                        <td data-label="Email" className="py-3 pr-4 text-muted-foreground">{p.email}</td>
                        <td data-label="Role" className="py-3 pr-4">
                          <Badge variant="secondary">{roleLabel(p.accountRole)}</Badge>
                        </td>
                        <td data-label="Permissions" className="py-3 pr-4 text-xs text-muted-foreground">—</td>
                        <td data-label="Status" className="py-3 pr-4">
                          <Badge variant={p.active ? "success" : "secondary"}>
                            {p.active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td data-label="" className="py-3">
                          <div className="flex gap-1 md:justify-end">
                            <Button size="sm" variant="ghost" onClick={() => void sendLoginEmail(p)} disabled={!p.email || sendingTo === p.id} title="Email this person a link to set their password and sign in">
                              <Mail className="size-3.5" /> {sendingTo === p.id ? "Sending…" : "Send login email"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setViewingRecords(p)}><FolderOpen className="size-3.5" /> Records</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
