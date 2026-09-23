"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Volume2, Siren, Building2, Users, Shield, Trash2, KeyRound, Mic } from "lucide-react";
import { toast } from "sonner";
import { useCollection, useCreate, useRemove, useUpdate } from "@/lib/data/hooks";
import { useEmergencyData, type EmergencyData } from "@/lib/emergency-alert/use-emergency";
import { playAlarm, unlockAudio } from "@/lib/emergency-alert/sounds";
import { ASSISTANCE_TYPES } from "@/lib/emergency-alert/rules";
import { alarmSounds, weekDays, type AlarmSound, type EmergencyCode, type EmergencyResponderProfile, type EmergencySiteSettings } from "@/lib/data/schema";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal, inputCls, labelCls } from "@/components/emergency-alert/modal";
import { humanizeLabel } from "@/lib/format";
import { cn } from "@/lib/cn";

type Tab = "codes" | "sites" | "people" | "roles";
const TABS: { key: Tab; label: string; icon: typeof Siren }[] = [
  { key: "codes", label: "Codes", icon: Siren },
  { key: "sites", label: "Sites", icon: Building2 },
  { key: "people", label: "People", icon: Users },
  { key: "roles", label: "Site roles", icon: Shield },
];

export default function EmergencySetupPage() {
  const data = useEmergencyData();
  const [tab, setTab] = useState<Tab>("codes");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Emergency setup"
        description="The codes staff can call, how your sites back each other up, and who responds where."
        actions={<Button asChild variant="outline"><Link href="/emergency"><ArrowLeft /> Emergency</Link></Button>}
      />
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>
      {data.loading ? <Skeleton className="h-64" /> : (
        <>
          {tab === "codes" && <CodesTab data={data} />}
          {tab === "sites" && <SitesTab data={data} />}
          {tab === "people" && <PeopleTab data={data} />}
          {tab === "roles" && <RolesTab data={data} />}
        </>
      )}
    </div>
  );
}

/* ================================================================ codes */

