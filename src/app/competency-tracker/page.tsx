"use client";

import { useState, useMemo } from "react";
import { Award, Plus, Search } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate, daysUntil, isExpired } from "@/lib/dates";

// Competency records are derived from credentials filtered to certification/clearance types.
// A real implementation would have a dedicated CompetencyRecord entity.
// Here we reuse CredentialRecord (type=certification) as the data source and layer
// competency-specific display on top, demonstrating the intent without duplicating schema.

export default function CompetencyTrackerPage() {
  const { data, isLoading, isError, refetch } = useCollection("credentials");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "valid" | "expiring" | "expired">("all");

  const credentials = useMemo(() => data ?? [], [data]);

  // Competencies = credentials with certification, clearance, or training type
  const competencies = useMemo(
    () => credentials.filter((c) => ["certification", "clearance", "training"].includes(c.credentialType)),
    [credentials],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return competencies.filter((c) => {
      if (q && !c.credentialName.toLowerCase().includes(q) && !c.employeeName.toLowerCase().includes(q)) return false;
      if (filterStatus === "valid" && (isExpired(c.expirationDate) || (daysUntil(c.expirationDate) ?? 999) <= 30)) return false;
      if (filterStatus === "expiring") {
        const d = daysUntil(c.expirationDate);
        if (d === null || d < 0 || d > 30) return false;
      }
      if (filterStatus === "expired" && !isExpired(c.expirationDate)) return false;
      return true;
    });
  }, [competencies, search, filterStatus]);

  const stats = useMemo(() => ({
    total: competencies.length,
    valid: competencies.filter((c) => !isExpired(c.expirationDate) && (daysUntil(c.expirationDate) ?? 999) > 30).length,
    expiring: competencies.filter((c) => { const d = daysUntil(c.expirationDate); return d !== null && d >= 0 && d <= 30; }).length,
    expired: competencies.filter((c) => isExpired(c.expirationDate)).length,
  }), [competencies]);

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Competency Tracker" />
        <ErrorState message="We couldn't load competency data." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competency Tracker"
        description="Track staff certifications, clearances, and validated skills. Expiration status is always derived live from validation dates."
        actions={
          <Button asChild variant="outline">
            <a href="/credentials">Manage in Credentials</a>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} icon={Award} loading={isLoading} />
        <StatCard label="Valid" value={stats.valid} icon={Award} tone="success" loading={isLoading} />
        <StatCard label="Expiring ≤30d" value={stats.expiring} icon={Award} tone="warning" loading={isLoading} />
        <StatCard label="Expired" value={stats.expired} icon={Award} tone="destructive" loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search competency or employee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(["all", "valid", "expiring", "expired"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {s === "expiring" ? "Expiring ≤30d" : s.charAt(0).toUpperCase() + s.slice(1)}
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
              icon={Award}
              title="No competencies found"
              description={
                search || filterStatus !== "all"
                  ? "Try adjusting your search or filter."
                  : "Add certifications and clearances in the Credentials section — they'll appear here automatically."
              }
              action={
                <Button asChild>
                  <a href="/credentials"><Plus className="size-4" /> Add in Credentials</a>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Employee</th>
                    <th className="pb-2 pr-4 font-medium">Competency</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Issuing body</th>
                    <th className="pb-2 pr-4 font-medium">Valid until</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const expired = isExpired(c.expirationDate);
                    const days = daysUntil(c.expirationDate);
                    const expiring = !expired && days !== null && days <= 30;
                    return (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="py-3 pr-4 font-medium">{c.employeeName}</td>
                        <td className="py-3 pr-4">{c.credentialName}</td>
                        <td className="py-3 pr-4 capitalize">{c.credentialType}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{c.issuingBody ?? "—"}</td>
                        <td className="py-3 pr-4">
                          {c.expirationDate ? (
                            <div>
                              <div className={expired ? "text-destructive" : expiring ? "text-warning" : ""}>
                                {formatDate(c.expirationDate)}
                              </div>
                              {days !== null && (
                                <div className="text-xs text-muted-foreground">
                                  {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "Today" : `${days}d remaining`}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No expiry</span>
                          )}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={expired ? "destructive" : expiring ? "warning" : "success"}
                          >
                            {expired ? "Expired" : expiring ? "Expiring" : "Valid"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
