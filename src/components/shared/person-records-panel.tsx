"use client";

import { useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BadgeCheck, Shield, FolderLock, GraduationCap, Award, CheckCircle2, ArrowRight, Printer } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { FileLink } from "@/components/shared/file-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { credentialStatus } from "@/lib/compliance";
import { formatDate } from "@/lib/dates";
import { humanizeLabel } from "@/lib/format";
import { inferProviderType } from "@/lib/credential-requirements";
import { openPacket } from "@/lib/audit-packet";
import { RequirementsChecklist } from "@/components/shared/requirements-checklist";
import { RESTRICTED_EMPLOYEE_DOC_TYPES } from "@/lib/data/schema";

/**
 * Aggregated 360° view of every record linked to one person — the same rows
 * that appear on the domain pages, surfaced here filtered to this person.
 * Matches by stable userId where available, falling back to name. Used by the
 * admin person view (User Management) and the staff member's own portal.
 */
/** Order records so the most current sit on top: no-expiry first, then by
 *  expiration date descending (latest expiration high, oldest at the bottom). */
function byExpiryDesc<T>(getDate: (x: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const da = getDate(a), db = getDate(b);
    if (!da && !db) return 0;
    if (!da) return -1; // no expiration → treat as most current → top
    if (!db) return 1;
    return db.localeCompare(da); // ISO dates: later date first
  };
}

