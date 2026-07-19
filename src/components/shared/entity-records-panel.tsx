"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Landmark, Shield, Handshake, Building2, ClipboardCheck, ArrowRight } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { FileLink } from "@/components/shared/file-link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/states";
import { formatDate, isExpired, isExpiringSoon } from "@/lib/dates";
import { humanizeLabel } from "@/lib/format";
import type { BusinessRecord } from "@/lib/data/schema";

/**
 * Aggregated 360° view of every document the PRACTICE ENTITY owns — the entity
 * analogue of PersonRecordsPanel (the "My Portal" for the business). It surfaces
 * the native Business Records plus the entity-level documents that live in their
 * own specialized modules (org-wide insurance, group payer contracts, vendor
 * agreements/BAAs, audits), each with a link to manage it in its home module.
 * One stop to SEE them all; edits happen here (native) or via the "Open" link.
 */

const CAT_LABEL: Record<string, string> = {
  license: "Business License", contract: "Contract", insurance: "Entity Insurance",
  baa: "BAA", lease: "Lease", payer_contract: "Group Payer Contract", audit: "Audit",
  vendor: "Vendor Agreement", formation: "Formation / Governance", tax: "Tax / Financial", other: "Other",
};

function dateBadge(date: string | null | undefined): { variant: "success" | "warning" | "destructive" | "secondary"; label: string } | null {
  if (!date) return null;
  if (isExpired(date)) return { variant: "destructive", label: `Expired ${formatDate(date)}` };
  if (isExpiringSoon(date, 60)) return { variant: "warning", label: `Renews ${formatDate(date)}` };
  return { variant: "success", label: `Through ${formatDate(date)}` };
}

