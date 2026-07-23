"use client";

import { useMemo, useState, useRef } from "react";
import { GraduationCap, Plus, ChevronRight, Upload, Pencil, Trash2, AlertTriangle, Sparkles } from "lucide-react";
import { analyzableMedia, blobToBase64 } from "@/lib/ai/file-bytes";
import { useCollection, useCreate, useUpdate, useRemove } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import { FileLink } from "@/components/shared/file-link";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";
import { uploadFile } from "@/lib/storage";
import { inferProviderType } from "@/lib/credential-requirements";
import { summarizeCe, CE_CATEGORY_LABEL } from "@/lib/ce";
import { ceCategories, type CeCategory, type CeRecord, type Employee } from "@/lib/data/schema";

const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

interface CeForm {
  employeeUserId: string | null;
  employeeName: string;
  title: string;
  provider: string;
  hours: string;
  category: CeCategory;
  appliesTo: string;
  completedDate: string;
  notes: string;
}

const EMPTY: CeForm = { employeeUserId: null, employeeName: "", title: "", provider: "", hours: "", category: "general", appliesTo: "", completedDate: "", notes: "" };

export default function ContinuingEducationPage() {
  const ceQ = useCollection("ceRecords");
  const employeesQ = useCollection("employees");
  const createMut = useCreate("ceRecords");
  const updateMut = useUpdate("ceRecords");
  const removeMut = useRemove("ceRecords");

  const [editing, setEditing] = useState<CeRecord | "new" | null>(null);
  const [prefill, setPrefill] = useState<Partial<CeForm> | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const records = useMemo(() => ceQ.data ?? [], [ceQ.data]);
  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);

  // Records for one person: by stable user id, else normalized name.
  const recordsFor = (e: Employee) =>
    records.filter((r) =>
      (e.userId && r.employeeUserId && r.employeeUserId === e.userId) ||
      norm(r.employeeName) === norm(`${e.firstName} ${e.lastName}`));

  const clinicians = useMemo(
    () => employees
      .filter((e) => e.employmentStatus === "active" || e.employmentStatus === "on_leave")
      .filter((e) => inferProviderType(e.jobRole, e.title) !== "none")
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)),
    [employees],
  );

  // CE logged for people who aren't matched to an active clinician card.
  const clinicianKeys = useMemo(() => new Set(clinicians.flatMap((e) => [e.userId, norm(`${e.firstName} ${e.lastName}`)].filter(Boolean))), [clinicians]);
  const otherRecords = useMemo(
    () => records.filter((r) => !clinicianKeys.has(r.employeeUserId ?? "") && !clinicianKeys.has(norm(r.employeeName))),
    [records, clinicianKeys],
  );
  const otherByPerson = useMemo(() => {
    const m = new Map<string, CeRecord[]>();
    for (const r of otherRecords) { const k = r.employeeName || "Unassigned"; const a = m.get(k); if (a) a.push(r); else m.set(k, [r]); }
    return [...m.entries()];
  }, [otherRecords]);

  const toggle = (k: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  function logFor(e?: Employee) {
    setPrefill(e ? { employeeUserId: e.userId ?? null, employeeName: `${e.firstName} ${e.lastName}`.trim() } : null);
    setEditing("new");
  }

  if (ceQ.isError) {
    return <div className="space-y-6"><PageHeader title="Continuing Education" /><ErrorState message="We couldn't load CE records." onRetry={() => void ceQ.refetch()} /></div>;
  }
  const loading = ceQ.isLoading || employeesQ.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Continuing Education"
        description="Track CE hours per clinician against their renewal cycle. Targets are sensible Utah defaults — verify against current board rules."
        actions={<Button onClick={() => logFor()}><Plus className="size-4" /> Log CE</Button>}
      />

      {editing && (
        <CeDialog
          initial={editing === "new" ? undefined : editing}
          prefill={editing === "new" ? (prefill ?? undefined) : undefined}
          employees={employees}
          onClose={() => { setEditing(null); setPrefill(null); }}
          onSaved={() => { setEditing(null); setPrefill(null); void ceQ.refetch(); }}
          createMut={createMut}
          updateMut={updateMut}
        />
      )}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (
        <>
          {clinicians.length === 0 && otherByPerson.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No clinical staff found. Log CE with the button above, or add clinical roles in Employees.
            </p>
          )}

          <div className="space-y-3">
            {clinicians.map((e) => {
              const recs = recordsFor(e).sort((a, b) => (b.completedDate ?? "").localeCompare(a.completedDate ?? ""));
              const type = inferProviderType(e.jobRole, e.title);
              const s = summarizeCe(recs, type);
              const key = e.id;
              const isOpen = open.has(key);
              const met = s.target ? s.totalHours >= s.target.hours && s.pharmacologyMet : true;
              return (
                <Card key={key}>
                  <div className="flex items-center gap-3 p-4">
                    <button type="button" onClick={() => toggle(key)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{e.firstName} {e.lastName}</span>
                          {s.target && <Badge variant="secondary">{s.target.label}</Badge>}
                          {s.target && <Badge variant={met ? "success" : "warning"}>{met ? "On track" : `${s.remaining} hr${s.remaining === 1 ? "" : "s"} to go`}</Badge>}
                        </div>
                        {s.target ? (
                          <>
                            <div className="mt-1.5 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-secondary">
                              <div className={cn("h-full rounded-full transition-all", met ? "bg-success" : "bg-primary")} style={{ width: `${s.pct}%` }} />
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                              <span>{s.totalHours} / {s.target.hours} hrs this cycle</span>
                              {s.target.pharmacologyHours != null && (
                                <span className={s.pharmacologyMet ? "" : "text-warning"}>
                                  Pharmacology {s.pharmacologyHours}/{s.target.pharmacologyHours} hrs{s.pharmacologyMet ? " ✓" : ""}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="mt-1 text-xs text-muted-foreground">{s.totalHours} hrs logged</div>
                        )}
                      </div>
                    </button>
                    <Button size="sm" variant="outline" onClick={() => logFor(e)}><Plus className="size-3.5" /> Log</Button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-border px-4 py-3">
                      {s.target && <p className="mb-2 text-xs text-muted-foreground">{s.target.note}</p>}
                      {recs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No CE logged yet.</p>
                      ) : (
                        <CeList records={recs} onEdit={setEditing} onRemove={(r) => { if (window.confirm(`Delete "${r.title}"?`)) void removeMut.mutateAsync(r.id).then(() => ceQ.refetch()); }} />
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {otherByPerson.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Other logged CE</div>
              {otherByPerson.map(([name, recs]) => {
                const key = `other::${name}`;
                const isOpen = open.has(key);
                const total = recs.reduce((n, r) => n + (r.hours || 0), 0);
                return (
                  <Card key={key}>
                    <button type="button" onClick={() => toggle(key)} className="flex w-full items-center gap-3 p-4 text-left">
                      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                      <span className="flex-1 truncate font-medium">{name}</span>
                      <span className="text-sm text-muted-foreground">{total} hrs</span>
                    </button>
                    {isOpen && <div className="border-t border-border px-4 py-3"><CeList records={recs} onEdit={setEditing} onRemove={(r) => { if (window.confirm(`Delete "${r.title}"?`)) void removeMut.mutateAsync(r.id).then(() => ceQ.refetch()); }} /></div>}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CeList({ records, onEdit, onRemove }: { records: CeRecord[]; onEdit: (r: CeRecord) => void; onRemove: (r: CeRecord) => void }) {
  return (
    <div className="divide-y divide-border/50">
      {records.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{r.title}</div>
            <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>{r.hours} hrs</span>
              <span>· {CE_CATEGORY_LABEL[r.category]}</span>
              {r.provider && <span>· {r.provider}</span>}
              {r.completedDate && <span>· {formatDate(r.completedDate)}</span>}
              {r.appliesTo && <span>· for {r.appliesTo}</span>}
            </div>
          </div>
          {r.documentUrl && <FileLink path={r.documentUrl} iconOnly label="Certificate" className="text-muted-foreground hover:text-primary" />}
          <button type="button" onClick={() => onEdit(r)} className="text-muted-foreground hover:text-primary" title="Edit"><Pencil className="size-4" /></button>
          <button type="button" onClick={() => onRemove(r)} className="text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}

function CeDialog({ initial, prefill, employees, onClose, onSaved, createMut, updateMut }: {
  initial?: CeRecord;
  prefill?: Partial<CeForm>;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
  createMut: ReturnType<typeof useCreate<"ceRecords">>;
  updateMut: ReturnType<typeof useUpdate<"ceRecords">>;
}) {
  const [form, setForm] = useState<CeForm>(
    initial
      ? { employeeUserId: initial.employeeUserId ?? null, employeeName: initial.employeeName, title: initial.title, provider: initial.provider ?? "", hours: String(initial.hours ?? ""), category: initial.category, appliesTo: initial.appliesTo ?? "", completedDate: initial.completedDate ?? "", notes: initial.notes ?? "" }
      : { ...EMPTY, ...prefill },
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof CeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // Sage reads an uploaded certificate (PDF/image) and prefills the CE fields.
  async function processWithSage(f: File) {
    const media = analyzableMedia(f);
    if (!media) { toast.error("Sage can read PDFs and images — this file type isn't supported."); return; }
    setProcessing(true);
    try {
      const fileBase64 = await blobToBase64(f);
      const res = await fetch("/api/ai/ce-analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, mediaType: media }),
      });
      const d = await res.json() as {
        title?: string; provider?: string; hours?: number; category?: string;
        completedDate?: string; appliesTo?: string; error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? "Couldn't read the certificate.");
      const validCat = (ceCategories as readonly string[]).includes(d.category ?? "") ? (d.category as CeCategory) : null;
      setForm((p) => ({
        ...p,
        title: d.title ?? p.title,
        provider: d.provider ?? p.provider,
        hours: d.hours != null ? String(d.hours) : p.hours,
        category: validCat ?? p.category,
        completedDate: d.completedDate ?? p.completedDate,
        appliesTo: d.appliesTo ?? p.appliesTo,
      }));
      toast.success("Sage filled the fields from the certificate — verify before saving.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read the certificate.");
    } finally {
      setProcessing(false);
    }
  }

  async function save() {
    if (!form.employeeName.trim()) { toast.error("Pick who the CE is for."); return; }
    if (!form.title.trim()) { toast.error("Add a title."); return; }
    const hours = parseFloat(form.hours);
    if (isNaN(hours) || hours <= 0) { toast.error("Enter the hours."); return; }
    setSaving(true);
    try {
      let documentUrl = initial?.documentUrl;
      if (file) documentUrl = await uploadFile(file, "ce");
      const payload = {
        employeeUserId: form.employeeUserId,
        employeeName: form.employeeName.trim(),
        title: form.title.trim(),
        provider: form.provider.trim() || null,
        hours,
        category: form.category,
        appliesTo: form.appliesTo.trim() || null,
        completedDate: form.completedDate || null,
        notes: form.notes.trim() || null,
        ...(documentUrl !== undefined && { documentUrl }),
      };
      if (initial) await updateMut.mutateAsync({ id: initial.id, patch: payload });
      else await createMut.mutateAsync(payload);
      toast.success(initial ? "CE updated" : "CE logged");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-semibold">{initial ? "Edit CE record" : "Log continuing education"}</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">For</label>
            <select className="input w-full" value={form.employeeUserId ?? form.employeeName}
              onChange={(e) => {
                const emp = employees.find((x) => (x.userId && x.userId === e.target.value) || `${x.firstName} ${x.lastName}`.trim() === e.target.value);
                if (emp) setForm((p) => ({ ...p, employeeUserId: emp.userId ?? null, employeeName: `${emp.firstName} ${emp.lastName}`.trim() }));
              }}>
              <option value="">Select an employee…</option>
              {[...employees].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)).map((e) => (
                <option key={e.id} value={e.userId ?? `${e.firstName} ${e.lastName}`.trim()}>{e.firstName} {e.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Activity title</label>
            <input className="input w-full" value={form.title} onChange={set("title")} placeholder="e.g. Psychopharmacology Update 2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Hours</label>
              <input type="number" step="0.25" min="0" className="input w-full" value={form.hours} onChange={set("hours")} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <select className="input w-full" value={form.category} onChange={set("category")}>
                {ceCategories.map((c) => <option key={c} value={c}>{CE_CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Provider / sponsor</label>
              <input className="input w-full" value={form.provider} onChange={set("provider")} placeholder="e.g. APA" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Completed date</label>
              <input type="date" className="input w-full" value={form.completedDate} onChange={set("completedDate")} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Counts toward (optional)</label>
            <input className="input w-full" value={form.appliesTo} onChange={set("appliesTo")} placeholder="e.g. APRN, DEA MATE, RN" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Certificate (optional)</label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={processing}><Upload className="size-4" /> {file ? file.name : "Attach file"}</Button>
              {file && analyzableMedia(file) && (
                <Button type="button" variant="secondary" size="sm" onClick={() => void processWithSage(file)} disabled={processing}>
                  <Sparkles className={cn("size-4", processing && "animate-pulse")} /> {processing ? "Sage is reading…" : "Process with Sage"}
                </Button>
              )}
              {initial?.documentUrl && !file && <span className="text-xs text-muted-foreground">A certificate is attached.</span>}
            </div>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-primary"><Sparkles className="size-3" /> Attach a certificate and Sage fills in the title, hours, category, provider, and date — always verify before saving.</p>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && analyzableMedia(f)) void processWithSage(f); e.target.value = ""; }} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea className="input w-full" rows={2} value={form.notes} onChange={set("notes")} />
          </div>
          {form.category !== "pharmacology" && form.appliesTo.toLowerCase().includes("aprn") && (
            <p className="flex items-start gap-1.5 text-xs text-warning"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> APRN prescriptive renewal needs pharmacology hours — set the category to Pharmacology if this qualifies.</p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : initial ? "Save" : "Log CE"}</Button>
        </div>
      </div>
    </div>
  );
}