function CodesTab({ data }: { data: EmergencyData }) {
  const [editing, setEditing] = useState<EmergencyCode | "new" | null>(null);
  const codes = [...data.allCodes].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={() => setEditing("new")}><Plus /> Add code</Button></div>
      <div className="grid gap-3 md:grid-cols-2">
        {codes.map((c) => (
          <Card key={c.id} className={cn(!c.active && "opacity-60")} style={{ borderLeft: `6px solid ${c.colorHex}` }}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-semibold">{c.name} {!c.active && <Badge variant="secondary">Hidden</Badge>}</p>
                  <p className="text-xs text-muted-foreground">{c.priority}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label="Play alarm" onClick={() => { unlockAudio(); playAlarm(c.alarmSound); }}><Volume2 /></Button>
                  <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing(c)}><Pencil /></Button>
                </div>
              </div>
              {c.description && <p className="text-sm">{c.description}</p>}
              <p className="text-xs text-muted-foreground">
                Alarm: {humanizeLabel(c.alarmSound)} · {c.audioRecordingEnabled ? <span className="inline-flex items-center gap-1"><Mic className="size-3" /> records audio</span> : "no audio"}
              </p>
              {c.requiredRoles.length > 0 && (
                <div className="flex flex-wrap gap-1">{c.requiredRoles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {editing && <CodeDialog code={editing === "new" ? null : editing} nextOrder={codes.length + 1} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CodeDialog({ code, nextOrder, onClose }: { code: EmergencyCode | null; nextOrder: number; onClose: () => void }) {
  const create = useCreate("emergencyCodes");
  const update = useUpdate("emergencyCodes");
  const [f, setF] = useState({
    name: code?.name ?? "", description: code?.description ?? "", priority: code?.priority ?? "CRITICAL PRIORITY",
    colorHex: code?.colorHex ?? "#E53935", alarmSound: (code?.alarmSound ?? "default") as AlarmSound,
    roles: (code?.requiredRoles ?? []).join("\n"), audio: code?.audioRecordingEnabled ?? false,
    active: code?.active ?? true, sortOrder: code?.sortOrder ?? nextOrder,
  });
  const save = async () => {
    const patch = {
      name: f.name.trim(), description: f.description.trim() || null, priority: f.priority, colorHex: f.colorHex,
      alarmSound: f.alarmSound, requiredRoles: f.roles.split("\n").map((r) => r.trim()).filter(Boolean),
      audioRecordingEnabled: f.audio, active: f.active, sortOrder: Number(f.sortOrder) || 0,
    };
    try {
      if (code) await update.mutateAsync({ id: code.id, patch });
      else await create.mutateAsync(patch);
      toast.success("Saved.");
      onClose();
    } catch (e) { toast.error(`Couldn't save: ${e instanceof Error ? e.message : "error"}`); }
  };
  return (
    <Modal title={code ? `Edit ${code.name}` : "New code"} onClose={onClose} accent={f.colorHex} wide
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!f.name.trim()}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={labelCls}>Name</label><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Code Blue" /></div>
        <div><label className={labelCls}>Priority</label>
          <select className={inputCls} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            <option>CRITICAL PRIORITY</option><option>HIGH PRIORITY</option><option>MEDIUM PRIORITY</option>
          </select></div>
        <div className="sm:col-span-2"><label className={labelCls}>What it means</label><input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div><label className={labelCls}>Colour</label>
          <div className="flex gap-2"><input type="color" value={f.colorHex} onChange={(e) => setF({ ...f, colorHex: e.target.value })} className="h-9 w-12 rounded border border-border" /><input className={inputCls} value={f.colorHex} onChange={(e) => setF({ ...f, colorHex: e.target.value })} /></div></div>
        <div><label className={labelCls}>Alarm sound</label>
          <div className="flex gap-2">
            <select className={inputCls} value={f.alarmSound} onChange={(e) => setF({ ...f, alarmSound: e.target.value as AlarmSound })}>
              {alarmSounds.map((s) => <option key={s} value={s}>{humanizeLabel(s)}</option>)}
            </select>
            <Button variant="outline" size="icon" aria-label="Preview" onClick={() => { unlockAudio(); playAlarm(f.alarmSound); }}><Volume2 /></Button>
          </div></div>
        <div className="sm:col-span-2"><label className={labelCls}>Roles this code needs <span className="font-normal text-muted-foreground">(one per line)</span></label>
          <textarea className={`${inputCls} min-h-28`} value={f.roles} onChange={(e) => setF({ ...f, roles: e.target.value })} placeholder={"Calling 911\nIncident Commander"} /></div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-0.5 size-4" checked={f.audio} onChange={(e) => setF({ ...f, audio: e.target.checked })} />
          <span>Record audio on the triggering device <span className="block text-xs text-muted-foreground">Clips stream to admin devices and are kept only there — never on the Hub&apos;s servers.</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Show on the Emergency page</label>
        <div><label className={labelCls}>Order</label><input type="number" className={inputCls} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></div>
      </div>
    </Modal>
  );
}

/* ================================================================ sites */

function SitesTab({ data }: { data: EmergencyData }) {
  const create = useCreate("emergencySiteSettings");
  const update = useUpdate("emergencySiteSettings");
  const save = async (locationId: string, patch: Partial<Omit<EmergencySiteSettings, "id" | "createdDate">>) => {
    const cur = data.settings.find((s) => s.locationId === locationId);
    try {
      if (cur) await update.mutateAsync({ id: cur.id, patch });
      else await create.mutateAsync({ locationId, mutualAidLocationIds: [], connectedLocationIds: [], refugeForLocationIds: [], ...patch });
    } catch (e) { toast.error(`Couldn't save: ${e instanceof Error ? e.message : "error"}`); }
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">These drive the guidance on every incident: who&apos;s expected to cross-respond, which buildings share exposure, where to fetch the AED, and where people can shelter.</p>
      {data.locations.map((loc) => {
        const s = data.settings.find((x) => x.locationId === loc.id);
        const others = data.locations.filter((l) => l.id !== loc.id);
        const pick = (field: "mutualAidLocationIds" | "connectedLocationIds" | "refugeForLocationIds", help: string, label: string) => (
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="mb-1 text-xs text-muted-foreground">{help}</p>
            <div className="flex flex-wrap gap-1.5">
              {others.map((o) => {
                const on = s?.[field].includes(o.id) ?? false;
                return <button key={o.id} onClick={() => void save(loc.id, { [field]: toggle(s?.[field] ?? [], o.id) })}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary")}>{o.name}</button>;
              })}
            </div>
          </div>
        );
        const source = (field: "aedSourceLocationId" | "crashCartSourceLocationId", label: string) => (
          <div>
            <label className="text-sm font-medium">{label}</label>
            <select className={`${inputCls} mt-1`} value={s?.[field] ?? ""} onChange={(e) => void save(loc.id, { [field]: e.target.value || null })}>
              <option value="">Not set</option>
              <option value={loc.id}>On site ({loc.name})</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        );
        return (
          <Card key={loc.id}>
            <CardContent className="grid gap-4 p-4 md:grid-cols-2">
              <div className="md:col-span-2 flex items-center justify-between">
                <p className="font-semibold">{loc.name}</p>
                {(loc.lat == null || loc.lng == null) && <Badge variant="warning">No coordinates — remote detection off</Badge>}
              </div>
              {pick("mutualAidLocationIds", "Staff at these sites are expected to come help. None = a standalone response zone.", "Mutual response with")}
              {pick("connectedLocationIds", "Shares a wall or building — a fire or threat here affects them too.", "Physically connected to")}
              {pick("refugeForLocationIds", "People from these sites may shelter here during an evacuation (when it's safe).", "Refuge for")}
              <div className="grid gap-3 sm:grid-cols-2">
                {source("aedSourceLocationId", "AED kept at")}
                {source("crashCartSourceLocationId", "Crash cart kept at")}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ================================================================ people */

function PeopleTab({ data }: { data: EmergencyData }) {
  const employeesQ = useCollection("employees");
  const [editing, setEditing] = useState<{ employeeId: string; name: string; userId: string | null } | null>(null);
  const people = useMemo(() => (employeesQ.data ?? [])
    .filter((e) => e.employmentStatus === "active" || e.employmentStatus === "on_leave")
    .map((e) => ({ e, p: data.profiles.find((p) => p.employeeId === e.id || (!!e.userId && p.userId === e.userId)) }))
    .sort((a, b) => Number(!!b.p) - Number(!!a.p) || `${a.e.firstName} ${a.e.lastName}`.localeCompare(`${b.e.firstName} ${b.e.lastName}`)),
  [employeesQ.data, data.profiles]);
  const withoutLogin = people.filter(({ e, p }) => p && !e.userId).length;

  return (
    <div className="space-y-3">
      {withoutLogin > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <KeyRound className="mt-0.5 size-4 shrink-0" />
          {withoutLogin} {withoutLogin === 1 ? "person has" : "people have"} an emergency profile but no Hub login yet, so they won&apos;t get alarms. Invite them from User Management — their setup here carries over automatically.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Usual role</th><th className="px-3 py-2">Where this week</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Audio</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {people.map(({ e, p }) => (
              <tr key={e.id}>
                <td className="px-3 py-2">
                  <p className="font-medium">{e.firstName} {e.lastName}</p>
                  <p className="text-xs text-muted-foreground">{e.userId ? "Has login" : "No login yet"}</p>
                </td>
                <td className="px-3 py-2">{p?.emergencyRole ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-xs">{p ? weekSummary(p, data) : <span className="text-muted-foreground">Not set up</span>}</td>
                <td className="px-3 py-2 text-xs">{p?.phone ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{p?.canListenAudio ? "Can listen" : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ employeeId: e.id, name: `${e.firstName} ${e.lastName}`, userId: e.userId ?? null })}>
                    {p ? <><Pencil /> Edit</> : <><Plus /> Set up</>}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <PersonDialog person={editing} profile={data.profiles.find((p) => p.employeeId === editing.employeeId || (!!editing.userId && p.userId === editing.userId)) ?? null}
          data={data} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function weekSummary(p: EmergencyResponderProfile, data: EmergencyData): string {
  const days = weekDays.slice(0, 5).map((d) => p.weeklySchedule[d]).filter(Boolean);
  if (!days.length) return data.locationName(p.defaultLocationId) ?? "—";
  const names = Array.from(new Set(days.map((id) => (id === "off" ? "Off" : data.locationName(id) ?? "?"))));
  return names.join(" / ");
}

function PersonDialog({ person, profile, data, onClose }: {
  person: { employeeId: string; name: string; userId: string | null };
  profile: EmergencyResponderProfile | null;
  data: EmergencyData;
  onClose: () => void;
}) {
  const create = useCreate("emergencyResponderProfiles");
  const update = useUpdate("emergencyResponderProfiles");
  const [f, setF] = useState({
    emergencyRole: profile?.emergencyRole ?? "", phone: profile?.phone ?? "",
    defaultLocationId: profile?.defaultLocationId ?? "", schedule: { ...(profile?.weeklySchedule ?? {}) } as Record<string, string>,
    canListenAudio: profile?.canListenAudio ?? false, seniority: profile?.seniority ?? "",
    defaults: { ...(profile?.codeDefaults ?? {}) },
  });
  const siteOptions = (
    <>
      <option value="">—</option>
      {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      <option value="remote">Remote</option>
    </>
  );
  const save = async () => {
    const patch = {
      employeeId: person.employeeId, userId: person.userId, fullName: person.name,
      emergencyRole: f.emergencyRole || null, phone: f.phone || null, defaultLocationId: f.defaultLocationId || null,
      weeklySchedule: Object.fromEntries(Object.entries(f.schedule).filter(([, v]) => v)),
      canListenAudio: f.canListenAudio, seniority: f.seniority === "" ? null : Number(f.seniority),
      codeDefaults: f.defaults, showInContacts: profile?.showInContacts ?? true,
    };
    try {
      if (profile) await update.mutateAsync({ id: profile.id, patch });
      else await create.mutateAsync(patch);
      toast.success("Saved.");
      onClose();
    } catch (e) { toast.error(`Couldn't save: ${e instanceof Error ? e.message : "error"}`); }
  };
  return (
    <Modal title={person.name} icon={<Users className="size-4 text-primary" />} onClose={onClose} wide
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className={labelCls}>Usual response role</label><input className={inputCls} value={f.emergencyRole} onChange={(e) => setF({ ...f, emergencyRole: e.target.value })} placeholder="General Support" /></div>
          <div><label className={labelCls}>Phone</label><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><label className={labelCls}>Seniority <span className="font-normal text-muted-foreground">(1–100)</span></label><input type="number" min={1} max={100} className={inputCls} value={f.seniority} onChange={(e) => setF({ ...f, seniority: e.target.value === "" ? "" : Number(e.target.value) })} /></div>
        </div>
        <div>
          <p className={labelCls}>Where they work</p>
          <p className="mb-2 text-xs text-muted-foreground">Used to decide who&apos;s expected to respond where. They can change today&apos;s site themselves on the Emergency page.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div><span className="text-xs text-muted-foreground">Usually</span><select className={inputCls} value={f.defaultLocationId} onChange={(e) => setF({ ...f, defaultLocationId: e.target.value })}>{siteOptions}</select></div>
            {weekDays.map((d) => (
              <div key={d}><span className="text-xs capitalize text-muted-foreground">{d}</span>
                <select className={inputCls} value={f.schedule[d] ?? ""} onChange={(e) => setF({ ...f, schedule: { ...f.schedule, [d]: e.target.value } })}>
                  {siteOptions}<option value="off">Off</option>
                </select></div>
            ))}
          </div>
        </div>
        <div>
          <p className={labelCls}>Prefill when they respond</p>
          <div className="space-y-2">
            {data.codes.map((c) => (
              <div key={c.id} className="grid items-center gap-2 sm:grid-cols-[120px_1fr_1fr]">
                <span className="text-sm font-medium" style={{ color: c.colorHex }}>{c.name}</span>
                <select className={inputCls} value={f.defaults[c.name]?.assistanceType ?? ""} onChange={(e) => setF({ ...f, defaults: { ...f.defaults, [c.name]: { ...f.defaults[c.name], assistanceType: e.target.value || undefined } } })}>
                  <option value="">How they help…</option>
                  {ASSISTANCE_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
                <input className={inputCls} placeholder="Usual ETA (e.g. 1 min)" value={f.defaults[c.name]?.estimatedArrival ?? ""} onChange={(e) => setF({ ...f, defaults: { ...f.defaults, [c.name]: { ...f.defaults[c.name], estimatedArrival: e.target.value || undefined } } })} />
              </div>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" checked={f.canListenAudio} onChange={(e) => setF({ ...f, canListenAudio: e.target.checked })} />
          <span>Can listen to live incident audio <span className="block text-xs text-muted-foreground">Admins can always listen and are the only ones whose devices keep recordings.</span></span>
        </label>
      </div>
    </Modal>
  );
}

/* ================================================================ site roles */

function RolesTab({ data }: { data: EmergencyData }) {
  const employeesQ = useCollection("employees");
  const create = useCreate("emergencyLocationRoles");
  const remove = useRemove("emergencyLocationRoles");
  const employees = (employeesQ.data ?? []).filter((e) => e.employmentStatus === "active");
  const [f, setF] = useState({ employeeId: "", locationId: "", codeName: "", responseRole: "", expected: "" });
  const nameOf = (employeeId?: string | null, userId?: string | null) => {
    const e = employees.find((x) => x.id === employeeId || (!!userId && x.userId === userId));
    return e ? `${e.firstName} ${e.lastName}` : "Unknown";
  };
  const add = async () => {
    const e = employees.find((x) => x.id === f.employeeId);
    try {
      await create.mutateAsync({ employeeId: f.employeeId, userId: e?.userId ?? null, locationId: f.locationId, codeName: f.codeName, responseRole: f.responseRole.trim(), expectedAssistance: f.expected.trim() || null });
      setF({ ...f, responseRole: "", expected: "" });
    } catch (err) { toast.error(`Couldn't add: ${err instanceof Error ? err.message : "error"}`); }
  };
  const bySite = data.locations.map((l) => ({ l, roles: data.locationRoles.filter((r) => r.locationId === l.id) }));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] sm:items-end">
          <div><span className="text-xs text-muted-foreground">Person</span><select className={inputCls} value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}><option value="">—</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select></div>
          <div><span className="text-xs text-muted-foreground">Site</span><select className={inputCls} value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}><option value="">—</option>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div><span className="text-xs text-muted-foreground">Code</span><select className={inputCls} value={f.codeName} onChange={(e) => setF({ ...f, codeName: e.target.value })}><option value="">—</option>{data.codes.map((c) => <option key={c.id}>{c.name}</option>)}</select></div>
          <div><span className="text-xs text-muted-foreground">Role</span><input className={inputCls} value={f.responseRole} onChange={(e) => setF({ ...f, responseRole: e.target.value })} placeholder="Primary Responder" list="role-suggestions" />
            <datalist id="role-suggestions">{Array.from(new Set(data.codes.flatMap((c) => c.requiredRoles))).map((r) => <option key={r} value={r} />)}</datalist></div>
          <div><span className="text-xs text-muted-foreground">Expected to</span><input className={inputCls} value={f.expected} onChange={(e) => setF({ ...f, expected: e.target.value })} placeholder="Start ACLS" /></div>
          <Button onClick={add} disabled={!f.employeeId || !f.locationId || !f.codeName || !f.responseRole.trim()}><Plus /> Add</Button>
        </CardContent>
      </Card>
      {bySite.map(({ l, roles }) => (
        <div key={l.id}>
          <p className="mb-1 text-sm font-semibold">{l.name}</p>
          {roles.length === 0 ? <p className="text-sm text-muted-foreground">No assignments.</p> : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
              {roles.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="font-medium">{nameOf(r.employeeId, r.userId)}</span>
                  <Badge variant="outline">{r.codeName}</Badge>
                  <span>{r.responseRole}</span>
                  {r.expectedAssistance && <span className="text-muted-foreground">— {r.expectedAssistance}</span>}
                  <Button size="icon" variant="ghost" className="ml-auto" aria-label="Remove" onClick={() => void remove.mutateAsync(r.id)}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
