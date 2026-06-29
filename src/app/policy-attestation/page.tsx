"use client";

import { useState, useMemo } from "react";
import { CheckCircle2, Search, Plus } from "lucide-react";
import { useCollection, useCreate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate } from "@/lib/dates";
import type { ComplianceDocument } from "@/lib/data/schema";
import { toast } from "sonner";

export default function PolicyAttestationPage() {
  const { profile } = useAuth();
  const docsQ = useCollection("documents");
  const acksQ = useCollection("policyAcks");
  const createMut = useCreate("policyAcks");

  const [search, setSearch] = useState("");
  const [acknowledging, setAcknowledging] = useState<ComplianceDocument | null>(null);
  const [saving, setSaving] = useState(false);

  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const acks = useMemo(() => acksQ.data ?? [], [acksQ.data]);

  const loading = docsQ.isLoading || acksQ.isLoading;
  const isError = docsQ.isError || acksQ.isError;

  // Documents requiring acknowledgment, filtered
  const requiresAck = useMemo(
    () =>
      docs.filter(
        (d) =>
          d.requiresAcknowledgment &&
          d.status === "active" &&
          (!search || d.title.toLowerCase().includes(search.toLowerCase())),
      ),
    [docs, search],
  );

  // Which docs has the current user already acknowledged?
  const ackedDocIds = useMemo(() => {
    if (!profile) return new Set<string>();
    return new Set(
      acks
        .filter((a) => a.userId === profile.userId && a.status === "acknowledged")
        .map((a) => a.documentId),
    );
  }, [acks, profile]);

  const pending = requiresAck.filter((d) => !ackedDocIds.has(d.id)).length;
  const acknowledged = requiresAck.filter((d) => ackedDocIds.has(d.id)).length;

  async function acknowledge(doc: ComplianceDocument) {
    if (!profile) { toast.error("You must be logged in to acknowledge."); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const oneYear = new Date();
      oneYear.setFullYear(oneYear.getFullYear() + 1);
      await createMut.mutateAsync({
        userId: profile.userId,
        userName: profile.fullName,
        documentId: doc.id,
        documentTitle: doc.title,
        status: "acknowledged",
        acknowledgedAt: now,
        expiresAt: oneYear.toISOString(),
      });
      toast.success(`Acknowledged: ${doc.title}`);
      setAcknowledging(null);
    } catch {
      toast.error("Failed to record acknowledgment");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Policy Attestation" />
        <ErrorState
          message="We couldn't load attestation data."
          onRetry={() => { void docsQ.refetch(); void acksQ.refetch(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Acknowledgment confirm modal */}
      {acknowledging && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && !saving && setAcknowledging(null)}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Acknowledge policy</h2>
            </div>
            <div className="p-5 space-y-3">
              <p className="font-medium">{acknowledging.title}</p>
              {acknowledging.summary && (
                <p className="text-sm text-muted-foreground">{acknowledging.summary}</p>
              )}
              <p className="text-sm text-muted-foreground">
                By clicking <strong>Acknowledge</strong>, you confirm that you have read and
                understand this policy. Your acknowledgment will be recorded with a timestamp.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setAcknowledging(null)} disabled={saving}>Cancel</Button>
              <Button onClick={() => acknowledge(acknowledging)} disabled={saving}>
                {saving ? "Recording…" : "Acknowledge"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Policy Attestation"
        description="Staff acknowledgments for required policies. Each acknowledgment is timestamped and expires annually."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending my acknowledgment" value={pending} icon={CheckCircle2} tone={pending ? "warning" : "default"} loading={loading} />
        <StatCard label="Acknowledged by me" value={acknowledged} icon={CheckCircle2} tone="success" loading={loading} />
        <StatCard label="Total ack records" value={acks.length} icon={CheckCircle2} loading={loading} />
      </div>

      {/* My pending */}
      {!loading && pending > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          You have {pending} polic{pending === 1 ? "y" : "ies"} pending acknowledgment.
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input w-full pl-9"
              placeholder="Search policies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : requiresAck.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={search ? "No policies found" : "No policies require acknowledgment"}
              description={search ? "Try adjusting your search." : "Mark a policy as requiring acknowledgment in the SOP Library to list it here."}
            />
          ) : (
            <div className="space-y-3">
              {requiresAck.map((doc) => {
                const acked = ackedDocIds.has(doc.id);
                const ackRecord = acks.find((a) => a.documentId === doc.id && a.userId === profile?.userId);
                return (
                  <div key={doc.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{doc.title}</p>
                        <Badge variant="outline" className="capitalize">{doc.documentType}</Badge>
                        <Badge variant="outline">v{doc.version}</Badge>
                      </div>
                      {doc.summary && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{doc.summary}</p>
                      )}
                      {acked && ackRecord?.acknowledgedAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Acknowledged {formatDate(ackRecord.acknowledgedAt)}
                          {ackRecord.expiresAt && ` · Expires ${formatDate(ackRecord.expiresAt)}`}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {acked ? (
                        <Badge variant="success" className="flex items-center gap-1">
                          <CheckCircle2 className="size-3" /> Acknowledged
                        </Badge>
                      ) : (
                        <Button size="sm" onClick={() => setAcknowledging(doc)}>
                          <Plus className="size-3" /> Acknowledge
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All acknowledgment records (admin view) */}
      {acks.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">All acknowledgment records</h3>
              <Badge variant="secondary">{acks.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Staff member</th>
                    <th className="pb-2 pr-4 font-medium">Document</th>
                    <th className="pb-2 pr-4 font-medium">Acknowledged</th>
                    <th className="pb-2 font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {acks.map((a) => (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-2.5 pr-4 font-medium">{a.userName}</td>
                      <td className="py-2.5 pr-4">{a.documentTitle}</td>
                      <td className="py-2.5 pr-4">{a.acknowledgedAt ? formatDate(a.acknowledgedAt) : "—"}</td>
                      <td className="py-2.5">
                        {a.expiresAt ? (
                          <span className={new Date(a.expiresAt) < new Date() ? "text-destructive" : ""}>
                            {formatDate(a.expiresAt)}
                          </span>
                        ) : "—"}
                      </td>
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
