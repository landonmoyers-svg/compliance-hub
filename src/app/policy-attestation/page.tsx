"use client";

import { useState, useMemo } from "react";
import { CheckCircle2, Search, FileText, X } from "lucide-react";
import { useCollection, useCreate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { PersonLink } from "@/components/shared/person-link";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate } from "@/lib/dates";
import { humanizeLabel } from "@/lib/format";
import type { ComplianceDocument, PolicyAcknowledgment } from "@/lib/data/schema";
import { AttestDocumentDialog } from "@/components/attestation/attest-document-dialog";
import { documentFingerprint, ackCoversCurrent, ackStatusFor, pendingAttestations, type AckStatus } from "@/lib/attestation";
import { FileLink } from "@/components/shared/file-link";

const ACK_STATUS_BADGE: Record<AckStatus, { label: string; variant: "success" | "secondary" | "warning" | "destructive" }> = {
  current: { label: "Current", variant: "success" },
  superseded: { label: "Superseded", variant: "secondary" },
  expired: { label: "Expired", variant: "destructive" },
  recorded: { label: "On record", variant: "secondary" },
};

export default function PolicyAttestationPage() {
  const { profile, isAdmin } = useAuth();
  const docsQ = useCollection("documents");
  const acksQ = useCollection("policyAcks");
  const employeesQ = useCollection("employees");

  const [search, setSearch] = useState("");
  const [signingDoc, setSigningDoc] = useState<ComplianceDocument | null>(null);
  const [viewingAck, setViewingAck] = useState<PolicyAcknowledgment | null>(null);

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

  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

  // Policies the current user still needs to (re-)attest to — fingerprint-aware,
  // so an updated policy reappears as pending until re-signed.
  const myPendingIds = useMemo(
    () => new Set(profile ? pendingAttestations(docs, acks, profile.userId).map((d) => d.id) : []),
    [docs, acks, profile],
  );

  const { sorted: sortedAcks, sort, toggle } = useSort(acks, {
    staff: (a) => a.userName,
    document: (a) => a.documentTitle,
    acknowledged: (a) => a.acknowledgedAt,
    expires: (a) => a.expiresAt,
  });

  const pending = requiresAck.filter((d) => myPendingIds.has(d.id)).length;
  const acknowledged = requiresAck.length - pending;

  // ATT-1: org-wide completion per policy (admin view). Only active employees
  // with a login can acknowledge in-app, so that's the honest denominator; we
  // surface how many active staff still have no login separately.
  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);
  const orgCompletion = useMemo(() => {
    const activeWithLogin = employees.filter((e) => e.employmentStatus === "active" && e.userId);
    const noLoginCount = employees.filter((e) => e.employmentStatus === "active" && !e.userId).length;
    // userId -> set of documentIds whose CURRENT version this user has signed.
    const docFp = new Map(requiresAck.map((d) => [d.id, documentFingerprint(d)]));
    const ackedByUser = new Map<string, Set<string>>();
    for (const a of acks) {
      if (!a.userId) continue;
      const fp = docFp.get(a.documentId);
      if (!fp || !ackCoversCurrent(a, fp)) continue;
      if (!ackedByUser.has(a.userId)) ackedByUser.set(a.userId, new Set());
      ackedByUser.get(a.userId)!.add(a.documentId);
    }
    const perPolicy = requiresAck.map((doc) => {
      const done = activeWithLogin.filter((e) => ackedByUser.get(e.userId!)?.has(doc.id));
      const pendingStaff = activeWithLogin.filter((e) => !ackedByUser.get(e.userId!)?.has(doc.id));
      return { doc, doneCount: done.length, total: activeWithLogin.length, pendingStaff };
    });
    return { perPolicy, activeWithLoginCount: activeWithLogin.length, noLoginCount };
  }, [employees, acks, requiresAck]);

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
      {/* Read & sign the actual policy (records an immutable snapshot). */}
      {signingDoc && profile && (
        <AttestDocumentDialog doc={signingDoc} userId={profile.userId} userName={profile.fullName} onClose={() => setSigningDoc(null)} onSigned={() => void acksQ.refetch()} />
      )}

      {/* View the permanently-attached signed copy of a past attestation. */}
      {viewingAck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setViewingAck(null)}>
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Signed copy on record</p>
                <h2 className="font-semibold leading-tight">{viewingAck.documentTitle}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Signed by {viewingAck.userName}{viewingAck.acknowledgedAt ? ` on ${formatDate(viewingAck.acknowledgedAt)}` : ""}{viewingAck.documentVersion ? ` · version ${viewingAck.documentVersion}` : ""}</p>
              </div>
              <button onClick={() => setViewingAck(null)} className="rounded-md p-1 text-muted-foreground hover:bg-secondary"><X className="size-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {viewingAck.signedContent ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{viewingAck.signedContent}</div>
              ) : viewingAck.signedFileUrl ? (
                <FileLink path={viewingAck.signedFileUrl} label="Open the signed document"
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90" />
              ) : (
                <p className="text-sm text-muted-foreground">This is a legacy attestation recorded before signed copies were captured; only the signature date is on record.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Policy Attestation"
        description="Staff read and sign the actual policy. Each signature captures an immutable copy of the exact version signed — if a policy is updated, staff are prompted to re-attest and the prior signature is kept, marked superseded."
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
                const acked = !myPendingIds.has(doc.id);
                const fp = documentFingerprint(doc);
                const ackRecord = acks.find((a) => a.documentId === doc.id && a.userId === profile?.userId && ackCoversCurrent(a, fp));
                return (
                  <div key={doc.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{doc.title}</p>
                        <Badge variant="outline" className="capitalize">{humanizeLabel(doc.documentType)}</Badge>
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
                          <CheckCircle2 className="size-3" /> Signed
                        </Badge>
                      ) : (
                        <Button size="sm" onClick={() => setSigningDoc(doc)}>
                          <FileText className="size-3" /> Read &amp; sign
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

      {/* ATT-1: org-wide completion per policy (admin) */}
      {isAdmin && !loading && requiresAck.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Completion by policy</h3>
              <p className="text-xs text-muted-foreground">
                Across {orgCompletion.activeWithLoginCount} active staff with a login
                {orgCompletion.noLoginCount > 0 && ` · ${orgCompletion.noLoginCount} active staff have no login yet and can't acknowledge in-app`}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {orgCompletion.perPolicy.map(({ doc, doneCount, total, pendingStaff }) => {
                const pct = total ? Math.round((doneCount / total) * 100) : 0;
                return (
                  <div key={doc.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{doc.title}</p>
                      <Badge variant={pct === 100 ? "success" : pct >= 80 ? "secondary" : "warning"}>{doneCount}/{total} · {pct}%</Badge>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div className={pct === 100 ? "h-full bg-success" : "h-full bg-warning"} style={{ width: `${pct}%` }} />
                    </div>
                    {pendingStaff.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Pending:</span>{" "}
                        {pendingStaff.slice(0, 8).map((e, i) => (
                          <span key={e.id}>{i > 0 ? ", " : ""}<PersonLink userId={e.userId ?? null} name={`${e.firstName} ${e.lastName}`.trim()} /></span>
                        ))}
                        {pendingStaff.length > 8 && ` +${pendingStaff.length - 8} more`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Staff member" sortKey="staff" sort={sort} onToggle={toggle} />
                    <SortHeader label="Document" sortKey="document" sort={sort} onToggle={toggle} />
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <SortHeader label="Signed" sortKey="acknowledged" sort={sort} onToggle={toggle} />
                    <SortHeader label="Expires" sortKey="expires" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Signed copy</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAcks.map((a) => {
                    const st = ackStatusFor(a, docById.get(a.documentId));
                    const badge = ACK_STATUS_BADGE[st];
                    return (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td data-label="Staff member" className="py-2.5 pr-4 font-medium">
                        <PersonLink userId={a.userId ?? null} name={a.userName} />
                      </td>
                      <td data-label="Document" className="py-2.5 pr-4">{a.documentTitle}{a.documentVersion ? <span className="text-muted-foreground"> · v{a.documentVersion}</span> : null}</td>
                      <td data-label="Status" className="py-2.5 pr-4"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                      <td data-label="Signed" className="py-2.5 pr-4">{a.acknowledgedAt ? formatDate(a.acknowledgedAt) : "—"}</td>
                      <td data-label="Expires" className="py-2.5 pr-4">
                        {a.expiresAt ? (
                          <span className={new Date(a.expiresAt) < new Date() ? "text-destructive" : ""}>
                            {formatDate(a.expiresAt)}
                          </span>
                        ) : "—"}
                      </td>
                      <td data-label="Signed copy" className="py-2.5">
                        {(a.signedContent || a.signedFileUrl) ? (
                          <Button size="sm" variant="ghost" onClick={() => setViewingAck(a)}>View</Button>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
