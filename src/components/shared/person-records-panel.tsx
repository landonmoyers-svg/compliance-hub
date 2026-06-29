"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BadgeCheck, Shield, FolderLock, GraduationCap, Award, CheckCircle2, ArrowRight, ExternalLink } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { credentialStatus } from "@/lib/compliance";
import { formatDate } from "@/lib/dates";

/**
 * Aggregated 360° view of every record linked to one person — the same rows
 * that appear on the domain pages, surfaced here filtered to this person.
 * Matches by stable userId where available, falling back to name. Used by the
 * admin person view (User Management) and the staff member's own portal.
 */
export function PersonRecordsPanel({ userId, name }: { userId: string | null; name: string }) {
  const credsQ = useCollection("credentials");
  const insuranceQ = useCollection("insurancePolicies");
  const empDocsQ = useCollection("employeeDocuments");
  const trainingQ = useCollection("trainingAssignments");
  const compQ = useCollection("competencyRecords");
  const acksQ = useCollection("policyAcks");

  const matchesPerson = useMemo(() => {
    const lname = name.trim().toLowerCase();
    return (rec: { uid?: string | null; nm?: string | null }) => {
      if (userId && rec.uid && rec.uid === userId) return true;
      if (lname && rec.nm && rec.nm.trim().toLowerCase() === lname) return true;
      return false;
    };
  }, [userId, name]);

  const creds = useMemo(
    () => (credsQ.data ?? []).filter((c) => matchesPerson({ uid: c.employeeUserId, nm: c.employeeName })),
    [credsQ.data, matchesPerson],
  );
  const insurance = useMemo(
    () => (insuranceQ.data ?? []).filter((p) => matchesPerson({ uid: p.holderUserId, nm: p.holderName })),
    [insuranceQ.data, matchesPerson],
  );
  const empDocs = useMemo(
    () => (empDocsQ.data ?? []).filter((d) => matchesPerson({ uid: d.employeeId, nm: d.employeeName })),
    [empDocsQ.data, matchesPerson],
  );
  const training = useMemo(
    () => (trainingQ.data ?? []).filter((a) => matchesPerson({ uid: a.assignedToUserId, nm: a.assignedToName })),
    [trainingQ.data, matchesPerson],
  );
  const competencies = useMemo(
    () => (compQ.data ?? []).filter((c) => matchesPerson({ uid: c.employeeId, nm: c.employeeName })),
    [compQ.data, matchesPerson],
  );
  const acks = useMemo(
    () => (acksQ.data ?? []).filter((a) => userId && a.userId === userId),
    [acksQ.data, userId],
  );

  const loading = credsQ.isLoading || insuranceQ.isLoading || trainingQ.isLoading;

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  const totalRecords = creds.length + insurance.length + empDocs.length + training.length + competencies.length + acks.length;
  if (totalRecords === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No linked records for {name || "this person"} yet. Add credentials, insurance, or training and assign them to this person.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Credentials */}
      {creds.length > 0 && (
        <Section icon={BadgeCheck} title="Credentials" count={creds.length} href="/credentials">
          {creds.map((c) => {
            const st = credentialStatus(c);
            return (
              <Row key={c.id}
                left={<span className="font-medium">{c.credentialName}</span>}
                sub={c.issuingBody ?? c.credentialType}
                right={
                  <Badge variant={st === "active" ? "success" : st === "expiring_soon" ? "warning" : st === "expired" ? "destructive" : "secondary"}>
                    {st === "no_expiry" ? "No expiry" : st.replace("_", " ")}
                    {c.expirationDate ? ` · ${formatDate(c.expirationDate)}` : ""}
                  </Badge>
                }
                fileUrl={c.documentUrl ?? undefined}
              />
            );
          })}
        </Section>
      )}

      {/* Insurance */}
      {insurance.length > 0 && (
        <Section icon={Shield} title="Insurance" count={insurance.length} href="/insurance-vault">
          {insurance.map((p) => (
            <Row key={p.id}
              left={<span className="font-medium">{p.policyName}</span>}
              sub={[p.policyType, p.carrierName].filter(Boolean).join(" · ")}
              right={p.renewalDate ? <span className="text-xs text-muted-foreground">Renews {formatDate(p.renewalDate)}</span> : null}
              fileUrl={p.documentUrl ?? undefined}
            />
          ))}
        </Section>
      )}

      {/* Employee documents */}
      {empDocs.length > 0 && (
        <Section icon={FolderLock} title="HR documents" count={empDocs.length} href="/employee-vault">
          {empDocs.map((d) => (
            <Row key={d.id}
              left={<span className="font-medium">{d.title}</span>}
              sub={d.documentType.replace(/_/g, " ")}
              right={d.sensitive ? <Badge variant="warning">Restricted</Badge> : null}
              fileUrl={d.fileUrl ?? undefined}
            />
          ))}
        </Section>
      )}

      {/* Training */}
      {training.length > 0 && (
        <Section icon={GraduationCap} title="Training" count={training.length} href="/training">
          {training.map((a) => (
            <Row key={a.id}
              left={<span className="font-medium">{a.moduleTitle}</span>}
              sub={a.dueDate ? `Due ${formatDate(a.dueDate)}` : undefined}
              right={
                <Badge variant={a.status === "completed" ? "success" : "secondary"}>
                  {a.status === "completed" ? `Completed${a.score != null ? ` · ${a.score}%` : ""}` : a.status.replace("_", " ")}
                </Badge>
              }
            />
          ))}
        </Section>
      )}

      {/* Competencies */}
      {competencies.length > 0 && (
        <Section icon={Award} title="Competencies" count={competencies.length} href="/competency-tracker">
          {competencies.map((c) => (
            <Row key={c.id}
              left={<span className="font-medium">{c.competencyName}</span>}
              sub={c.competencyType}
              right={<Badge variant={c.status === "passed" ? "success" : c.status === "failed" || c.status === "expired" ? "destructive" : "secondary"}>{c.status}</Badge>}
            />
          ))}
        </Section>
      )}

      {/* Acknowledgments */}
      {acks.length > 0 && (
        <Section icon={CheckCircle2} title="Policy acknowledgments" count={acks.length} href="/policy-attestation">
          {acks.map((a) => (
            <Row key={a.id}
              left={<span className="font-medium">{a.documentTitle}</span>}
              sub={a.acknowledgedAt ? `Acknowledged ${formatDate(a.acknowledgedAt)}` : undefined}
              right={<Badge variant={a.status === "acknowledged" ? "success" : "warning"}>{a.status}</Badge>}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, count, href, children }: {
  icon: typeof BadgeCheck; title: string; count: number; href: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary">{count}</Badge>
        </div>
        <Link href={href} className="flex items-center gap-1 text-xs text-primary hover:underline">
          Open <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  );
}

function Row({ left, sub, right, fileUrl }: {
  left: React.ReactNode; sub?: string; right?: React.ReactNode; fileUrl?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm">{left}</div>
        {sub && <div className="truncate text-xs capitalize text-muted-foreground">{sub}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary" aria-label="View file">
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
