"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Grid3x3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { FormPreview } from "@/components/shared/form-preview";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  FillableFormTemplate,
  FormCategory,
  FormField,
} from "@/lib/data/schema";
import { toast } from "sonner";

/**
 * Form Gap Matrix
 * ---------------
 * Cross-references the forms a behavioral-health practice SHOULD have (the
 * REQUIRED_FORMS audit list below, grouped by compliance area) against the
 * fillable form templates that actually exist in the "formTemplates"
 * collection. Surfaces which required forms are MISSING and lets an admin
 * generate a clearly-marked DRAFT template for any gap.
 */

interface RequiredForm {
  name: string;
  category: FormCategory;
  description: string;
}

// The compliance audit baseline. Each entry is a form the practice is expected
// to maintain; the matrix compares these against actual templates by category.
const REQUIRED_FORMS: RequiredForm[] = [
  // HIPAA
  { name: "Notice of Privacy Practices Acknowledgment", category: "hipaa", description: "Patient signature confirming receipt of the practice's Notice of Privacy Practices (45 CFR §164.520)." },
  { name: "Authorization to Release PHI", category: "hipaa", description: "Patient authorization permitting disclosure of protected health information to a named third party." },
  { name: "Business Associate Agreement", category: "hipaa", description: "Contract binding vendors with PHI access to HIPAA safeguards (45 CFR §164.314)." },
  { name: "Breach Notification Form", category: "hipaa", description: "Internal record documenting a suspected or confirmed PHI breach and the response taken." },

  // OSHA / Safety
  { name: "Bloodborne Pathogen Exposure Report", category: "osha_safety", description: "Documents employee exposure incidents under the Bloodborne Pathogens standard (29 CFR 1910.1030)." },
  { name: "OSHA 300 Injury Log", category: "osha_safety", description: "Annual log of recordable work-related injuries and illnesses (29 CFR 1904)." },
  { name: "Hazard Communication Acknowledgment", category: "osha_safety", description: "Employee attestation of HazCom training and SDS access (29 CFR 1910.1200)." },
  { name: "Safety Incident Report", category: "osha_safety", description: "General workplace safety incident or near-miss report for corrective tracking." },

  // HR Onboarding
  { name: "I-9 Employment Eligibility", category: "hr_onboarding", description: "Federal verification of identity and authorization to work in the United States." },
  { name: "W-4 Withholding", category: "hr_onboarding", description: "Employee's federal income-tax withholding election." },
  { name: "Direct Deposit Authorization", category: "hr_onboarding", description: "Authorizes payroll deposit to the employee's designated bank account." },
  { name: "Employee Handbook Acknowledgment", category: "hr_onboarding", description: "Confirms the employee received and reviewed the current employee handbook." },
  { name: "Emergency Contact Form", category: "hr_onboarding", description: "Collects emergency contact information for each employee." },

  // HR Discipline
  { name: "Verbal Warning Record", category: "hr_discipline", description: "Documents a verbal coaching or warning conversation for the personnel file." },
  { name: "Written Warning", category: "hr_discipline", description: "Formal written disciplinary notice describing the issue and expectations." },
  { name: "Performance Improvement Plan", category: "hr_discipline", description: "Structured plan with measurable goals and a review timeline for underperformance." },
  { name: "Termination Checklist", category: "hr_discipline", description: "Offboarding checklist covering access removal, equipment return, and final pay." },

  // Credentialing
  { name: "License Verification Form", category: "credentialing", description: "Records primary-source verification of a clinician's professional license." },
  { name: "DEA Registration Record", category: "credentialing", description: "Tracks DEA registration numbers and expiration for prescribing staff." },
  { name: "Malpractice Insurance Verification", category: "credentialing", description: "Confirms active malpractice coverage limits and policy dates per provider." },

  // Emergency
  { name: "Fire Drill Record", category: "emergency", description: "Logs fire-drill dates, participants, and evacuation timing (29 CFR 1910.38)." },
  { name: "Emergency Action Plan Acknowledgment", category: "emergency", description: "Employee attestation of review of the site Emergency Action Plan." },

  // Training
  { name: "Annual HIPAA Training Attestation", category: "training", description: "Annual attestation that the employee completed required HIPAA privacy/security training." },
  { name: "Annual Compliance Training Record", category: "training", description: "Records completion of the practice's yearly compliance training curriculum." },

  // Insurance / Risk
  { name: "Incident/Risk Report", category: "insurance_risk", description: "Captures clinical or operational incidents for risk-management review." },
  { name: "Insurance Certificate Log", category: "insurance_risk", description: "Tracks certificates of insurance and renewal dates for the practice and vendors." },
];

const CATEGORY_LABEL: Record<FormCategory, string> = {
  hr_onboarding: "HR — Onboarding",
  hr_discipline: "HR — Discipline",
  hipaa: "HIPAA",
  osha_safety: "OSHA / Safety",
  training: "Training",
  credentialing: "Credentialing",
  insurance_risk: "Insurance / Risk",
  emergency: "Emergency",
  policy_review: "Policy Review",
  other: "Other",
};

type GapStatus = "missing" | "draft" | "covered";

