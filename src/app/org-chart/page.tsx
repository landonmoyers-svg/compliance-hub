"use client";

import { useMemo, useState } from "react";
import { Network, Plus, X, GraduationCap, BadgeCheck, ChevronRight, AlertTriangle } from "lucide-react";
import { useCollection, useCreate, useUpdate, useRemove } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import type { Employee, RoleRequirement } from "@/lib/data/schema";
import { toast } from "sonner";

const fullName = (e: Employee) => `${e.firstName} ${e.lastName}`.trim();

export default function OrgChartPage() {
  const employeesQ = useCollection("employees");
  const reqsQ = useCollection("roleRequirements");
  const modulesQ = useCollection("trainingModules");
  const assignmentsQ = useCollection("trainingAssignments");
  const credentialsQ = useCollection("credentials");
  const updateEmployee = useUpdate("employees");
  const createReq = useCreate("roleRequirements");
  const removeReq = useRemove("roleRequirements");
  const createAssignment = useCreate("trainingAssignments");

  const employees = useMemo(() => (employeesQ.data ?? []).filter((e) => e.employmentStatus === "active"), [employeesQ.data]);
  const reqs = useMemo(() => reqsQ.data ?? [], [reqsQ.data]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const roles = useMemo(() => Array.from(new Set([...employees.map((e) => e.jobRole).filter(Boolean) as string[], ...reqs.map((r) => r.jobRole)])).sort(), [employees, reqs]);

  // Children map for the tree.
  const childrenOf = useMemo(() => {
    const m = new Map<string, Employee[]>();
    for (const e of employees) {
      const k = e.managerId ?? "__root__";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    for (const list of m.values()) list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
    return m;
  }, [employees]);
  const roots = childrenOf.get("__root__") ?? [];

  // Requirement gap for an employee.
  function gapFor(e: Employee) {
    if (!e.jobRole) return { reqTrain: [], reqCred: [], missingTrain: [] as RoleRequirement[], missingCred: [] as RoleRequirement[] };
    const rr = reqs.filter((r) => r.jobRole === e.jobRole);
    const reqTrain = rr.filter((r) => r.reqType === "training");
    const reqCred = rr.filter((r) => r.reqType === "credential");
    const name = fullName(e).toLowerCase();
    const hasTraining = (t: string) => (assignmentsQ.data ?? []).some((a) => (a.assignedToUserId === e.userId || a.assignedToName.toLowerCase() === name) && a.moduleTitle.toLowerCase().includes(t.toLowerCase()));
    const hasCred = (c: string) => (credentialsQ.data ?? []).some((cr) => (cr.employeeUserId === e.userId || cr.employeeName.toLowerCase() === name) && cr.credentialName.toLowerCase().includes(c.toLowerCase()));
    return { reqTrain, reqCred, missingTrain: reqTrain.filter((r) => !hasTraining(r.name)), missingCred: reqCred.filter((r) => !hasCred(r.name)) };
  }

  async function assignMissing(e: Employee) {
    if (!e.userId) { toast.error(`${fullName(e)} needs an app login before training can be assigned. Invite them from User Management first.`); return; }
    const { missingTrain } = gapFor(e);
    const modules = modulesQ.data ?? [];
    let assigned = 0, unmatched = 0;
    for (const r of missingTrain) {
      const mod = modules.find((m) => m.title.toLowerCase().includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(m.title.toLowerCase()));
      if (!mod) { unmatched++; continue; }
      try {
        await createAssignment.mutateAsync({ trainingModuleId: mod.id, moduleTitle: mod.title, assignedToUserId: e.userId, assignedToName: fullName(e), status: "assigned", dueDate: new Date(Date.now() + 30 * 864e5).toISOString() });
        assigned++;
      } catch { /* skip */ }
    }
    if (assigned) toast.success(`Assigned ${assigned} required training${assigned === 1 ? "" : "s"} to ${fullName(e)}`);
    if (unmatched) toast.warning(`${unmatched} required training${unmatched === 1 ? " has" : "s have"} no matching module in the Training Academy — create it first.`);
    if (!assigned && !unmatched) toast.info("No missing required training to assign.");
  }

  const totalMissing = useMemo(() => employees.reduce((s, e) => { const g = gapFor(e); return s + g.missingTrain.length + g.missingCred.length; }, 0), [employees, reqs, assignmentsQ.data, credentialsQ.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const withoutRole = employees.filter((e) => !e.jobRole).length;

  const managerOptions = employees;

  function OrgNode({ e, depth }: { e: Employee; depth: number }) {
    const kids = childrenOf.get(e.id) ?? [];
    const g = gapFor(e);
    const missing = g.missingTrain.length + g.missingCred.length;
    const isOpen = expanded.has(e.id);
    return (
      <div>
        <div className="flex items-center gap-2 rounded-lg border border-border p-2.5" style={{ marginLeft: depth * 20 }}>
          <button onClick={() => setExpanded((s) => { const n = new Set(s); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; })} className="text-muted-foreground hover:text-foreground">
            <ChevronRight className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{fullName(e)}</span>
              {e.jobRole && <Badge variant="secondary">{e.jobRole}</Badge>}
              {e.jobRole && missing > 0 && <Badge variant="warning">{missing} missing</Badge>}
              {!e.jobRole && <Badge variant="outline">no role set</Badge>}
              {e.reportsNote && <Badge variant="outline" title={e.reportsNote}>dotted line</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">{e.title ?? e.department ?? "—"}</p>
          </div>
        </div>

        {isOpen && (
          <div className="mb-2 space-y-2 rounded-lg bg-secondary/20 p-3" style={{ marginLeft: depth * 20 + 24 }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">Job role / position</span>
                <input list="role-list" className="input w-full" defaultValue={e.jobRole ?? ""} placeholder="e.g. PMHNP, Medical Assistant, Front Desk"
                  onBlur={(ev) => ev.target.value !== (e.jobRole ?? "") && void updateEmployee.mutateAsync({ id: e.id, patch: { jobRole: ev.target.value || null } })} />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">Reports to (solid line)</span>
                <select className="input w-full" value={e.managerId ?? ""} onChange={(ev) => void updateEmployee.mutateAsync({ id: e.id, patch: { managerId: ev.target.value || null } })}>
                  <option value="">— No manager (top of chain) —</option>
                  {managerOptions.filter((m) => m.id !== e.id).map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs sm:col-span-2">
                <span className="font-medium text-muted-foreground">Also reports to / dotted line</span>
                <input className="input w-full" defaultValue={e.reportsNote ?? ""} placeholder="e.g. Also reports to Josh (CEO) for business & strategy"
                  onBlur={(ev) => ev.target.value !== (e.reportsNote ?? "") && void updateEmployee.mutateAsync({ id: e.id, patch: { reportsNote: ev.target.value || null } })} />
              </label>
            </div>
            {e.jobRole && (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-muted-foreground">Requirements for {e.jobRole}</span>
                  {g.missingTrain.length > 0 && <Button size="sm" variant="outline" onClick={() => void assignMissing(e)}><GraduationCap className="size-3.5" /> Assign missing training</Button>}
                </div>
                {g.reqTrain.length === 0 && g.reqCred.length === 0 ? (
                  <p className="text-muted-foreground">No requirements defined for this role yet — add them on the right.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {g.reqTrain.map((r) => <Badge key={r.id} variant={g.missingTrain.includes(r) ? "warning" : "success"}><GraduationCap className="mr-1 size-3" />{r.name}</Badge>)}
                    {g.reqCred.map((r) => <Badge key={r.id} variant={g.missingCred.includes(r) ? "warning" : "success"}><BadgeCheck className="mr-1 size-3" />{r.name}</Badge>)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {kids.map((k) => <OrgNode key={k.id} e={k} depth={depth + 1} />)}
      </div>
    );
  }

  if (employeesQ.isError) return <div className="space-y-6"><PageHeader title="Org Chart" /><ErrorState message="We couldn't load employees." onRetry={() => void employeesQ.refetch()} /></div>;

  const loading = employeesQ.isLoading || reqsQ.isLoading;

  return (
    <div className="space-y-6">
      <datalist id="role-list">{roles.map((r) => <option key={r} value={r} />)}</datalist>

      <PageHeader title="Org Chart & Role Requirements" description="Define your chain of command and the training + credentials each role requires. Requirement gaps surface per person, and missing training can be assigned in one click." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active staff" value={employees.length} icon={Network} loading={loading} />
        <StatCard label="Without a role set" value={withoutRole} icon={AlertTriangle} tone={withoutRole ? "warning" : "success"} loading={loading} />
        <StatCard label="Open requirement gaps" value={totalMissing} icon={AlertTriangle} tone={totalMissing ? "warning" : "success"} loading={loading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Org chart */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Chain of command</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : employees.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Add employees in the Employee Directory first.</p>
            ) : (
              <div className="space-y-1.5">
                {roots.map((e) => <OrgNode key={e.id} e={e} depth={0} />)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role requirements editor */}
        <RoleRequirementsEditor roles={roles} reqs={reqs} onAdd={(d) => createReq.mutateAsync(d)} onRemove={(id) => removeReq.mutateAsync(id)} />
      </div>
    </div>
  );
}

function RoleRequirementsEditor({ roles, reqs, onAdd, onRemove }: {
  roles: string[]; reqs: RoleRequirement[];
  onAdd: (d: { jobRole: string; reqType: "training" | "credential"; name: string }) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const [role, setRole] = useState("");
  const [reqType, setReqType] = useState<"training" | "credential">("training");
  const [name, setName] = useState("");

  const roleReqs = reqs.filter((r) => r.jobRole === role);

  async function add() {
    if (!role.trim() || !name.trim()) { toast.error("Enter a role and a requirement name."); return; }
    try { await onAdd({ jobRole: role.trim(), reqType, name: name.trim() }); setName(""); toast.success("Requirement added"); }
    catch { toast.error("Couldn't add requirement."); }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Role requirements</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Role</label>
          <input list="role-list" className="input w-full" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Type or pick a role" />
        </div>
        {role.trim() && (
          <>
            <div className="flex gap-2">
              <select className="input" value={reqType} onChange={(e) => setReqType(e.target.value as "training" | "credential")}>
                <option value="training">Training</option><option value="credential">Credential</option>
              </select>
              <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Requirement name" onKeyDown={(e) => e.key === "Enter" && void add()} />
              <Button size="sm" onClick={() => void add()}><Plus className="size-4" /></Button>
            </div>
            <div className="space-y-1.5">
              {roleReqs.length === 0 ? <p className="text-xs text-muted-foreground">No requirements yet for “{role}”.</p> : roleReqs.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm">
                  <span className="flex items-center gap-1.5">
                    {r.reqType === "training" ? <GraduationCap className="size-3.5 text-primary" /> : <BadgeCheck className="size-3.5 text-primary" />}
                    {r.name}
                  </span>
                  <button onClick={() => void onRemove(r.id)} className="text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button>
                </div>
              ))}
            </div>
          </>
        )}
        {roles.length > 0 && !role && <p className="text-xs text-muted-foreground">Existing roles: {roles.join(", ")}</p>}
      </CardContent>
    </Card>
  );
}
