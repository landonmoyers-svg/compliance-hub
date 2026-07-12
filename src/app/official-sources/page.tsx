"use client";

import { useState, useMemo } from "react";
import { BookOpen, ExternalLink, Search } from "lucide-react";
import { useCollection, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { PageTabs, SOURCES_TABS } from "@/components/shared/page-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate } from "@/lib/dates";
import type { RegulatorySource } from "@/lib/data/schema";
import Link from "next/link";
import { toast } from "sonner";

const REVIEW_VARIANT = {
  current: "success",
  needs_review: "warning",
  under_review: "warning",
  archived: "secondary",
} as const;

export default function OfficialSourceLibraryPage() {
  const { data, isLoading, isError, refetch } = useCollection("regulatorySources");
  const updateMut = useUpdate("regulatorySources");

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<RegulatorySource["sourceType"] | "all">("all");

  const sources = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sources.filter((s) => {
      if (filterType !== "all" && s.sourceType !== filterType) return false;
      if (s.reviewStatus === "archived") return false; // hide archived by default
      if (
        q &&
        !s.title.toLowerCase().includes(q) &&
        !(s.issuingBody ?? "").toLowerCase().includes(q) &&
        !(s.citationLabel ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [sources, search, filterType]);

  async function markReviewed(s: RegulatorySource) {
    try {
      await updateMut.mutateAsync({
        id: s.id,
        patch: { reviewStatus: "current", lastCheckedAt: new Date().toISOString() },
      });
      toast.success("Marked as current");
    } catch {
      toast.error("Failed to update source");
    }
  }

  const needsReview = sources.filter((s) => s.reviewStatus === "needs_review").length;

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Official Source Library" />
        <ErrorState message="We couldn't load regulatory sources." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTabs tabs={SOURCES_TABS} />

      <PageHeader
        title="Official Source Library"
        description="Reference library of the federal and state source documents — regulations, guidance, and statutes — behind your compliance program."
        actions={
          <Button asChild variant="outline">
            <Link href="/regulatory-sources">Manage sources</Link>
          </Button>
        }
      />

      {needsReview > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <BookOpen className="size-4 shrink-0" />
          {needsReview} source{needsReview > 1 ? "s need" : " needs"} review. Mark them current after verifying the regulation hasn&apos;t changed.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input w-full pl-9"
            placeholder="Search title, citation, or issuing body…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(["all", "regulation", "guidance", "statute", "internal"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
              filterType === t
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No sources found"
          description={search || filterType !== "all" ? "Try adjusting your search or filter." : "Add regulatory sources to build your library."}
          action={
            <Button asChild>
              <Link href="/regulatory-sources">Go to Regulatory Sources</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Card key={s.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm leading-snug">{s.title}</CardTitle>
                  <Badge variant={REVIEW_VARIANT[s.reviewStatus]} className="shrink-0 text-xs">
                    {s.reviewStatus === "needs_review" ? "Needs review" : s.reviewStatus === "under_review" ? "Under review" : s.reviewStatus.charAt(0).toUpperCase() + s.reviewStatus.slice(1)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-2 text-sm">
                {s.citationLabel && (
                  <p className="font-mono text-xs text-muted-foreground">{s.citationLabel}</p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {s.issuingBody && <span>{s.issuingBody}</span>}
                  {s.jurisdiction && <span>· {s.jurisdiction}</span>}
                  <span className="capitalize">· {s.sourceType}</span>
                </div>
                {s.lastCheckedAt && (
                  <p className="text-xs text-muted-foreground">Last checked: {formatDate(s.lastCheckedAt)}</p>
                )}
              </CardContent>
              <div className="flex items-center gap-2 border-t border-border px-4 py-3">
                {s.officialUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={s.officialUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-3" /> View source
                    </a>
                  </Button>
                )}
                {s.reviewStatus === "needs_review" && (
                  <Button size="sm" variant="ghost" onClick={() => markReviewed(s)}>
                    Mark current
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
