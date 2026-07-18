"use client";

import { useState, useMemo } from "react";
import { UserCheck, Plus, X, AlertTriangle, ShieldCheck, ExternalLink, Upload } from "lucide-react";
import { useCollection, useCreate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { PersonLink } from "@/components/shared/person-link";
import { FileLink } from "@/components/shared/file-link";
import { uploadFile } from "@/lib/storage";
import { formatDate, dateInputToISO, daysUntil, todayInput } from "@/lib/dates";
import type { ExclusionScreening } from "@/lib/data/schema";
import { humanizeLabel } from "@/lib/format";
import { toast } from "sonner";

const DUE_DAYS = 30; // OIG recommends monthly exclusion screening
const RESULT_VARIANT: Record<string, "success" | "destructive" | "warning"> = { clear: "success", hit: "destructive", pending: "warning" };
const SOURCE_OPTIONS = ["OIG-LEIE", "SAM.gov", "State Medicaid"];

// Official exclusion databases. OIG-LEIE's search posts a form (no GET prefill),
// so we open the search page; SAM.gov accepts a keyword query we prefill.
function oigLeieUrl() {
  return "https://exclusions.oig.hhs.gov/";
}
function samGovUrl(name: string) {
  const base = "https://sam.gov/search/?index=_exclusions";
  return name.trim() ? `${base}&keywords=${encodeURIComponent(name.trim())}` : base;
}

interface Subject { key: string; name: string; type: "staff" | "vendor"; userId?: string; vendorId?: string; }

function LogDialog({ subjects, initialSubject, onClose, onSave, saving }: {
  subjects: Subject[];
  initialSubject?: Subject;
  onClose: () => void;
  onSave: (d: { subject: Subject | null; freeName: string; sources: string[]; screenedDate: string; result: ExclusionScreening["result"]; notes: string; file: File | null }) => void;
  saving: boolean;
}) {
  const [subjectKey, setSubjectKey] = useState(initialSubject?.key ?? (subjects[0]?.key ?? "__other__"));
  const [freeName, setFreeName] = useState("");
  const [sources, setSources] = useState<string[]>(["OIG-LEIE", "SAM.gov"]);
  const [screenedDate, setScreenedDate] = useState(todayInput());
  const [result, setResult] = useState<ExclusionScreening["result"]>("clear");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const subject = subjects.find((s) => s.key === subjectKey) ?? null;
  const subjectName = subject ? subject.name : freeName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
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

          <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
            <p className="text-xs font-medium">Run the check{subjectName.trim() ? ` for ${subjectName.trim()}` : ""}</p>
            <div className="flex flex-wrap gap-2">
              <a href={oigLeieUrl()} target="_blank" rel="noopener noreferrer">
                <Button type="button" size="sm" variant="outline"><ExternalLink className="size-3.5" /> OIG-LEIE</Button>
              </a>
              <a href={samGovUrl(subjectName)} target="_blank" rel="noopener noreferrer">
                <Button type="button" size="sm" variant="outline"><ExternalLink className="size-3.5" /> SAM.gov</Button>
              </a>
            </div>
            <p className="text-[11px] text-muted-foreground">Open each list, search the name, then record the result and upload the dated proof below. (SAM.gov opens pre-searched; OIG-LEIE opens its search page.)</p>
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Proof of screening {result === "hit" ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(recommended)</span>}</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
              <Upload className="size-4" />
              {file ? file.name : "Upload the OIG/SAM result PDF or screenshot"}
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <p className="text-[11px] text-muted-foreground">Attach the dated result page — this is the audit evidence that the check was actually performed.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ subject, freeName, sources, screenedDate, result, notes, file })} disabled={saving || (subjectKey === "__other__" && !freeName.trim())}>
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

  // Default order: subjects that are due for screening first.
  const dueFirst = useMemo(() => [...rows].sort((a, b) => Number(b.due) - Number(a.due)), [rows]);
  const subjectsSort = useSort(dueFirst, {
    subject: (r) => r.sub.name,
    type: (r) => r.sub.type,
    lastScreened: (r) => r.last?.screenedDate ?? null,
    result: (r) => r.last?.result ?? null,
    status: (r) => (r.due ? "Due" : "Current"),
  });

  const history = useMemo(
    () => [...screenings].sort((a, b) => (b.screenedDate ?? b.createdDate).localeCompare(a.screenedDate ?? a.createdDate)).slice(0, 50),
    [screenings],
  );
  const historySort = useSort(history, {
    subject: (s) => s.subjectName,
    date: (s) => s.screenedDate,
    lists: (s) => s.sources,
    result: (s) => s.result,
    by: (s) => s.screenedByName,
  });

  const stats = useMemo(() => {
    const dueNow = rows.filter((r) => r.due).length;
    const current = rows.length - dueNow;
    const coveragePct = rows.length ? Math.round((current / rows.length) * 100) : 0;
    const hits = screenings.filter((s) => s.result === "hit").length;
    return { dueNow, current, total: rows.length, coveragePct, hits };
  }, [rows, screenings]);

  async function save(d: { subject: Subject | null; freeName: string; sources: string[]; screenedDate: string; result: ExclusionScreening["result"]; notes: string; file: File | null }) {
    setSaving(true);
    try {
      const name = d.subject ? d.subject.name : d.freeName.trim();
      let documentUrl: string | null = null;
      if (d.file) {
        try {
          documentUrl = await uploadFile(d.file, "exclusion-screenings");
        } catch {
          toast.error("Couldn't upload the proof file. Logged without it — you can re-log with the document.");
        }
      }
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
        documentUrl,
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
        description="OIG-LEIE is the federal list of people excluded from Medicare/Medicaid; SAM.gov is the government-wide exclusion database. Screening both monthly is a federal expectation — log each check here and keep dated proof."
        actions={<Button onClick={() => setLogging(true)}><Plus className="size-4" /> Log screening</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Screening coverage" value={`${stats.current}/${stats.total}`} hint={`${stats.coveragePct}% of active subjects current`} icon={ShieldCheck} tone={stats.coveragePct === 100 ? "success" : stats.coveragePct >= 80 ? "default" : "warning"} loading={loading} />
        <StatCard label="Due for screening" value={stats.dueNow} icon={AlertTriangle} tone={stats.dueNow ? "warning" : "success"} loading={loading} />
        <StatCard label="Possible matches (hits)" value={stats.hits} icon={AlertTriangle} tone={stats.hits ? "destructive" : "default"} loading={loading} />
        <StatCard label="Active subjects" value={stats.total} icon={UserCheck} loading={loading} />
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
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Subject" sortKey="subject" sort={subjectsSort.sort} onToggle={subjectsSort.toggle} />
                    <SortHeader label="Type" sortKey="type" sort={subjectsSort.sort} onToggle={subjectsSort.toggle} />
                    <SortHeader label="Last screened" sortKey="lastScreened" sort={subjectsSort.sort} onToggle={subjectsSort.toggle} />
                    <SortHeader label="Result" sortKey="result" sort={subjectsSort.sort} onToggle={subjectsSort.toggle} />
                    <SortHeader label="Status" sortKey="status" sort={subjectsSort.sort} onToggle={subjectsSort.toggle} className="pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {subjectsSort.sorted.map(({ sub, last, daysAgo, due }) => (
                    <tr key={sub.key} className="cursor-pointer border-b border-border/50 hover:bg-secondary/20" onClick={() => setLogging(sub)}>
                      <td data-label="Subject" className="py-3 pr-4 font-medium">{sub.name}</td>
                      <td data-label="Type" className="py-3 pr-4 capitalize text-muted-foreground">{humanizeLabel(sub.type)}</td>
                      <td data-label="Last screened" className="py-3 pr-4 text-muted-foreground">{last?.screenedDate ? `${formatDate(last.screenedDate)}${daysAgo !== null ? ` · ${daysAgo}d ago` : ""}` : "Never"}</td>
                      <td data-label="Result" className="py-3 pr-4">{last ? <Badge variant={RESULT_VARIANT[last.result]} className="capitalize">{humanizeLabel(last.result)}</Badge> : "—"}</td>
                      <td data-label="Status" className="py-3">{due ? <Badge variant="warning">Due</Badge> : <Badge variant="success">Current</Badge>}</td>
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
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Subject" sortKey="subject" sort={historySort.sort} onToggle={historySort.toggle} />
                    <SortHeader label="Date" sortKey="date" sort={historySort.sort} onToggle={historySort.toggle} />
                    <SortHeader label="Lists" sortKey="lists" sort={historySort.sort} onToggle={historySort.toggle} />
                    <SortHeader label="Result" sortKey="result" sort={historySort.sort} onToggle={historySort.toggle} />
                    <SortHeader label="By" sortKey="by" sort={historySort.sort} onToggle={historySort.toggle} />
                    <th className="pb-2 pr-0 font-medium">Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {historySort.sorted.map((s) => (
                    <tr key={s.id} className="border-b border-border/50">
                      <td data-label="Subject" className="py-2.5 pr-4"><PersonLink userId={s.subjectUserId ?? null} name={s.subjectName} /></td>
                      <td data-label="Date" className="py-2.5 pr-4 text-muted-foreground">{formatDate(s.screenedDate)}</td>
                      <td data-label="Lists" className="py-2.5 pr-4 text-muted-foreground">{s.sources ?? "—"}</td>
                      <td data-label="Result" className="py-2.5 pr-4"><Badge variant={RESULT_VARIANT[s.result]} className="capitalize">{humanizeLabel(s.result)}</Badge></td>
                      <td data-label="By" className="py-2.5 pr-4 text-muted-foreground">{s.screenedByName ?? "—"}</td>
                      <td data-label="Proof" className="py-2.5">{s.documentUrl ? <FileLink path={s.documentUrl} label="View" className="text-primary hover:underline" /> : <span className="text-muted-foreground">—</span>}</td>
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