const STATUS_VARIANT: Record<GapStatus, "destructive" | "warning" | "success"> = {
  missing: "destructive",
  draft: "warning",
  covered: "success",
};

const STATUS_LABEL: Record<GapStatus, string> = {
  missing: "Missing",
  draft: "Draft — needs review",
  covered: "Covered",
};

const STATUS_ICON: Record<GapStatus, React.ReactNode> = {
  missing: <XCircle className="size-4 text-destructive" />,
  draft: <AlertTriangle className="size-4 text-warning" />,
  covered: <CheckCircle2 className="size-4 text-success" />,
};

// Default field set applied to every generated draft template.
const DEFAULT_FIELDS: FormField[] = [
  { key: "employee_name", label: "Employee Name", type: "text", required: true, options: [] },
  { key: "date", label: "Date", type: "date", required: true, options: [] },
  { key: "notes", label: "Notes", type: "textarea", required: false, options: [] },
];

const FILTERS: { key: "all" | GapStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "missing", label: "Missing" },
  { key: "draft", label: "Drafts" },
  { key: "covered", label: "Covered" },
];

/** Normalize a title for fuzzy comparison: lowercase, strip non-alphanumerics. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Fuzzy match a required form name against an existing template title within
 * the same category. Considered a match when either string contains the other,
 * or they share a strong majority of meaningful (>3 char) words.
 */
function titleMatches(requiredName: string, templateTitle: string): boolean {
  const a = norm(requiredName);
  const b = norm(templateTitle);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aWords = a.split(" ").filter((w) => w.length > 3);
  const bSet = new Set(b.split(" ").filter((w) => w.length > 3));
  if (aWords.length === 0) return false;
  const overlap = aWords.filter((w) => bSet.has(w)).length;
  return overlap / aWords.length >= 0.6;
}

interface MatrixRow {
  required: RequiredForm;
  status: GapStatus;
  match: FillableFormTemplate | null;
}

