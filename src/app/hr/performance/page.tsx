"use client";

import { useState, useMemo } from "react";
import { Star, Plus, X, Target, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/shared/states";
import type { PerformanceReview, PerformanceRock, ReviewType } from "@/lib/data/schema";
import { reviewTypes } from "@/lib/data/schema";
import { toast } from "sonner";

const REVIEW_TYPE_LABEL: Record<ReviewType, string> = {
  quarterly: "Quarterly",
  annual: "Annual",
  mid_year: "Mid-year",
  probationary: "Probationary",
  ninety_day: "90-Day",
  pip: "PIP",
  exit: "Exit",
};

const RATING_LABEL: Record<PerformanceReview["overallRating"], string> = {
  exceeds_expectations: "Exceeds expectations",
  meets_expectations: "Meets expectations",
  needs_improvement: "Needs improvement",
  unsatisfactory: "Unsatisfactory",
};
const RATING_VARIANT: Record<PerformanceReview["overallRating"], "success" | "secondary" | "warning" | "destructive"> = {
  exceeds_expectations: "success",
  meets_expectations: "secondary",
  needs_improvement: "warning",
  unsatisfactory: "destructive",
};

const STATUS_VARIANT: Record<PerformanceReview["status"], "secondary" | "warning" | "success"> = {
  scheduled: "secondary",
  in_progress: "warning",
  completed: "success",
};

const SEAT_LABEL: Record<PerformanceReview["rightPersonRightSeat"], string> = {
  yes: "Right person, right seat",
  wrong_seat: "Right person, wrong seat",
  wrong_person: "Wrong person",
  no: "Not a fit",
};

function GwcDot({ value }: { value: boolean }) {
  return <span className={`inline-block size-2.5 rounded-full ${value ? "bg-success" : "bg-destructive"}`} />;
}

interface FormState {
  employeeId: string;
  reviewType: ReviewType;
  reviewDate: string;
  getsIt: boolean;
  wantsIt: boolean;
  hasCapacity: boolean;
  rightPersonRightSeat: PerformanceReview["rightPersonRightSeat"];
  overallRating: PerformanceReview["overallRating"];
  rocks: PerformanceRock[];
  notes: string;
  status: PerformanceReview["status"];
}

const EMPTY_FORM: FormState = {
  employeeId: "",
  reviewType: "quarterly",
  reviewDate: "",
  getsIt: true,
  wantsIt: true,
  hasCapacity: true,
  rightPersonRightSeat: "yes",
  overallRating: "meets_expectations",
  rocks: [],
  notes: "",
  status: "scheduled",
};

export default function PerformancePage() {
  const { profile, user, isAdmin } = useAuth();
  const reviewerName = profile?.fullName ?? user?.fullName ?? "Reviewer";

  const revQ = useCollection("performanceReviews");
  const empQ = useCollection("employees");
  const createMut = useCreate("performanceReviews");
  const updateMut = useUpdate("performanceReviews");

  const reviews = useMemo(() => revQ.data ?? [], [revQ.data]);
  const employees = useMemo(() => empQ.data ?? [], [empQ.data]);

  const [filter, setFilter] = useState<"all" | ReviewType>("all");
  const [editing, setEditing] = useState<PerformanceReview | null | "new">(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [rockDraft, setRockDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () => (filter === "all" ? reviews : reviews.filter((r) => r.reviewType === filter)),
    [reviews, filter],
  );

  const stats = useMemo(() => ({
    total: reviews.length,
    completed: reviews.filter((r) => r.status === "completed").length,
    activePips: reviews.filter((r) => r.reviewType === "pip" && r.status !== "completed").length,
    needsAttention: reviews.filter((r) => r.rightPersonRightSeat !== "yes").length,
  }), [reviews]);

  function openNew() {
    setForm(EMPTY_FORM);
    setRockDraft("");
    setEditing("new");
  }
  function openEdit(r: PerformanceReview) {
    setForm({
      employeeId: r.employeeId,
      reviewType: r.reviewType,
      reviewDate: r.reviewDate ?? "",
      getsIt: r.getsIt,
      wantsIt: r.wantsIt,
      hasCapacity: r.hasCapacity,
      rightPersonRightSeat: r.rightPersonRightSeat,
      overallRating: r.overallRating,
      rocks: r.rocks,
      notes: r.notes ?? "",
      status: r.status,
    });
    setRockDraft("");
    setEditing(r);
  }

  function addRock() {
    const title = rockDraft.trim();
    if (!title) return;
    setForm((p) => ({ ...p, rocks: [...p.rocks, { title, status: "on_track" }] }));
    setRockDraft("");
  }
  function cycleRock(idx: number) {
    const order: PerformanceRock["status"][] = ["on_track", "complete", "off_track"];
    setForm((p) => ({
      ...p,
      rocks: p.rocks.map((rk, i) =>
        i === idx ? { ...rk, status: order[(order.indexOf(rk.status) + 1) % order.length] } : rk,
      ),
    }));
  }
  function removeRock(idx: number) {
    setForm((p) => ({ ...p, rocks: p.rocks.filter((_, i) => i !== idx) }));
  }

  async function save() {
    const emp = employees.find((e) => e.id === form.employeeId);
    if (!emp) { toast.error("Choose an employee."); return; }
    if (!form.reviewDate) { toast.error("Set a review date."); return; }
    if (!form.getsIt && !form.wantsIt && !form.hasCapacity && form.rightPersonRightSeat === "yes") {
      toast.error("GWC all-negative but seat marked 'yes' — please reconcile.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        reviewType: form.reviewType,
        reviewDate: form.reviewDate,
        getsIt: form.getsIt,
        wantsIt: form.wantsIt,
        hasCapacity: form.hasCapacity,
        rightPersonRightSeat: form.rightPersonRightSeat,
        overallRating: form.overallRating,
        rocks: form.rocks,
        notes: form.notes.trim() || undefined,
        reviewerName,
        status: form.status,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Review updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Review added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save review.");
    } finally {
      setBusy(false);
    }
  }

  if (revQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Performance Reviews" />
        <ErrorState message="We couldn't load reviews." onRetry={() => void revQ.refetch()} />
      </div>
    );
  }

  const loading = revQ.isLoading || empQ.isLoading;

  return (
    <div className="space-y-6">
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">{editing === "new" ? "Add performance review" : "Edit review"}</h2>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Employee *</label>
                <select className="input w-full" value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}>
                  <option value="">Select employee…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Review type</label>
                <select className="input w-full" value={form.reviewType} onChange={(e) => setForm((p) => ({ ...p, reviewType: e.target.value as ReviewType }))}>
                  {reviewTypes.map((t) => <option key={t} value={t}>{REVIEW_TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Review date *</label>
                <input type="date" className="input w-full" value={form.reviewDate} onChange={(e) => setForm((p) => ({ ...p, reviewDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">GWC assessment</label>
                {(["getsIt", "wantsIt", "hasCapacity"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.checked }))} className="size-4" />
                    {k === "getsIt" ? "Gets it" : k === "wantsIt" ? "Wants it" : "Has capacity"}
                  </label>
                ))}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Right person / right seat</label>
                <select className="input w-full" value={form.rightPersonRightSeat} onChange={(e) => setForm((p) => ({ ...p, rightPersonRightSeat: e.target.value as PerformanceReview["rightPersonRightSeat"] }))}>
                  {(["yes", "wrong_seat", "wrong_person", "no"] as const).map((s) => <option key={s} value={s}>{SEAT_LABEL[s]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Overall rating</label>
                <select className="input w-full" value={form.overallRating} onChange={(e) => setForm((p) => ({ ...p, overallRating: e.target.value as PerformanceReview["overallRating"] }))}>
                  {(["exceeds_expectations", "meets_expectations", "needs_improvement", "unsatisfactory"] as const).map((r) => <option key={r} value={r}>{RATING_LABEL[r]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <select className="input w-full" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as PerformanceReview["status"] }))}>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Rocks (quarterly goals)</label>
                {form.rocks.length > 0 && (
                  <div className="space-y-1.5">
                    {form.rocks.map((rk, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-3 py-1.5 text-sm">
                        <Target className="size-3.5 text-muted-foreground" />
                        <span className="flex-1">{rk.title}</span>
                        <button onClick={() => cycleRock(i)} className="rounded px-1.5 py-0.5">
                          <Badge variant={rk.status === "complete" ? "success" : rk.status === "off_track" ? "destructive" : "warning"} className="capitalize">{rk.status.replace("_", " ")}</Badge>
                        </button>
                        <button onClick={() => removeRock(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input className="input flex-1" placeholder="Add a rock…" value={rockDraft} onChange={(e) => setRockDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRock(); } }} />
                  <Button variant="outline" onClick={addRock} disabled={!rockDraft.trim()}>Add</Button>
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea className="input min-h-[80px] w-full resize-y" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Review notes…" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
              <Button onClick={save} disabled={busy}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Performance Reviews"
        description="EOS-style reviews with GWC (Gets it / Wants it / Capacity), Right-Person-Right-Seat, and quarterly Rocks."
        actions={isAdmin ? <Button onClick={openNew}><Plus className="size-4" /> Add review</Button> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total reviews" value={stats.total} icon={Star} loading={loading} />
        <StatCard label="Completed" value={stats.completed} icon={Star} tone="success" loading={loading} />
        <StatCard label="Active PIPs" value={stats.activePips} icon={Star} tone={stats.activePips > 0 ? "warning" : "default"} loading={loading} />
        <StatCard label="Needs attention (seat)" value={stats.needsAttention} icon={Star} tone={stats.needsAttention > 0 ? "destructive" : "default"} loading={loading} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", ...reviewTypes] as const).map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${filter === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
            {t === "all" ? "All" : REVIEW_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Star} title="No reviews found" description="Add a performance review to get started." action={isAdmin ? <Button onClick={openNew}><Plus className="size-4" /> Add review</Button> : undefined} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((r) => (
            <Card key={r.id} className={isAdmin ? "cursor-pointer transition-colors hover:border-primary/40" : ""} onClick={isAdmin ? () => openEdit(r) : undefined}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{r.employeeName}</CardTitle>
                    <p className="text-sm text-muted-foreground">{REVIEW_TYPE_LABEL[r.reviewType]} · {r.reviewDate ?? "—"}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">{r.status.replace("_", " ")}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={RATING_VARIANT[r.overallRating]}>{RATING_LABEL[r.overallRating]}</Badge>
                  {r.rightPersonRightSeat !== "yes" && <Badge variant="warning">{SEAT_LABEL[r.rightPersonRightSeat]}</Badge>}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">GWC:</span>
                  <span className="flex items-center gap-1"><GwcDot value={r.getsIt} /> Gets it</span>
                  <span className="flex items-center gap-1"><GwcDot value={r.wantsIt} /> Wants it</span>
                  <span className="flex items-center gap-1"><GwcDot value={r.hasCapacity} /> Capacity</span>
                </div>
                {r.rocks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.rocks.map((rk, i) => (
                      <Badge key={i} variant={rk.status === "complete" ? "success" : rk.status === "off_track" ? "destructive" : "secondary"} className="font-normal">
                        {rk.title}
                      </Badge>
                    ))}
                  </div>
                )}
                {r.notes && <p className="line-clamp-2 text-sm text-muted-foreground">{r.notes}</p>}
                <p className="text-xs text-muted-foreground">Reviewed by {r.reviewerName ?? "—"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