export function EntityRecordsPanel({ records, onEditRecord }: {
  records: BusinessRecord[];
  onEditRecord?: (r: BusinessRecord) => void;
}) {
  const insuranceQ = useCollection("insurancePolicies");
  const payerQ = useCollection("payerContracts");
  const vendorsQ = useCollection("vendors");
  const auditsQ = useCollection("audits");

  // Insurance policies with NO individual holder are entity-level coverage
  // (general liability, property, cyber, umbrella) — the rest belong to people.
  const entityInsurance = useMemo(
    () => (insuranceQ.data ?? []).filter((p) => !p.holderUserId && !(p.holderName && p.holderName.trim())),
    [insuranceQ.data],
  );
  const payerContracts = useMemo(() => payerQ.data ?? [], [payerQ.data]);
  const vendors = useMemo(() => vendorsQ.data ?? [], [vendorsQ.data]);
  const audits = useMemo(() => auditsQ.data ?? [], [auditsQ.data]);

  const loading = insuranceQ.isLoading || payerQ.isLoading || vendorsQ.isLoading || auditsQ.isLoading;
  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  const total = records.length + entityInsurance.length + payerContracts.length + vendors.length + audits.length;
  if (total === 0) {
    return <EmptyState icon={Landmark} title="No business documents yet" description="Add a record above, or file entity documents through Document Intake." />;
  }

  return (
    <div className="space-y-4">
      {/* Native business records, newest first */}
      {records.length > 0 && (
        <Section icon={Landmark} title="Business Records" count={records.length}>
          {[...records]
            .sort((a, b) => (b.expirationDate ?? b.effectiveDate ?? b.createdDate).localeCompare(a.expirationDate ?? a.effectiveDate ?? a.createdDate))
            .map((r) => {
              const badge = dateBadge(r.expirationDate) ?? (r.status ? { variant: "secondary" as const, label: humanizeLabel(r.status) } : null);
              return (
                <Row key={r.id}
                  onClick={onEditRecord ? () => onEditRecord(r) : undefined}
                  left={<span className="font-medium">{r.title}</span>}
                  sub={[CAT_LABEL[r.category] ?? r.category, r.counterparty ?? "", r.identifier ? `#${r.identifier}` : ""].filter(Boolean).join(" · ")}
                  right={badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                  fileUrl={r.documentUrl ?? undefined}
                />
              );
            })}
        </Section>
      )}

      {/* Entity insurance (org-wide policies from the Insurance Vault) */}
      {entityInsurance.length > 0 && (
        <Section icon={Shield} title="Entity Insurance" count={entityInsurance.length} href="/insurance-vault">
          {entityInsurance.map((p) => {
            const badge = dateBadge(p.renewalDate);
            return (
              <Row key={p.id}
                left={<span className="font-medium">{p.policyName}</span>}
                sub={[humanizeLabel(p.policyType), p.carrierName ?? "", p.policyNumber ? `#${p.policyNumber}` : ""].filter(Boolean).join(" · ")}
                right={badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                fileUrl={p.documentUrl ?? undefined}
              />
            );
          })}
        </Section>
      )}

      {/* Group payer contracts (Payer Enrollment) */}
      {payerContracts.length > 0 && (
        <Section icon={Handshake} title="Group Payer Contracts" count={payerContracts.length} href="/payer-enrollment">
          {payerContracts.map((c) => {
            const badge = dateBadge(c.renewalDate) ?? { variant: c.contractStatus === "active" ? "success" as const : "secondary" as const, label: humanizeLabel(c.contractStatus) };
            return (
              <Row key={c.id}
                left={<span className="font-medium">{c.payerName}</span>}
                sub={[c.planNetwork ?? "", c.contractLevel === "group" ? "Group" : "Individual", c.effectiveDate ? `eff ${formatDate(c.effectiveDate)}` : ""].filter(Boolean).join(" · ")}
                right={<Badge variant={badge.variant}>{badge.label}</Badge>}
                fileUrl={c.contractDocumentUrl ?? undefined}
              />
            );
          })}
        </Section>
      )}

      {/* Vendor agreements & BAAs (Vendor Management) */}
      {vendors.length > 0 && (
        <Section icon={Building2} title="Vendor Agreements & BAAs" count={vendors.length} href="/vendor-management">
          {vendors.map((v) => {
            const baa = v.baaStatus && v.baaStatus !== "not_required";
            return (
              <Row key={v.id}
                left={<span className="font-medium">{v.vendorName}</span>}
                sub={[humanizeLabel(v.vendorType), baa ? `BAA ${humanizeLabel(v.baaStatus)}` : ""].filter(Boolean).join(" · ")}
                right={<Badge variant={v.status === "active" ? "success" : v.status === "terminated" || v.status === "suspended" ? "destructive" : "secondary"}>{humanizeLabel(v.status)}</Badge>}
                fileUrl={v.baaDocumentUrl ?? v.insuranceDocumentUrl ?? undefined}
              />
            );
          })}
        </Section>
      )}

      {/* Audits & accreditation (Audits module) */}
      {audits.length > 0 && (
        <Section icon={ClipboardCheck} title="Audits & Accreditation" count={audits.length} href="/audits">
          {audits.map((a) => (
            <Row key={a.id}
              left={<span className="font-medium">{a.title}</span>}
              sub={[humanizeLabel(a.auditType), a.auditDate ? formatDate(a.auditDate) : "", a.auditorName ?? ""].filter(Boolean).join(" · ")}
              right={<Badge variant={a.status === "complete" ? "success" : a.status === "planned" ? "secondary" : "warning"}>{humanizeLabel(a.status)}</Badge>}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, count, href, children }: {
  icon: typeof Landmark; title: string; count: number; href?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary">{count}</Badge>
        </div>
        {href && (
          <Link href={href} className="flex items-center gap-1 text-xs text-primary hover:underline">
            Open <ArrowRight className="size-3" />
          </Link>
        )}
      </div>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  );
}

function Row({ left, sub, right, fileUrl, onClick }: {
  left: React.ReactNode; sub?: string; right?: React.ReactNode; fileUrl?: string; onClick?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`min-w-0 flex-1 text-left ${onClick ? "cursor-pointer rounded hover:opacity-80" : "cursor-default"}`}
      >
        <div className="truncate text-sm">{left}</div>
        {sub && <div className="truncate text-xs capitalize text-muted-foreground">{sub}</div>}
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        {fileUrl && <FileLink path={fileUrl} iconOnly label="View file" className="text-muted-foreground hover:text-primary" />}
      </div>
    </div>
  );
}
