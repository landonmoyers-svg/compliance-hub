"use client";

import { useState, useMemo, useEffect } from "react";
import { BookOpen, Plus, Search, ExternalLink, Sparkles, FileText, X, AlertTriangle, CheckCircle2, Download, Clock, Pin } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { PageTabs, SOURCES_TABS } from "@/components/shared/page-tabs";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { DuplicateFinder, dupNorm } from "@/components/shared/duplicate-finder";
import { FileLink } from "@/components/shared/file-link";
import { formatDate, dateInputToISO } from "@/lib/dates";
import type { RegulatorySource, ComplianceDocument } from "@/lib/data/schema";
import { linkSopsAndSources } from "@/lib/sop-regulation-link";
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

/** Quarterly-review status of a source's stored document version. */
function docUpdateStatus(s: RegulatorySource): { has: boolean; due: boolean; label: string } {
  if (!s.documentFetchedAt) return { has: false, due: true, label: "Not fetched" };
  const days = Math.floor((Date.now() - new Date(s.documentFetchedAt).getTime()) / 86_400_000);
  return { has: true, due: days > 92, label: `Updated ${formatDate(s.documentFetchedAt)}` };
}

/* ------------------- stored-document viewer ------------------- */

function DocumentModal({ source, onClose }: { source: RegulatorySource; onClose: () => void }) {
  const st = docUpdateStatus(source);
  const lines = (source.documentContent ?? "").split(/\r?\n/).map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2"><FileText className="size-4 text-primary" /><h2 className="font-semibold">Stored current version</h2></div>
            <p className="mt-0.5 text-xs text-muted-foreground">{source.title}{source.citationLabel ? ` · ${source.citationLabel}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {source.documentVersion && <Badge variant="secondary">{source.documentVersion}</Badge>}
            <span className={st.due ? "text-warning" : "text-muted-foreground"}>{st.label}</span>
            {st.due && <Badge variant="warning">Update due (review ≥ quarterly)</Badge>}
          </div>
          {source.documentSummary && <p className="text-sm">{source.documentSummary}</p>}
          {lines.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key provisions</p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
          {source.officialUrl && (
            <a href={source.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Open the official source <ExternalLink className="size-3" />
            </a>
          )}
          {source.attachmentUrl && (
            <FileLink path={source.attachmentUrl} label="Open the attached document" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" />
          )}
          <p className="text-[11px] text-muted-foreground">Stored copy of a public government source for internal reference. Re-fetch and review at least quarterly to stay current. Verify against the official source before relying on it.</p>
        </div>
      </div>
    </div>
  );
}

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
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

/* ----------------------- SOP alignment check ----------------------- */

interface AlignmentResult {
  coverage: "covered" | "partial" | "gap";
  coveringSops: string[];
  aligned: string[];
  gaps: string[];
  recommendations: string[];
  summary: string;
}
const COVERAGE_VARIANT = { covered: "success", partial: "warning", gap: "destructive" } as const;
const COVERAGE_LABEL = { covered: "Covered", partial: "Partial", gap: "Gap" } as const;

function AlignmentModal({ source, related, allDocs, onClose }: {
  source: RegulatorySource;
  related: ComplianceDocument[];
  allDocs: ComplianceDocument[];
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AlignmentResult | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sops = (related.length ? related : allDocs).slice(0, 12).map((d) => ({
          title: d.title, area: d.complianceArea ?? "", summary: d.summary ?? "", content: d.content ?? "",
        }));
        const res = await fetch("/api/ai/sop-alignment", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: { title: source.title, citationLabel: source.citationLabel, issuingBody: source.issuingBody, jurisdiction: source.jurisdiction, sourceType: source.sourceType },
            sops,
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Alignment check failed.");
        if (alive) setResult(d as AlignmentResult);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Alignment check failed.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [source, related, allDocs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2 className="font-semibold">SOP alignment check</h2></div>
            <p className="mt-0.5 text-xs text-muted-foreground">{source.title}{source.citationLabel ? ` · ${source.citationLabel}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Sparkles className="size-4 animate-pulse text-primary" /> Sage is checking your SOPs against this regulation…</div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error}</div>
          ) : result ? (
            <>
              <div className="flex items-center gap-2">
                <Badge variant={COVERAGE_VARIANT[result.coverage]}>{COVERAGE_LABEL[result.coverage]}</Badge>
                <p className="text-sm">{result.summary}</p>
              </div>
              {result.coveringSops.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Covering SOPs</p>
                  <div className="flex flex-wrap gap-1.5">{result.coveringSops.map((t, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"><FileText className="size-3" />{t}</span>)}</div>
                </div>
              )}
              {result.aligned.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aligned</p>
                  <ul className="space-y-1 text-sm">{result.aligned.map((a, i) => <li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /><span>{a}</span></li>)}</ul>
                </div>
              )}
              {result.gaps.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gaps</p>
                  <ul className="space-y-1 text-sm">{result.gaps.map((g, i) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /><span>{g}</span></li>)}</ul>
                </div>
              )}
              {result.recommendations.length > 0 && (
                <div className="rounded-md bg-secondary/30 p-3">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Recommended</p>
                  <ul className="list-disc space-y-1 pl-4 text-xs">{result.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">AI decision-support based only on the SOP text on file — verify against the actual regulation before relying on it.</p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function RegulatorySourcesPage() {
  const { data, isLoading, isError, refetch } = useCollection("regulatorySources");
  const createMut = useCreate("regulatorySources");
  const updateMut = useUpdate("regulatorySources");
  const docsQ = useCollection("documents");
  const sopLinksQ = useCollection("sopRegulationLinks");

  const [search, setSearch] = useState("");
  const [filterReview, setFilterReview] = useState<RegulatorySource["reviewStatus"] | "all">("all");
  const [editing, setEditing] = useState<RegulatorySource | null | "new">(null);
  const [aligning, setAligning] = useState<RegulatorySource | null>(null);
  const [viewing, setViewing] = useState<RegulatorySource | null>(null);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sources = useMemo(() => data ?? [], [data]);
  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  // Cross-reference SOPs ↔ regulations (citations + shared compliance-area acronyms).
  const links = useMemo(() => linkSopsAndSources(docs, sources), [docs, sources]);
  const docsById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  // Admin-pinned links: sourceId -> set of SOP (document) ids that satisfy it.
  const pinnedDocsBySource = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of sopLinksQ.data ?? []) {
      const set = m.get(l.regulatorySourceId) ?? new Set<string>();
      set.add(l.documentId);
      m.set(l.regulatorySourceId, set);
    }
    return m;
  }, [sopLinksQ.data]);
  const coverageFor = (sourceId: string) => {
    const pinnedSet = pinnedDocsBySource.get(sourceId) ?? new Set<string>();
    const pinned = [...pinnedSet].map((id) => docsById.get(id)).filter((d): d is ComplianceDocument => !!d);
    const suggested = (links.docsForSource.get(sourceId) ?? []).filter((d) => !pinnedSet.has(d.id));
    return { pinned, suggested };
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sources.filter((s) => {
      if (filterReview !== "all" && s.reviewStatus !== filterReview) return false;
      if (q && !s.title.toLowerCase().includes(q) && !(s.issuingBody ?? "").toLowerCase().includes(q) && !(s.citationLabel ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sources, search, filterReview]);

  const { sorted, sort, toggle } = useSort(filtered, {
    title: (s) => s.title,
    citation: (s) => s.citationLabel,
    type: (s) => TYPE_LABELS[s.sourceType],
    issuer: (s) => s.issuingBody,
    lastChecked: (s) => s.lastCheckedAt,
    status: (s) => s.reviewStatus,
  });

  const stats = useMemo(() => ({
    current: sources.filter((s) => s.reviewStatus === "current").length,
    needsReview: sources.filter((s) => s.reviewStatus === "needs_review").length,
    gaps: sources.filter((s) => !links.docsForSource.get(s.id)?.length && !pinnedDocsBySource.get(s.id)?.size).length,
    total: sources.length,
  }), [sources, links, pinnedDocsBySource]);
  const dueCount = useMemo(() => sources.filter((s) => docUpdateStatus(s).due).length, [sources]);

  // Fetch the current version of a source's referenced document and store it.
  async function fetchCurrent(s: RegulatorySource) {
    setFetchingId(s.id);
    try {
      const res = await fetch("/api/ai/reg-fetch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { title: s.title, citationLabel: s.citationLabel, issuingBody: s.issuingBody, jurisdiction: s.jurisdiction, officialUrl: s.officialUrl, sourceType: s.sourceType } }),
      });
      const d = await res.json() as { summary?: string; content?: string; version?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Fetch failed.");
      await updateMut.mutateAsync({ id: s.id, patch: {
        documentSummary: d.summary || null,
        documentContent: d.content || null,
        documentVersion: d.version || null,
        documentFetchedAt: new Date().toISOString(),
      } });
      toast.success("Current version fetched and stored.");
      void refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't fetch the current version.");
    } finally {
      setFetchingId(null);
    }
  }

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
      <PageTabs tabs={SOURCES_TABS} />

      {editing && (
        <SourceDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {aligning && (
        <AlignmentModal
          source={aligning}
          related={(() => { const c = coverageFor(aligning.id); return [...c.pinned, ...c.suggested]; })()}
          allDocs={docs}
          onClose={() => setAligning(null)}
        />
      )}

      {viewing && <DocumentModal source={viewing} onClose={() => setViewing(null)} />}

      <PageHeader
        title="Regulatory Sources"
        description="The rules that apply to your practice — regulations, guidance, and internal policies, each tracked with a review status."
        actions={
          <div className="flex flex-wrap gap-2">
            <DuplicateFinder
              items={sources}
              collection="regulatorySources"
              keyOf={(r) => dupNorm(r.citationLabel) || dupNorm(r.title) || null}
              describe={(r) => ({ title: r.title, subtitle: [r.citationLabel, r.jurisdiction].filter(Boolean).join(" · "), hasFile: false })}
              score={(r) => (r.officialUrl ? 1 : 0)}
            />
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add source
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Current" value={stats.current} icon={BookOpen} tone="success" loading={isLoading} />
        <StatCard label="Needs review" value={stats.needsReview} icon={BookOpen} tone={stats.needsReview ? "warning" : "default"} loading={isLoading} />
        <StatCard label="SOP gaps" value={stats.gaps} icon={AlertTriangle} tone={stats.gaps ? "destructive" : "success"} loading={isLoading || docsQ.isLoading} />
        <StatCard label="Total tracked" value={stats.total} icon={BookOpen} loading={isLoading} />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 p-3 text-sm">
        <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          Store each source&apos;s current version for internal reference and Policy Q&amp;A: click <span className="font-medium text-foreground">Fetch</span> to pull the current document from its official link.{" "}
          <span className="font-medium text-foreground">Review and re-fetch every source at least quarterly.</span>
          {dueCount > 0 && <> <span className="font-medium text-warning">{dueCount} {dueCount === 1 ? "source is" : "sources are"} due for an update.</span></>}
        </p>
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
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Title" sortKey="title" sort={sort} onToggle={toggle} />
                    <SortHeader label="Citation" sortKey="citation" sort={sort} onToggle={toggle} />
                    <SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortHeader label="Issuing body" sortKey="issuer" sort={sort} onToggle={toggle} />
                    <SortHeader label="Last checked" sortKey="lastChecked" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Current version</th>
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">SOP coverage</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td data-label="Title" className="py-3 pr-4">
                        <div className="font-medium">{s.title}</div>
                        {s.jurisdiction && <div className="text-xs text-muted-foreground">{s.jurisdiction}</div>}
                      </td>
                      <td data-label="Citation" className="py-3 pr-4 font-mono text-xs">{s.citationLabel ?? "—"}</td>
                      <td data-label="Type" className="py-3 pr-4">{TYPE_LABELS[s.sourceType]}</td>
                      <td data-label="Issuing body" className="py-3 pr-4 text-muted-foreground">{s.issuingBody ?? "—"}</td>
                      <td data-label="Last checked" className="py-3 pr-4">{s.lastCheckedAt ? formatDate(s.lastCheckedAt) : "—"}</td>
                      <td data-label="Current version" className="py-3 pr-4">
                        {(() => {
                          const st = docUpdateStatus(s);
                          if (!st.has) return <span className="text-xs text-muted-foreground">Not fetched</span>;
                          return (
                            <div className="space-y-0.5">
                              {s.documentVersion && <div className="text-xs">{s.documentVersion}</div>}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`text-xs ${st.due ? "text-warning" : "text-muted-foreground"}`}>{st.label}</span>
                                {st.due && <Badge variant="warning">Update due</Badge>}
                              </div>
                              <button type="button" onClick={() => setViewing(s)} className="text-xs text-primary hover:underline">View stored</button>
                            </div>
                          );
                        })()}
                      </td>
                      <td data-label="Status" className="py-3 pr-4">
                        <button type="button" onClick={() => setEditing(s)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                          <Badge variant={REVIEW_VARIANT[s.reviewStatus]}>
                            {s.reviewStatus === "needs_review" ? "Needs review" : s.reviewStatus === "under_review" ? "Under review" : s.reviewStatus.charAt(0).toUpperCase() + s.reviewStatus.slice(1)}
                          </Badge>
                        </button>
                      </td>
                      <td data-label="SOP coverage" className="py-3 pr-4">
                        {(() => {
                          const { pinned, suggested } = coverageFor(s.id);
                          if (pinned.length === 0 && suggested.length === 0) return <Badge variant="destructive">No SOP — gap</Badge>;
                          return (
                            <div className="flex flex-wrap items-center gap-1">
                              {pinned.map((d) => (
                                <span key={d.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" title={`Pinned: ${d.title}`}><Pin className="size-3" /><span className="max-w-[140px] truncate">{d.title}</span></span>
                              ))}
                              {suggested.slice(0, 2).map((d) => (
                                <span key={d.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs" title={`Suggested: ${d.title}`}><FileText className="size-3" /><span className="max-w-[140px] truncate">{d.title}</span></span>
                              ))}
                              {suggested.length > 2 && <span className="text-xs text-muted-foreground">+{suggested.length - 2}</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td data-label="" className="py-3">
                        <div className="flex flex-wrap gap-1 md:justify-end">
                          <Button size="sm" variant="ghost" onClick={() => void fetchCurrent(s)} disabled={fetchingId === s.id} title="Fetch the current version of the referenced document">
                            <Download className={`size-3 ${fetchingId === s.id ? "animate-pulse" : ""}`} /> {fetchingId === s.id ? "Fetching…" : docUpdateStatus(s).has ? "Update" : "Fetch"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setAligning(s)} title="Check SOP alignment with Sage"><Sparkles className="size-3" /> Align</Button>
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
