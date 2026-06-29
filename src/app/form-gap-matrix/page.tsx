"use client";

import { useMemo } from "react";
import { Grid3x3, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

// The gap matrix maps required regulatory areas to their corresponding documents.
// Each row is a requirement; each column is a document type.
// Green = document exists and is current. Red = missing. Yellow = exists but needs review.

interface RequirementRow {
  area: string;
  requirement: string;
  regulatoryBasis: string;
  docTypes: string[];
}

const REQUIREMENTS: RequirementRow[] = [
  { area: "HIPAA", requirement: "Notice of Privacy Practices", regulatoryBasis: "45 CFR §164.520", docTypes: ["policy"] },
  { area: "HIPAA", requirement: "HIPAA Security Policy", regulatoryBasis: "45 CFR §164.308", docTypes: ["policy"] },
  { area: "HIPAA", requirement: "Breach Notification Policy", regulatoryBasis: "45 CFR §164.400", docTypes: ["policy"] },
  { area: "HIPAA", requirement: "Business Associate Agreement template", regulatoryBasis: "45 CFR §164.314", docTypes: ["form"] },
  { area: "OSHA", requirement: "Hazard Communication Program", regulatoryBasis: "29 CFR 1910.1200", docTypes: ["sop", "policy"] },
  { area: "OSHA", requirement: "Bloodborne Pathogen Exposure Control Plan", regulatoryBasis: "29 CFR 1910.1030", docTypes: ["policy", "sop"] },
  { area: "OSHA", requirement: "Emergency Action Plan", regulatoryBasis: "29 CFR 1910.38", docTypes: ["policy"] },
  { area: "DEA", requirement: "Controlled Substance Disposal Policy", regulatoryBasis: "21 CFR §1317", docTypes: ["policy", "sop"] },
  { area: "CMHC", requirement: "Informed Consent for Treatment", regulatoryBasis: "State BHO Rules", docTypes: ["form"] },
  { area: "CMHC", requirement: "Client Rights Policy", regulatoryBasis: "State BHO Rules", docTypes: ["policy"] },
  { area: "HR", requirement: "Equal Employment Opportunity Policy", regulatoryBasis: "Title VII / EEOC", docTypes: ["policy"] },
  { area: "HR", requirement: "Anti-Harassment Policy", regulatoryBasis: "EEOC Guidelines", docTypes: ["policy"] },
  { area: "HR", requirement: "FMLA Policy", regulatoryBasis: "29 CFR Part 825", docTypes: ["policy"] },
  { area: "General", requirement: "Records Retention Schedule", regulatoryBasis: "State/Federal", docTypes: ["reference"] },
  { area: "General", requirement: "Confidentiality / Non-Disclosure Policy", regulatoryBasis: "General", docTypes: ["policy"] },
];

function docTypeMatch(docTitle: string, reqType: string): boolean {
  const t = docTitle.toLowerCase();
  if (reqType === "policy" && (t.includes("policy") || t.includes("plan") || t.includes("program"))) return true;
  if (reqType === "sop" && (t.includes("procedure") || t.includes("sop") || t.includes("protocol"))) return true;
  if (reqType === "form" && (t.includes("form") || t.includes("consent") || t.includes("agreement"))) return true;
  if (reqType === "reference" && (t.includes("reference") || t.includes("schedule") || t.includes("manual") || t.includes("handbook"))) return true;
  return false;
}

function requirementMatch(doc: { title: string }, req: RequirementRow): boolean {
  const t = doc.title.toLowerCase();
  const key = req.requirement.toLowerCase();
  const words = key.split(" ").filter((w) => w.length > 4);
  return words.filter((w) => t.includes(w)).length >= 2;
}

type GapStatus = "covered" | "partial" | "missing";

export default function FormGapMatrixPage() {
  const { data, isLoading } = useCollection("documents");
  const docs = useMemo(() => (data ?? []).filter((d) => d.status === "active"), [data]);

  const matrix = useMemo(() => {
    return REQUIREMENTS.map((req) => {
      const matches = docs.filter((d) => requirementMatch(d, req));
      const typeMatches = docs.filter((d) => req.docTypes.some((t) => docTypeMatch(d.title, t)));
      let status: GapStatus;
      if (matches.length > 0) status = "covered";
      else if (typeMatches.length > 0) status = "partial";
      else status = "missing";
      return { req, status, matchCount: matches.length, docs: matches };
    });
  }, [docs]);

  const stats = useMemo(() => ({
    covered: matrix.filter((r) => r.status === "covered").length,
    partial: matrix.filter((r) => r.status === "partial").length,
    missing: matrix.filter((r) => r.status === "missing").length,
  }), [matrix]);

  const areas = [...new Set(REQUIREMENTS.map((r) => r.area))];

  const STATUS_ICON: Record<GapStatus, React.ReactNode> = {
    covered: <CheckCircle2 className="size-4 text-success" />,
    partial: <MinusCircle className="size-4 text-warning" />,
    missing: <XCircle className="size-4 text-destructive" />,
  };

  const STATUS_VARIANT: Record<GapStatus, "success" | "warning" | "destructive"> = {
    covered: "success",
    partial: "warning",
    missing: "destructive",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Form Gap Matrix"
        description="Maps regulatory requirements to existing documents. Identifies what is covered, partial, or missing in your SOP Library."
        actions={
          <Link href="/sop-library" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/30 transition-colors">
            Open SOP Library
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Requirements covered" value={stats.covered} icon={Grid3x3} tone="success" loading={isLoading} />
        <StatCard label="Partial coverage" value={stats.partial} icon={Grid3x3} tone="warning" loading={isLoading} />
        <StatCard label="Missing documents" value={stats.missing} icon={Grid3x3} tone="destructive" loading={isLoading} />
      </div>

      {stats.missing > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {stats.missing} regulatory requirement{stats.missing > 1 ? "s are" : " is"} not covered by any document in your SOP Library. Add the missing documents to close these gaps.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {areas.map((area) => {
            const rows = matrix.filter((r) => r.req.area === area);
            return (
              <Card key={area}>
                <CardHeader>
                  <CardTitle className="text-sm">{area}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {rows.map(({ req, status, docs: matched }) => (
                      <div key={req.requirement} className="flex items-start gap-3 rounded-lg p-3 hover:bg-secondary/20">
                        <div className="mt-0.5">{STATUS_ICON[status]}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm">{req.requirement}</p>
                            <Badge variant={STATUS_VARIANT[status]} className="shrink-0 text-xs capitalize">
                              {status === "partial" ? "Partial" : status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{req.regulatoryBasis}</p>
                          {matched.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {matched.map((d) => (
                                <span key={d.id} className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs">
                                  {d.title}
                                </span>
                              ))}
                            </div>
                          )}
                          {status === "missing" && (
                            <Link href="/sop-library" className="mt-1.5 inline-flex items-center text-xs text-primary hover:underline">
                              Add document →
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
