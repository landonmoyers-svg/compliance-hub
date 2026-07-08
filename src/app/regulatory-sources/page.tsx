"use client";

import { useState, useMemo } from "react";
import { BookOpen, Plus, Search, ExternalLink } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate, dateInputToISO } from "@/lib/dates";
import type { RegulatorySource } from "@/lib/data/schema";
import { toast } from "sonner";

const REVIEW_VARIANT = {
  current: "success",
  needs_review: "warning",
  under_review: "warning",
  archived: "secondary",
} as const;

const TYPE_LABELS: Record<RegulatorySource["sourceType"], string> = {
  regulation: "Regulation",
  guidance: "Guidance",
  internal: "Internal",
  statute: "Statute",
};

/* ----------------------------- dialog ------------------------------- */

interface SourceForm {
  title: string;
  citationLabel: string;
  issuingBody: string;
  sourceType: RegulatorySource["sourceType"];
  jurisdiction: string;
  reviewStatus: RegulatorySource["reviewStatus"];
  lastCheckedAt: string;
  officialUrl: string;
}

const EMPTY: SourceForm = {
  title: "",
  citationLabel: "",
  issuingBody: "",
  sourceType: "regulation",
  jurisdiction: "",
  reviewStatus: "current",
  lastCheckedAt: "",
  officialUrl: "",
};

function SourceDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: RegulatorySource;
  onClose: () => void;
  onSave: (data: SourceForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<SourceForm>(
    initial
      ? {
          title: initial.title,
          citationLabel: initial.citationLabel ?? "",
          issuingBody: initial.issuingBody ?? "",
          sourceType: initial.sourceType,
          jurisdiction: initial.jurisdiction ?? "",
          reviewStatus: initial.reviewStatus,
          lastCheckedAt: initial.lastCheckedAt ?? "",
          officialUrl: initial.officialUrl ?? "",
        }
      : EMPTY,
  );

  const set =
    (k: keyof SourceForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit source" : "Add source"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Title *</label>
            <input className="input w-full" value={form.title} onChange={set("title")} placeholder="e.g. HIPAA Privacy Rule" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Citation</label>
            <input className="input w-full" value={form.citationLabel} onChange={set("citationLabel")} placeholder="45 CFR § 164" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Issuing body</label>
            <input className="input w-full" value={form.issuingBody} onChange={set("issuingBody")} placeholder="HHS, OSHA, State Board…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <select className="input w-full" value={form.sourceType} onChange={set("sourceType")}>
              {(Object.entries(TYPE_LABELS) as [RegulatorySource["sourceType"], string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Jurisdiction</label>
            <input className="input w-full" value={form.jurisdiction} onChange={set("jurisdiction")} placeholder="Federal, State of UT…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Review status</label>
            <select className="input w-full" value={form.reviewStatus} onChange={set("reviewStatus")}>
              <option value="current">Current</option>
              <option value="needs_review">Needs review</option>
              <option value="under_review">Under review</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Last checked</label>
            <input type="date" className="input w-full" value={form.lastCheckedAt} onChange={set("lastCheckedAt")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Official URL</label>
            <input type="url" className="input w-full" value={form.officialUrl} onChange={set("officialUrl")} placeholder="https://…" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.title.trim() || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function RegulatorySourcesPage() {
  const { data, isLoading, isError, refetch } = useCollection("regulatorySources");
  const createMut = useCreate("regulatorySources");
  const updateMut = useUpdate("regulatorySources");

  const [search, setSearch] = useState("");
  const [filterReview, setFilterReview] = useState<RegulatorySource["reviewStatus"] | "all">("all");
  const [editing, setEditing] = useState<RegulatorySource | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const sources = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sources.filter((s) => {
      if (filterReview !== "all" && s.reviewStatus !== filterReview) return false;
      if (q && !s.title.toLowerCase().includes(q) && !(s.issuingBody ?? "").toLowerCase().includes(q) && !(s.citationLabel ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sources, search, filterReview]);

  const stats = useMemo(() => ({
    current: sources.filter((s) => s.reviewStatus === "current").length,
    needsReview: sources.filter((s) => s.reviewStatus === "needs_review").length,
    total: sources.length,
  }), [sources]);

  async function handleSave(form: SourceForm) {
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        citationLabel: form.citationLabel.trim() || undefined,
        issuingBody: form.issuingBody.trim() || undefined,
        sourceType: form.sourceType,
        jurisdiction: form.jurisdiction.trim() || undefined,
        reviewStatus: form.reviewStatus,
        lastCheckedAt: form.lastCheckedAt ? dateInputToISO(form.lastCheckedAt) : undefined,
        officialUrl: form.officialUrl.trim() || undefined,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Source updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Source added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save source");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Regulatory Sources" />
        <ErrorState message="We couldn't load regulatory sources." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <SourceDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Regulatory Sources"
        description="Track applicable regulations, guidance documents, and internal policies that govern your compliance program."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add source
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Current" value={stats.current} icon={BookOpen} tone="success" loading={isLoading} />
        <StatCard label="Needs review" value={stats.needsReview} icon={BookOpen} tone={stats.needsReview ? "warning" : "default"} loading={isLoading} />
        <StatCard label="Total tracked" value={stats.total} icon={BookOpen} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search title, citation, or issuing body…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(["all", "current", "needs_review", "under_review", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterReview(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  filterReview === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {s === "all" ? "All" : s === "needs_review" ? "Needs review" : s === "under_review" ? "Under review" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No sources found"
              description={search || filterReview !== "all" ? "Try adjusting your search or filter." : "Add your first regulatory source."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add source</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Citation</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Issuing body</th>
                    <th className="pb-2 pr-4 font-medium">Last checked</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{s.title}</div>
                        {s.jurisdiction && <div className="text-xs text-muted-foreground">{s.jurisdiction}</div>}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">{s.citationLabel ?? "—"}</td>
                      <td className="py-3 pr-4">{TYPE_LABELS[s.sourceType]}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{s.issuingBody ?? "—"}</td>
                      <td className="py-3 pr-4">{s.lastCheckedAt ? formatDate(s.lastCheckedAt) : "—"}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={REVIEW_VARIANT[s.reviewStatus]}>
                          {s.reviewStatus === "needs_review" ? "Needs review" : s.reviewStatus === "under_review" ? "Under review" : s.reviewStatus.charAt(0).toUpperCase() + s.reviewStatus.slice(1)}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Edit</Button>
                          {s.officialUrl && (
                            <Button size="sm" variant="ghost" asChild>
                              <a href={s.officialUrl} target="_blank" rel="noopener noreferrer" aria-label="Open official source">
                                <ExternalLink className="size-3" />
                              </a>
                            </Button>
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
