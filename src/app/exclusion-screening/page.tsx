"use client";

import { useState, useMemo } from "react";
import { UserCheck, Plus, X, AlertTriangle, ShieldCheck } from "lucide-react";
import { useCollection, useCreate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import { formatDate, dateInputToISO, daysUntil } from "@/lib/dates";
import type { ExclusionScreening } from "@/lib/data/schema";
import { toast } from "sonner";

const DUE_DAYS = 30; // OIG recommends monthly exclusion screening
const RESULT_VARIANT: Record<string, "success" | "destructive" | "warning"> = { clear: "success", hit: "destructive", pending: "warning" };
const SOURCE_OPTIONS = ["OIG-LEIE", "SAM.gov", "State Medicaid"];

interface Subject { key: string; name: string; type: "staff" | "vendor"; userId?: string; vendorId?: string; }

function LogDialog({ subjects, initialSubject, onClose, onSave, saving }: {
  subjects: Subject[];
  initialSubject?: Subject;
  onClose: () => void;
  onSave: (d: { subject: Subject | null; freeName: string; sources: string[]; screenedDate: string; result: ExclusionScreening["result"]; notes: string }) => void;
  saving: boolean;
}) {
  const [subjectKey, setSubjectKey] = useState(initialSubject?.key ?? (subjects[0]?.key ?? "__other__"));
  const [freeName, setFreeName] = useState("");
  const [sources, setSources] = useState<string[]>(["OIG-LEIE", "SAM.gov"]);
  const [screenedDate, setScreenedDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<ExclusionScreening["result"]>("clear");
  const [notes, setNotes] = useState("");

  const subject = subjects.find((s) => s.key === subjectKey) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Log exclusion screening</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Subject</label>
            <select className="input w-full" value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)}>
              {subjects.map((s) => <option key={s.key} value={s.key}>{s.name} ({s.type})</option>)}
              <option value="__other__">Other (enter name)</option>
            </select>
            {subjectKey === "__other__" && <input className="input mt-2 w-full" placeholder="Name" value={freeName} onChange={(e) => setFreeName(e.target.value)} />}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Lists checked</label>
            <div className="flex flex-wrap gap-3">
              {SOURCE_OPTIONS.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={sources.includes(s)} onChange={(e) => setSources((prev) => e.target.checked ? [...prev, s] : prev.filter((x) => x !== s))} className="size-4" />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date screened</label>
              <input type="date" className="input w-full" value={screenedDate} onChange={(e) => setScreenedDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Result</label>
              <select className="input w-full" value={result} onChange={(e) => setResult(e.target.value as ExclusionScreening["result"])}>
                <option value="clear">Clear — no match</option><option value="hit">Hit — possible match</option><option value="pending">Pending</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <input className="input w-full" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reference #, reviewer, resolution…" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ subject, freeName, sources, screenedDate, result, notes })} disabled={saving || (subjectKey === "__other__" && !freeName.trim())}>
            {saving ? "Saving…" : "Log screening"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ExclusionScreeningPage() {
  const { profile } = useAuth();
  const screeningsQ = useCollection("exclusionScreenings");
  const employeesQ = useCollection("employees");
  const vendorsQ = useCollection("vendors");
  const createMut = useCreate("exclusionScreenings");

  const [logging, setLogging] = useState<Subject | true | null>(null);
  const [saving, setSaving] = useState(false);

  const screenings = useMemo(() => screeningsQ.data ?? [], [screeningsQ.data]);

  const subjects = useMemo<Subject[]>(() => {
    const staff = (employeesQ.data ?? [])
      .filter((e) => e.employmentStatus === "active")
      .map((e) => ({ key: `s:${e.id}`, name: `${e.firstName} ${e.lastName}`.trim(), type: "staff" as const, userId: e.userId ?? undefined }));
    const vendors = (vendorsQ.data ?? [])
      .filter((v) => v.status !== "terminated")
      .map((v) => ({ key: `v:${v.id}`, name: v.vendorName, type: "vendor" as const, vendorId: v.id }));
    return [...staff, ...vendors];
  }, [employeesQ.data, vendorsQ.data]);

  // Latest screening per subject (match by id link, else by name).
  function latestFor(sub: Subject): ExclusionScreening | null {
    const matches = screenings.filter((sc) =>
      (sub.userId && sc.subjectUserId === sub.userId) ||
      (sub.vendorId && sc.vendorId === sub.vendorId) ||
      sc.subjectName.toLowerCase() === sub.name.toLowerCase());
    if (matches.length === 0) return null;
    return matches.sort((a, b) => (b.screenedDate ?? b.createdDate).localeCompare(a.screenedDate ?? a.createdDate))[0];
  }

  const rows = useMemo(() => subjects.map((sub) => {
    const last = latestFor(sub);
    const days = last?.screenedDate ? daysUntil(last.screenedDate) : null; // negative = days ago
    const daysAgo = days === null ? null : -days;
    const due = !last || daysAgo === null || daysAgo > DUE_DAYS;
    return { sub, last, daysAgo, due };
  }), [subjects, screenings]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const dueNow = rows.filter((r) => r.due).length;
    const hits = screenings.filter((s) => s.result === "hit").length;
    const thisMonth = screenings.filter((s) => { const d = daysUntil(s.screenedDate); return d !== null && -d <= 30; }).length;
    return { dueNow, hits, thisMonth };
  }, [rows, screenings]);

  async function save(d: { subject: Subject | null; freeName: string; sources: string[]; screenedDate: string; result: ExclusionScreening["result"]; notes: string }) {
    setSaving(true);
    try {
      const name = d.subject ? d.subject.name : d.freeName.trim();
      await createMut.mutateAsync({
        subjectType: d.subject?.type ?? "other",
        subjectName: name,
        subjectUserId: d.subject?.userId ?? null,
        vendorId: d.subject?.vendorId ?? null,
        sources: d.sources.join(", ") || undefined,
        screenedDate: d.screenedDate ? dateInputToISO(d.screenedDate) : null,
        result: d.result,
        notes: d.notes.trim() || undefined,
        screenedByName: profile?.fullName || undefined,
      });
      toast.success("Screening logged");
      setLogging(null);
    } catch { toast.error("Couldn't log the screening."); }
    finally { setSaving(false); }
  }

  if (screeningsQ.isError) return <div className="space-y-6"><PageHeader title="Exclusion Screening" /><ErrorState message="We couldn't load screenings." onRetry={() => void screeningsQ.refetch()} /></div>;

  const loading = screeningsQ.isLoading || employeesQ.isLoading || vendorsQ.isLoading;

  return (
    <div className="space-y-6">
      {logging && <LogDialog subjects={subjects} initialSubject={logging === true ? undefined : logging} onClose={() => setLogging(null)} onSave={save} saving={saving} />}

      <PageHeader
        title="Exclusion Screening"
        description="Screen staff and vendors against the OIG-LEIE and SAM exclusion lists (recommended monthly) and keep dated proof of every check."
        actions={<Button onClick={() => setLogging(true)}><Plus className="size-4" /> Log screening</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Due for screening" value={stats.dueNow} icon={AlertTriangle} tone={stats.dueNow ? "warning" : "success"} loading={loading} />
        <StatCard label="Possible matches (hits)" value={stats.hits} icon={AlertTriangle} tone={stats.hits ? "destructive" : "default"} loading={loading} />
        <StatCard label="Screened in last 30 days" value={stats.thisMonth} icon={ShieldCheck} loading={loading} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Subjects & screening status</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Add employees and vendors first, then screen them here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Subject</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Last screened</th>
                    <th className="pb-2 pr-4 font-medium">Result</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.sort((a, b) => Number(b.due) - Number(a.due)).map(({ sub, last, daysAgo, due }) => (
                    <tr key={sub.key} className="cursor-pointer border-b border-border/50 hover:bg-secondary/20" onClick={() => setLogging(sub)}>
                      <td className="py-3 pr-4 font-medium">{sub.name}</td>
                      <td className="py-3 pr-4 capitalize text-muted-foreground">{sub.type}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{last?.screenedDate ? `${formatDate(last.screenedDate)}${daysAgo !== null ? ` · ${daysAgo}d ago` : ""}` : "Never"}</td>
                      <td className="py-3 pr-4">{last ? <Badge variant={RESULT_VARIANT[last.result]} className="capitalize">{last.result}</Badge> : "—"}</td>
                      <td className="py-3">{due ? <Badge variant="warning">Due</Badge> : <Badge variant="success">Current</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {screenings.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Screening history</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Subject</th>
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Lists</th>
                    <th className="pb-2 pr-4 font-medium">Result</th>
                    <th className="pb-2 font-medium">By</th>
                  </tr>
                </thead>
                <tbody>
                  {[...screenings].sort((a, b) => (b.screenedDate ?? b.createdDate).localeCompare(a.screenedDate ?? a.createdDate)).slice(0, 50).map((s) => (
                    <tr key={s.id} className="border-b border-border/50">
                      <td className="py-2.5 pr-4">{s.subjectName}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{formatDate(s.screenedDate)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{s.sources ?? "—"}</td>
                      <td className="py-2.5 pr-4"><Badge variant={RESULT_VARIANT[s.result]} className="capitalize">{s.result}</Badge></td>
                      <td className="py-2.5 text-muted-foreground">{s.screenedByName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