export default function FormGapMatrixPage() {
  const templatesQ = useCollection("formTemplates");
  // Documents are loaded for cross-reference context (not required for the match).
  useCollection("documents");
  const createTemplate = useCreate("formTemplates");
  const updateTemplate = useUpdate("formTemplates");

  const [filter, setFilter] = useState<"all" | GapStatus>("all");
  const [busyName, setBusyName] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reviewing, setReviewing] = useState<FillableFormTemplate | null>(null);
  const [approving, setApproving] = useState(false);

  const templates = useMemo(() => templatesQ.data ?? [], [templatesQ.data]);

  const matrix = useMemo<MatrixRow[]>(() => {
    return REQUIRED_FORMS.map((required) => {
      const candidates = templates.filter(
        (t) => t.category === required.category && titleMatches(required.name, t.title),
      );
      if (candidates.length === 0) {
        return { required, status: "missing", match: null };
      }
      // Prefer an active (covered) template; otherwise treat as draft.
      const active = candidates.find((t) => t.status === "active" && !t.isDraft);
      const match = active ?? candidates[0];
      const status: GapStatus =
        active ? "covered" : "draft";
      return { required, status, match };
    });
  }, [templates]);

  const stats = useMemo(
    () => ({
      total: matrix.length,
      covered: matrix.filter((r) => r.status === "covered").length,
      draft: matrix.filter((r) => r.status === "draft").length,
      missing: matrix.filter((r) => r.status === "missing").length,
    }),
    [matrix],
  );

  const filtered = useMemo(
    () => (filter === "all" ? matrix : matrix.filter((r) => r.status === filter)),
    [matrix, filter],
  );

  // Categories present in the (filtered) view, in REQUIRED_FORMS order.
  const categories = useMemo(() => {
    const seen = new Set<FormCategory>();
    const ordered: FormCategory[] = [];
    for (const row of filtered) {
      if (!seen.has(row.required.category)) {
        seen.add(row.required.category);
        ordered.push(row.required.category);
      }
    }
    return ordered;
  }, [filtered]);

  function buildDraft(required: RequiredForm): Omit<FillableFormTemplate, "id" | "createdDate"> {
    return {
      title: required.name,
      category: required.category,
      description: `${required.description} (Auto-generated draft — needs HR/Compliance review.)`,
      fields: DEFAULT_FIELDS,
      status: "draft",
      requiresSignature: true,
      sensitive: false,
      isDraft: true,
      fileUrl: null,
    };
  }

  async function generateDraft(required: RequiredForm) {
    setBusyName(required.name);
    try {
      const created = await createTemplate.mutateAsync(buildDraft(required));
      toast.success(`Draft created: ${required.name}`, {
        description: "Review it now, then approve or edit.",
      });
      // Open the new draft for review immediately.
      if (created) setReviewing(created as FillableFormTemplate);
    } catch {
      toast.error(`Failed to generate draft for ${required.name}.`);
    } finally {
      setBusyName(null);
    }
  }

  // Approve a draft: mark it active and no longer a draft.
  async function approveDraft(t: FillableFormTemplate) {
    setApproving(true);
    try {
      await updateTemplate.mutateAsync({ id: t.id, patch: { isDraft: false, status: "active" } });
      toast.success(`Approved: ${t.title}`);
      setReviewing(null);
    } catch {
      toast.error("Failed to approve. Try again.");
    } finally {
      setApproving(false);
    }
  }

  async function generateAllMissing() {
    const missing = matrix.filter((r) => r.status === "missing").map((r) => r.required);
    if (missing.length === 0) {
      toast.info("No missing forms to generate.");
      return;
    }
    setBulkBusy(true);
    const toastId = toast.loading(`Generating ${missing.length} draft templates…`);
    let created = 0;
    try {
      for (const required of missing) {
        try {
          await createTemplate.mutateAsync(buildDraft(required));
          created += 1;
          toast.loading(`Generating drafts… ${created}/${missing.length}`, { id: toastId });
        } catch {
          // continue with the rest; report partial result at the end
        }
      }
      if (created === missing.length) {
        toast.success(`Generated ${created} draft templates.`, {
          id: toastId,
          description: "All marked DRAFT — needs HR/Compliance review.",
        });
      } else {
        toast.warning(`Generated ${created} of ${missing.length} drafts.`, {
          id: toastId,
          description: "Some templates could not be created — try again.",
        });
      }
    } finally {
      setBulkBusy(false);
    }
  }

  if (templatesQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Form Gap Matrix" />
        <ErrorState
          message="We couldn't load form templates."
          onRetry={() => void templatesQ.refetch()}
        />
      </div>
    );
  }

  const loading = templatesQ.isLoading;
  const anyBusy = bulkBusy || busyName !== null;

  return (
    <div className="space-y-6">
      {reviewing && (
        <FormPreview
          template={reviewing}
          meta={{ title: reviewing.title, category: reviewing.category }}
          footer={
            <>
              <Link href="/fillable-documents"><Button variant="outline">Edit in Forms</Button></Link>
              {reviewing.isDraft && (
                <Button onClick={() => approveDraft(reviewing)} disabled={approving}>
                  {approving ? "Approving…" : "Approve — mark active"}
                </Button>
              )}
            </>
          }
          onClose={() => setReviewing(null)}
        />
      )}

      <PageHeader
        title="Form Gap Matrix"
        description="Audits the forms your practice should maintain against the templates that actually exist. Generate a clearly-marked draft for any gap."
        actions={
          <Button onClick={generateAllMissing} disabled={loading || anyBusy || stats.missing === 0}>
            {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate all missing
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total required" value={stats.total} icon={Grid3x3} loading={loading} />
        <StatCard label="Covered" value={stats.covered} icon={CheckCircle2} tone="success" loading={loading} />
        <StatCard label="Drafts" value={stats.draft} icon={AlertTriangle} tone="warning" loading={loading} />
        <StatCard label="Missing" value={stats.missing} icon={XCircle} tone="destructive" loading={loading} />
      </div>

      {!loading && stats.missing > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {stats.missing} required form{stats.missing > 1 ? "s are" : " is"} missing.
          Generate drafts to close these gaps, then route them to HR/Compliance for review.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? stats.total
              : f.key === "covered"
                ? stats.covered
                : f.key === "draft"
                  ? stats.draft
                  : stats.missing;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors " +
                (active
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary/40")
              }
            >
              {f.label}
              <span className="tabular-nums text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        filter === "missing" ? (
          <EmptyState
            icon={CheckCircle2}
            title="No missing forms"
            description="Your library covers every required form."
          />
        ) : (
          <EmptyState
            icon={Grid3x3}
            title="Nothing here"
            description="No required forms match this filter."
          />
        )
      ) : (
        <div className="space-y-6">
          {categories.map((category) => {
            const rows = filtered.filter((r) => r.required.category === category);
            return (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-sm">{CATEGORY_LABEL[category]}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {rows.map(({ required, status, match }) => (
                      <div
                        key={required.name}
                        className="flex items-start gap-3 rounded-lg p-3 hover:bg-secondary/20"
                      >
                        <div className="mt-0.5 shrink-0">{STATUS_ICON[status]}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-medium">{required.name}</p>
                            {match ? (
                              <button
                                type="button"
                                onClick={() => setReviewing(match)}
                                title={status === "draft" ? "Review draft — approve or edit" : "Open the covered form"}
                                className="shrink-0 rounded-full transition-shadow hover:ring-2 hover:ring-primary/40"
                              >
                                <Badge variant={STATUS_VARIANT[status]} className="text-xs">{STATUS_LABEL[status]}</Badge>
                              </button>
                            ) : (
                              <Badge variant={STATUS_VARIANT[status]} className="shrink-0 text-xs">{STATUS_LABEL[status]}</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{required.description}</p>
                          {match && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Matched template:{" "}
                              <button type="button" onClick={() => setReviewing(match)} className="text-primary hover:underline">{match.title}</button>
                            </p>
                          )}
                          {status !== "covered" && (
                            <div className="mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => generateDraft(required)}
                                disabled={anyBusy}
                              >
                                {busyName === required.name ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Sparkles className="size-3" />
                                )}
                                Generate draft
                              </Button>
                            </div>
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
