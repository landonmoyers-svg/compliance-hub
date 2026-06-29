"use client";

import { useState, useMemo } from "react";
import { Star, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";
import { toast } from "sonner";

interface PerformanceReview {
  id: string;
  employeeName: string;
  reviewerName: string;
  reviewType: "annual" | "90day" | "pip" | "quarterly";
  reviewDate: string;
  overallRating: 1 | 2 | 3 | 4 | 5;
  gwcScore: { getIt: boolean; wantIt: boolean; capacity: boolean };
  notes: string;
  status: "draft" | "completed" | "signed";
}

const SEED: PerformanceReview[] = [
  {
    id: "pr1",
    employeeName: "Sarah Mitchell",
    reviewerName: "Jane Doe",
    reviewType: "annual",
    reviewDate: "2026-01-15",
    overallRating: 4,
    gwcScore: { getIt: true, wantIt: true, capacity: true },
    notes: "Exceptional clinical skills. GWC positive across all three dimensions.",
    status: "signed",
  },
  {
    id: "pr2",
    employeeName: "Mike Carter",
    reviewerName: "Jane Doe",
    reviewType: "annual",
    reviewDate: "2026-01-20",
    overallRating: 3,
    gwcScore: { getIt: true, wantIt: true, capacity: false },
    notes: "Strong contributions but capacity constraints during peak periods. Development plan created.",
    status: "completed",
  },
  {
    id: "pr3",
    employeeName: "Emily Torres",
    reviewerName: "Jane Doe",
    reviewType: "90day",
    reviewDate: "2026-03-01",
    overallRating: 5,
    gwcScore: { getIt: true, wantIt: true, capacity: true },
    notes: "Exceptional 90-day performance. Exceeded all onboarding milestones.",
    status: "signed",
  },
  {
    id: "pr4",
    employeeName: "David Lee",
    reviewerName: "Jane Doe",
    reviewType: "quarterly",
    reviewDate: "2026-04-01",
    overallRating: 2,
    gwcScore: { getIt: false, wantIt: true, capacity: true },
    notes: "Performance concerns in clinical documentation accuracy. 30-day improvement plan initiated.",
    status: "draft",
  },
];

const RATING_LABEL: Record<number, string> = {
  1: "Needs improvement",
  2: "Below expectations",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Outstanding",
};

const STATUS_VARIANT: Record<PerformanceReview["status"], "secondary" | "warning" | "success"> = {
  draft: "secondary",
  completed: "warning",
  signed: "success",
};

const REVIEW_TYPE_LABEL: Record<PerformanceReview["reviewType"], string> = {
  annual: "Annual",
  "90day": "90-Day",
  pip: "PIP",
  quarterly: "Quarterly",
};

function GwcDot({ value }: { value: boolean }) {
  return (
    <span className={`inline-block size-2.5 rounded-full ${value ? "bg-success" : "bg-destructive"}`} />
  );
}

export default function PerformancePage() {
  const [reviews, setReviews] = useState<PerformanceReview[]>(SEED);
  const [filter, setFilter] = useState<"all" | PerformanceReview["reviewType"]>("all");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    employeeName: "",
    reviewType: "annual" as PerformanceReview["reviewType"],
    reviewDate: "",
    overallRating: "3",
    getIt: true,
    wantIt: true,
    capacity: true,
    notes: "",
  });

  const filtered = useMemo(
    () => (filter === "all" ? reviews : reviews.filter((r) => r.reviewType === filter)),
    [reviews, filter],
  );

  const stats = useMemo(() => ({
    total: reviews.length,
    signed: reviews.filter((r) => r.status === "signed").length,
    avgRating:
      reviews.length > 0
        ? (reviews.reduce((s, r) => s + r.overallRating, 0) / reviews.length).toFixed(1)
        : "—",
  }), [reviews]);

  function save() {
    if (!form.employeeName.trim() || !form.reviewDate) {
      toast.error("Employee name and review date are required");
      return;
    }
    setReviews((prev) => [
      {
        id: `pr-${Date.now()}`,
        employeeName: form.employeeName.trim(),
        reviewerName: "Jane Doe",
        reviewType: form.reviewType,
        reviewDate: form.reviewDate,
        overallRating: parseInt(form.overallRating) as PerformanceReview["overallRating"],
        gwcScore: { getIt: form.getIt, wantIt: form.wantIt, capacity: form.capacity },
        notes: form.notes.trim(),
        status: "draft",
      },
      ...prev,
    ]);
    setShowNew(false);
    setForm({ employeeName: "", reviewType: "annual", reviewDate: "", overallRating: "3", getIt: true, wantIt: true, capacity: true, notes: "" });
    toast.success("Review added");
  }

  return (
    <div className="space-y-6">
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowNew(false)}
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">Add performance review</h2>
              <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Employee *</label>
                <input className="input w-full" value={form.employeeName} onChange={(e) => setForm((p) => ({ ...p, employeeName: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Review type</label>
                <select className="input w-full" value={form.reviewType} onChange={(e) => setForm((p) => ({ ...p, reviewType: e.target.value as PerformanceReview["reviewType"] }))}>
                  <option value="annual">Annual</option>
                  <option value="90day">90-Day</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="pip">PIP</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Review date *</label>
                <input type="date" className="input w-full" value={form.reviewDate} onChange={(e) => setForm((p) => ({ ...p, reviewDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Overall rating</label>
                <select className="input w-full" value={form.overallRating} onChange={(e) => setForm((p) => ({ ...p, overallRating: e.target.value }))}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} – {RATING_LABEL[n]}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">GWC assessment</label>
                {(["getIt", "wantIt", "capacity"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm capitalize">
                    <input type="checkbox" checked={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.checked }))} className="size-4" />
                    {k === "getIt" ? "Gets it" : k === "wantIt" ? "Wants it" : "Has capacity"}
                  </label>
                ))}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea className="input w-full min-h-[80px] resize-y" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Review notes…" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button onClick={save} disabled={!form.employeeName.trim() || !form.reviewDate}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Performance Reviews"
        description="GWC-based performance reviews. GWC (Get it / Want it / Capacity) is from EOS/Traction."
        actions={
          <Button onClick={() => setShowNew(true)}><Plus className="size-4" /> Add review</Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total reviews" value={stats.total} icon={Star} />
        <StatCard label="Signed reviews" value={stats.signed} icon={Star} tone="success" />
        <StatCard label="Avg. rating" value={`${stats.avgRating} / 5`} icon={Star} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "annual", "90day", "quarterly", "pip"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
              filter === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {t === "all" ? "All" : t === "90day" ? "90-Day" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.length === 0 ? (
          <div className="sm:col-span-2">
            <EmptyState icon={Star} title="No reviews found" description="Add a performance review to get started." action={<Button onClick={() => setShowNew(true)}><Plus className="size-4" /> Add review</Button>} />
          </div>
        ) : filtered.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{r.employeeName}</CardTitle>
                  <p className="text-sm text-muted-foreground">{REVIEW_TYPE_LABEL[r.reviewType]} · {r.reviewDate}</p>
                </div>
                <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">{r.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`size-4 ${i < r.overallRating ? "fill-warning text-warning" : "text-muted-foreground"}`} />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">{RATING_LABEL[r.overallRating]}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">GWC:</span>
                <span className="flex items-center gap-1"><GwcDot value={r.gwcScore.getIt} /> Gets it</span>
                <span className="flex items-center gap-1"><GwcDot value={r.gwcScore.wantIt} /> Wants it</span>
                <span className="flex items-center gap-1"><GwcDot value={r.gwcScore.capacity} /> Capacity</span>
              </div>
              {r.notes && <p className="text-sm text-muted-foreground line-clamp-2">{r.notes}</p>}
              <p className="text-xs text-muted-foreground">Reviewed by {r.reviewerName}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