export function PersonRecordsPanel({ userId, name }: { userId: string | null; name: string }) {
  const credsQ = useCollection("credentials");
  const insuranceQ = useCollection("insurancePolicies");
  const empDocsQ = useCollection("employeeDocuments");
  const trainingQ = useCollection("trainingAssignments");
  const compQ = useCollection("competencyRecords");
  const acksQ = useCollection("policyAcks");
  const employeesQ = useCollection("employees");
  const orgQ = useCollection("organizationSettings");

  // Resolve the person's employee-directory record so we can match records that
  // key off employees.id (competencies, employee documents) rather than the auth
  // user id. Without this those records only ever match by name — and drop off
  // the panel after a rename.
  const emp = useMemo(() => {
    const lname = name.trim().toLowerCase();
    return (employeesQ.data ?? []).find(
      (e) => (userId && e.userId === userId) || `${e.firstName} ${e.lastName}`.trim().toLowerCase() === lname,
    );
  }, [employeesQ.data, userId, name]);
  const employeeId = emp?.id;

  const matchesPerson = useMemo(() => {
    const lname = name.trim().toLowerCase();
    return (rec: { uid?: string | null; nm?: string | null }) => {
      if (userId && rec.uid && rec.uid === userId) return true;
      if (lname && rec.nm && rec.nm.trim().toLowerCase() === lname) return true;
      return false;
    };
  }, [userId, name]);
  // For collections whose person id is employees.id (not the auth user id).
  const matchesByEmployeeId = useMemo(() => {
    const lname = name.trim().toLowerCase();
    return (rec: { eid?: string | null; nm?: string | null }) => {
      if (employeeId && rec.eid && rec.eid === employeeId) return true;
      if (lname && rec.nm && rec.nm.trim().toLowerCase() === lname) return true;
      return false;
    };
  }, [employeeId, name]);

  const creds = useMemo(
    () => (credsQ.data ?? []).filter((c) => matchesPerson({ uid: c.employeeUserId, nm: c.employeeName }))
      .sort(byExpiryDesc((c) => c.expirationDate)),
    [credsQ.data, matchesPerson],
  );
  const insurance = useMemo(
    () => (insuranceQ.data ?? []).filter((p) => matchesPerson({ uid: p.holderUserId, nm: p.holderName }))
      .sort(byExpiryDesc((p) => p.renewalDate)),
    [insuranceQ.data, matchesPerson],
  );
  const empDocs = useMemo(
    () => (empDocsQ.data ?? []).filter((d) => matchesByEmployeeId({ eid: d.employeeId, nm: d.employeeName })),
    [empDocsQ.data, matchesByEmployeeId],
  );
  const training = useMemo(
    () => (trainingQ.data ?? []).filter((a) => matchesPerson({ uid: a.assignedToUserId, nm: a.assignedToName })),
    [trainingQ.data, matchesPerson],
  );
  const competencies = useMemo(
    () => (compQ.data ?? []).filter((c) => matchesByEmployeeId({ eid: c.employeeId, nm: c.employeeName })),
    [compQ.data, matchesByEmployeeId],
  );
  const acks = useMemo(
    () => (acksQ.data ?? []).filter((a) => userId && a.userId === userId),
    [acksQ.data, userId],
  );

  // The person's clinical role drives which credentials they must keep current.
  const providerType = useMemo(() => inferProviderType(emp?.jobRole, emp?.title), [emp]);

  const loading = credsQ.isLoading || insuranceQ.isLoading || trainingQ.isLoading;

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  const checklist = <RequirementsChecklist providerType={providerType} creds={creds} insurance={insurance} holderName={name} holderUserId={userId} />;

  function handleExportPacket() {
    const opened = openPacket({
      name,
      providerType,
      orgName: orgQ.data?.[0]?.orgName,
      creds,
      insurance,
      training: training.map((a) => ({ moduleTitle: a.moduleTitle, status: a.status, score: a.score, dueDate: a.dueDate })),
      competencies: competencies.map((c) => ({ competencyName: c.competencyName, competencyType: c.competencyType, status: c.status })),
      acks: acks.map((a) => ({ documentTitle: a.documentTitle, status: a.status, acknowledgedAt: a.acknowledgedAt })),
    });
    if (!opened) toast.error("Allow pop-ups to open the compliance packet.");
  }

  const exportButton = (
    <Button variant="outline" size="sm" onClick={handleExportPacket} className="gap-1.5">
      <Printer className="size-4" /> Export packet
    </Button>
  );

  const totalRecords = creds.length + insurance.length + empDocs.length + training.length + competencies.length + acks.length;
  if (totalRecords === 0) {
    return (
      <div className="space-y-4">
        {checklist}
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No linked records for {name || "this person"} yet. Add credentials, insurance, or training and assign them to this person.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">{exportButton}</div>
      {checklist}

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
                    {st === "no_expiry" ? "No expiry" : humanizeLabel(st)}
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
          {empDocs.map((d) => {
            const restricted = d.sensitive || RESTRICTED_EMPLOYEE_DOC_TYPES.includes(d.documentType);
            return (
              <Row key={d.id}
                left={<span className="font-medium">{d.title}</span>}
                sub={humanizeLabel(d.documentType)}
                right={restricted ? <Badge variant="warning">Restricted</Badge> : null}
                fileUrl={d.fileUrl ?? undefined}
                audit={restricted ? { entityType: "employee_documents", entityId: d.id, entityLabel: `${d.title} — ${name}`, details: "Opened restricted personnel document" } : undefined}
              />
            );
          })}
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
                  {a.status === "completed" ? `Completed${a.score != null ? ` · ${a.score}%` : ""}` : humanizeLabel(a.status)}
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
              sub={humanizeLabel(c.competencyType)}
              right={<Badge variant={c.status === "passed" ? "success" : c.status === "failed" || c.status === "expired" ? "destructive" : "secondary"}>{humanizeLabel(c.status)}</Badge>}
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
              right={<Badge variant={a.status === "acknowledged" ? "success" : "warning"}>{humanizeLabel(a.status)}</Badge>}
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

function Row({ left, sub, right, fileUrl, audit }: {
  left: React.ReactNode; sub?: string; right?: React.ReactNode; fileUrl?: string;
  audit?: { entityType: string; entityId: string; entityLabel?: string; details?: string };
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm">{left}</div>
        {sub && <div className="truncate text-xs capitalize text-muted-foreground">{sub}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        {fileUrl && <FileLink path={fileUrl} iconOnly label="View file" className="text-muted-foreground hover:text-primary" audit={audit} />}
      </div>
    </div>
  );
}
