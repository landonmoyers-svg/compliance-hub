"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { Building2, MapPin, Plus, X, Trash2 } from "lucide-react";
import { useCollection, useCreate, useUpdate, useRemove } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import type { OrganizationSettings, WorkLocation } from "@/lib/data/schema";
import { DEFAULT_ORG_NAME } from "@/lib/org";
import { allPages, allowedRolesFor, SELECTABLE_ROLES, RECOVERY_PATHS } from "@/lib/nav";
import { humanizeLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

const ROLE_SHORT: Record<string, string> = { owner: "Owner", admin: "Admin", hr: "HR", clinical_leadership: "Clinical", manager: "Mgr", staff: "Staff", contractor: "Contr", read_only: "Read" };

type Tab = "organization" | "locations" | "access" | "security" | "notifications";

const TABS: { id: Tab; label: string }[] = [
  { id: "organization", label: "Organization" },
  { id: "locations", label: "Locations" },
  { id: "access", label: "Modules & Access" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
];

interface OrgForm {
  orgName: string; address: string; phone: string; website: string;
  npiNumber: string; taxId: string; documentRetentionYears: string; auditRetentionYears: string;
  sessionTimeoutMinutes: string; requireTwoFactor: boolean; passwordMinLength: string;
  credentialReminderDays: string; trainingReminderDays: string;
  insuranceReminderDays: string; emailNotifications: boolean;
}

function toForm(s: OrganizationSettings | undefined): OrgForm {
  return {
    orgName: s?.orgName ?? DEFAULT_ORG_NAME,
    address: s?.address ?? "", phone: s?.phone ?? "", website: s?.website ?? "",
    npiNumber: s?.npiNumber ?? "", taxId: s?.taxId ?? "",
    documentRetentionYears: String(s?.documentRetentionYears ?? 7),
    auditRetentionYears: String(s?.auditRetentionYears ?? 7),
    sessionTimeoutMinutes: String(s?.sessionTimeoutMinutes ?? 30),
    requireTwoFactor: s?.requireTwoFactor ?? false,
    passwordMinLength: String(s?.passwordMinLength ?? 12),
    credentialReminderDays: String(s?.credentialReminderDays ?? 30),
    trainingReminderDays: String(s?.trainingReminderDays ?? 14),
    insuranceReminderDays: String(s?.insuranceReminderDays ?? 60),
    emailNotifications: s?.emailNotifications ?? true,
  };
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("organization");

  const settingsQ = useCollection("organizationSettings");
  const createSettings = useCreate("organizationSettings");
  const updateSettings = useUpdate("organizationSettings");

  const current = useMemo(() => (settingsQ.data ?? [])[0], [settingsQ.data]);
  const [form, setForm] = useState<OrgForm>(toForm(undefined));
  const [saving, setSaving] = useState(false);

  // Hydrate the form once settings load.
  useEffect(() => { setForm(toForm(current)); }, [current]);

  async function persist(patch: Partial<OrganizationSettings>, label: string) {
    setSaving(true);
    try {
      if (current) {
        await updateSettings.mutateAsync({ id: current.id, patch });
      } else {
        await createSettings.mutateAsync({
          orgName: form.orgName.trim() || DEFAULT_ORG_NAME,
          documentRetentionYears: parseInt(form.documentRetentionYears, 10) || 7,
          auditRetentionYears: parseInt(form.auditRetentionYears, 10) || 7,
          sessionTimeoutMinutes: parseInt(form.sessionTimeoutMinutes, 10) || 30,
          requireTwoFactor: form.requireTwoFactor,
          passwordMinLength: parseInt(form.passwordMinLength, 10) || 12,
          credentialReminderDays: parseInt(form.credentialReminderDays, 10) || 30,
          trainingReminderDays: parseInt(form.trainingReminderDays, 10) || 14,
          insuranceReminderDays: parseInt(form.insuranceReminderDays, 10) || 60,
          emailNotifications: form.emailNotifications,
          pageRoles: {},
          disabledPages: [],
          defaultAccountRole: "staff",
          ...patch,
        });
      }
      toast.success(`${label} saved`);
    } catch {
      toast.error(`Failed to save ${label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    const retention = parseInt(form.documentRetentionYears, 10);
    if (isNaN(retention) || retention < 1) { toast.error("Document retention must be at least 1 year"); return; }
    const auditRetention = parseInt(form.auditRetentionYears, 10);
    if (isNaN(auditRetention) || auditRetention < 1) { toast.error("Audit log retention must be at least 1 year"); return; }
    void persist({
      orgName: form.orgName.trim(), address: form.address.trim() || undefined,
      phone: form.phone.trim() || undefined, website: form.website.trim() || undefined,
      npiNumber: form.npiNumber.trim() || undefined, taxId: form.taxId.trim() || undefined,
      documentRetentionYears: retention,
      auditRetentionYears: auditRetention,
    }, "Organization settings");
  }

  function saveSecurity(e: React.FormEvent) {
    e.preventDefault();
    const timeout = parseInt(form.sessionTimeoutMinutes, 10);
    const minLen = parseInt(form.passwordMinLength, 10);
    if (isNaN(timeout) || timeout < 5) { toast.error("Session timeout must be at least 5 minutes"); return; }
    if (isNaN(minLen) || minLen < 8) { toast.error("Minimum password length must be at least 8"); return; }
    void persist({ sessionTimeoutMinutes: timeout, passwordMinLength: minLen, requireTwoFactor: form.requireTwoFactor }, "Security settings");
  }

  function saveNotifications(e: React.FormEvent) {
    e.preventDefault();
    void persist({
      credentialReminderDays: parseInt(form.credentialReminderDays, 10) || 30,
      trainingReminderDays: parseInt(form.trainingReminderDays, 10) || 14,
      insuranceReminderDays: parseInt(form.insuranceReminderDays, 10) || 60,
      emailNotifications: form.emailNotifications,
    }, "Notification settings");
  }

  const loading = settingsQ.isLoading;

  if (settingsQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <ErrorState message="We couldn't load this page's data." onRetry={() => void settingsQ.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure your organization profile, locations, security policies, and notification preferences." />

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "organization" && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4 text-muted-foreground" /> Organization</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-64 w-full" /> : (
              <form onSubmit={saveOrg} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">Organization name *</label>
                  <input className="input w-full" value={form.orgName} onChange={(e) => setForm((p) => ({ ...p, orgName: e.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">Address</label>
                  <input className="input w-full" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Street address" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Phone</label>
                  <input className="input w-full" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="(555) 000-0000" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Website</label>
                  <input type="url" className="input w-full" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} placeholder="https://…" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">NPI number</label>
                  <input className="input w-full" value={form.npiNumber} onChange={(e) => setForm((p) => ({ ...p, npiNumber: e.target.value }))} placeholder="10-digit NPI" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tax ID (EIN)</label>
                  <input className="input w-full" value={form.taxId} onChange={(e) => setForm((p) => ({ ...p, taxId: e.target.value }))} placeholder="XX-XXXXXXX" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Document retention (years)</label>
                  <input type="number" min="1" className="input w-full" value={form.documentRetentionYears} onChange={(e) => setForm((p) => ({ ...p, documentRetentionYears: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Audit log retention (years)</label>
                  <input type="number" min="1" className="input w-full" value={form.auditRetentionYears} onChange={(e) => setForm((p) => ({ ...p, auditRetentionYears: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Access-log entries are kept this long, then automatically purged monthly.</p>
                </div>
                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save organization settings"}</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "locations" && <LocationsTab />}

      {tab === "access" && <PageAccessTab current={current} onSave={(patch) => persist(patch, "Access")} saving={saving} />}

      {tab === "security" && (
        <Card>
          <CardHeader><CardTitle>Security</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-40 w-full" /> : (
              <form onSubmit={saveSecurity} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Session timeout (minutes)</label>
                  <input type="number" min="5" className="input w-full" value={form.sessionTimeoutMinutes} onChange={(e) => setForm((p) => ({ ...p, sessionTimeoutMinutes: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Minimum 5 minutes</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Min. password length</label>
                  <input type="number" min="8" className="input w-full" value={form.passwordMinLength} onChange={(e) => setForm((p) => ({ ...p, passwordMinLength: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <input id="2fa" type="checkbox" checked={form.requireTwoFactor} onChange={(e) => setForm((p) => ({ ...p, requireTwoFactor: e.target.checked }))} className="size-4" />
                  <label htmlFor="2fa" className="text-sm">Require two-factor authentication for all users</label>
                </div>
                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save security settings"}</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "notifications" && (
        <Card>
          <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-40 w-full" /> : (
              <form onSubmit={saveNotifications} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Credential reminder (days before expiry)</label>
                  <input type="number" min="1" className="input w-full" value={form.credentialReminderDays} onChange={(e) => setForm((p) => ({ ...p, credentialReminderDays: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Training reminder (days before due)</label>
                  <input type="number" min="1" className="input w-full" value={form.trainingReminderDays} onChange={(e) => setForm((p) => ({ ...p, trainingReminderDays: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Insurance renewal reminder (days before)</label>
                  <input type="number" min="1" className="input w-full" value={form.insuranceReminderDays} onChange={(e) => setForm((p) => ({ ...p, insuranceReminderDays: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <input id="email-notif" type="checkbox" checked={form.emailNotifications} onChange={(e) => setForm((p) => ({ ...p, emailNotifications: e.target.checked }))} className="size-4" />
                  <label htmlFor="email-notif" className="text-sm">Send email notifications</label>
                </div>
                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save notification settings"}</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Locations management ──────────────────────────────────────── */

interface LocForm { name: string; type: WorkLocation["type"]; city: string; state: string; address: string; active: boolean; lat: string; lng: string; }
const EMPTY_LOC: LocForm = { name: "", type: "clinic", city: "", state: "", address: "", active: true, lat: "", lng: "" };

function LocationsTab() {
  const { data, isLoading } = useCollection("locations");
  const createLoc = useCreate("locations");
  const updateLoc = useUpdate("locations");
  const removeLoc = useRemove("locations");

  const locations = useMemo(() => data ?? [], [data]);
  const [editing, setEditing] = useState<WorkLocation | null | "new">(null);
  const [form, setForm] = useState<LocForm>(EMPTY_LOC);
  const [saving, setSaving] = useState(false);

  const [locating, setLocating] = useState(false);

  function open(loc?: WorkLocation) {
    setForm(loc ? { name: loc.name, type: loc.type, city: loc.city ?? "", state: loc.state ?? "", address: loc.address ?? "", active: loc.active, lat: loc.lat != null ? String(loc.lat) : "", lng: loc.lng != null ? String(loc.lng) : "" } : EMPTY_LOC);
    setEditing(loc ?? "new");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { toast.error("Geolocation isn't available in this browser."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((p) => ({ ...p, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        setLocating(false);
        toast.success("Captured this location's coordinates.");
      },
      () => { setLocating(false); toast.error("Couldn't get your location. Allow location access and try again."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Location name is required."); return; }
    setSaving(true);
    try {
      const latNum = form.lat.trim() === "" ? null : parseFloat(form.lat);
      const lngNum = form.lng.trim() === "" ? null : parseFloat(form.lng);
      const payload = {
        name: form.name.trim(), type: form.type,
        city: form.city.trim() || undefined, state: form.state.trim() || undefined,
        address: form.address.trim() || undefined, active: form.active,
        lat: latNum != null && !isNaN(latNum) ? latNum : null,
        lng: lngNum != null && !isNaN(lngNum) ? lngNum : null,
      };
      if (editing && editing !== "new") await updateLoc.mutateAsync({ id: editing.id, patch: payload });
      else await createLoc.mutateAsync(payload);
      toast.success("Location saved");
      setEditing(null);
    } catch {
      toast.error("Failed to save location.");
    } finally { setSaving(false); }
  }

  async function remove(loc: WorkLocation) {
    try { await removeLoc.mutateAsync(loc.id); toast.success("Location removed"); }
    catch { toast.error("Failed to remove location."); }
  }

  return (
    <Card>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">{editing === "new" ? "Add location" : "Edit location"}</h2>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Name *</label>
                <input className="input w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Lehi Clinic" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <select className="input w-full" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as WorkLocation["type"] }))}>
                  {(["clinic", "office", "remote", "other"] as const).map((t) => <option key={t} value={t}>{humanizeLabel(t)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">City</label>
                <input className="input w-full" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">State</label>
                <input className="input w-full" value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} placeholder="UT" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Address</label>
                <input className="input w-full" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Coordinates <span className="text-muted-foreground">— lets photo GPS auto-suggest this location</span></label>
                  <Button type="button" size="sm" variant="outline" onClick={useCurrentLocation} disabled={locating} className="h-7 px-2 text-xs">
                    <MapPin className="size-3.5" /> {locating ? "Locating…" : "Use my current location"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input className="input w-full" value={form.lat} onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))} placeholder="Latitude" inputMode="decimal" />
                  <input className="input w-full" value={form.lng} onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))} placeholder="Longitude" inputMode="decimal" />
                </div>
                <p className="text-xs text-muted-foreground">Tip: open this on a phone while standing at the location and tap “Use my current location”.</p>
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <input id="loc-active" type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} className="size-4" />
                <label htmlFor="loc-active" className="text-sm">Active</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" /> Locations</CardTitle>
          <Button size="sm" onClick={() => open()}><Plus className="size-4" /> Add location</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : locations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No locations yet. Add your clinic and office locations so records can be assigned to them.</p>
        ) : (
          <ul className="divide-y divide-border">
            {locations.map((loc) => (
              <li key={loc.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{loc.name}</p>
                    <Badge variant="outline" className="capitalize">{humanizeLabel(loc.type)}</Badge>
                    {!loc.active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{[loc.city, loc.state].filter(Boolean).join(", ") || "—"}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => open(loc)}>Edit</Button>
                  <button onClick={() => { if (!window.confirm(`Delete location "${loc.name}"? Records that reference it keep their data but lose the link.`)) return; remove(loc); }} className="rounded-md p-1.5 text-muted-foreground hover:text-destructive" aria-label="Remove location"><Trash2 className="size-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Modules & Access (page × role matrix + org module toggles) ─── */

function PageAccessTab({ current, onSave, saving }: {
  current?: OrganizationSettings;
  onSave: (patch: Partial<OrganizationSettings>) => void | Promise<void>;
  saving: boolean;
}) {
  const pages = useMemo(() => allPages(), []);
  const groups = useMemo(() => Array.from(new Set(pages.map((p) => p.group))), [pages]);
  const [pageRoles, setPageRoles] = useState<Record<string, string[]>>(current?.pageRoles ?? {});
  const [disabled, setDisabled] = useState<Set<string>>(new Set(current?.disabledPages ?? []));
  const [defaultRole, setDefaultRole] = useState<string>(current?.defaultAccountRole ?? "staff");

  useEffect(() => { setPageRoles(current?.pageRoles ?? {}); setDisabled(new Set(current?.disabledPages ?? [])); setDefaultRole(current?.defaultAccountRole ?? "staff"); }, [current]);

  const rolesFor = (href: string, adminOnly: boolean) => allowedRolesFor(href, adminOnly, pageRoles);
  function toggleRole(href: string, adminOnly: boolean, role: string) {
    // The Owner always keeps access to every page — it can't be locked out.
    if (role === "owner") return;
    setPageRoles((pr) => {
      const cur = pr[href] ?? allowedRolesFor(href, adminOnly, pr);
      const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
      // Owner is implicit-always; never persist it out of the list.
      return { ...pr, [href]: next.includes("owner") ? next : ["owner", ...next] };
    });
  }
  function toggleEnabled(href: string) {
    // Recovery pages (Settings, Role Permissions, User Management) can never be
    // turned off — that's the door back in if access is misconfigured.
    if (RECOVERY_PATHS.includes(href)) return;
    setDisabled((d) => {
      const n = new Set(d);
      if (n.has(href)) {
        n.delete(href);
      } else {
        if (!confirm(`Turn off “${allPages().find((p) => p.href === href)?.label ?? href}” for the whole organization?\n\nThis hides the page for every role except the Owner. Owners always keep access so you can turn it back on here.`)) {
          return d;
        }
        n.add(href);
      }
      return n;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modules & Access</CardTitle>
        <p className="text-sm text-muted-foreground">The <span className="font-medium text-foreground">Enabled</span> column turns a whole module on or off for your <span className="font-medium text-foreground">entire organization</span>. The role columns set which roles can open a page. The <span className="font-medium text-foreground">Owner always keeps access</span> to every page, so you can never lock yourself out. Enforced app-wide; this doesn’t replace the data-level protections.</p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 px-4 py-3">
          <label className="text-sm font-medium" htmlFor="default-role">Default role for new invited users</label>
          <select id="default-role" className="input h-9 w-56" value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)}>
            {SELECTABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_SHORT[r] ?? r}</option>)}
          </select>
          <p className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">Applied when the Setup Concierge or an admin invites someone without picking a role. Roles can always be changed afterward.</p>
        </div>
        <div className="mb-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => { setPageRoles({}); setDisabled(new Set()); setDefaultRole("staff"); }}>Reset to defaults</Button>
          <Button size="sm" onClick={() => void onSave({ pageRoles, disabledPages: [...disabled], defaultAccountRole: defaultRole })} disabled={saving}>{saving ? "Saving…" : "Save access"}</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-3 font-medium">Page</th>
                <th className="px-2 pb-2 text-center text-xs font-medium">Enabled</th>
                {SELECTABLE_ROLES.map((r) => <th key={r} className="px-1.5 pb-2 text-center text-xs font-medium">{ROLE_SHORT[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((grp) => (
                <Fragment key={grp}>
                  <tr><td colSpan={SELECTABLE_ROLES.length + 2} className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{grp}</td></tr>
                  {pages.filter((p) => p.group === grp).map((p) => {
                    const enabled = !disabled.has(p.href);
                    const allowed = rolesFor(p.href, p.adminOnly);
                    const isRecovery = RECOVERY_PATHS.includes(p.href);
                    return (
                      <tr key={p.href} className={cn("border-b border-border/50", !enabled && "opacity-50")}>
                        <td className="py-2 pr-3">
                          {p.label}
                          {isRecovery && <span className="ml-1.5 align-middle text-[10px] font-medium text-muted-foreground" title="Always available to the Owner to prevent lock-out">🔒</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" className="size-4" checked={enabled} disabled={isRecovery} onChange={() => toggleEnabled(p.href)}
                            title={isRecovery ? "This page can't be turned off — it's how you manage access." : undefined} />
                        </td>
                        {SELECTABLE_ROLES.map((r) => {
                          const isOwner = r === "owner";
                          return (
                            <td key={r} className="px-1.5 py-2 text-center">
                              <input type="checkbox" className="size-4"
                                disabled={(!enabled && !isOwner) || isOwner}
                                checked={isOwner ? true : allowed.includes(r)}
                                onChange={() => toggleRole(p.href, p.adminOnly, r)}
                                title={isOwner ? "The Owner always has access" : undefined} />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
