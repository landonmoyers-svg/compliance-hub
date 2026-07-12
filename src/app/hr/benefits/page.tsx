"use client";

import { useState, useMemo } from "react";
import { Heart, ExternalLink, Plus, X } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/dates";
import type { Benefit } from "@/lib/data/schema";
import { toast } from "sonner";

type BenefitType = Benefit["benefitType"];

const BENEFIT_TYPES: BenefitType[] = [
  "health",
  "dental",
  "vision",
  "life_insurance",
  "disability",
  "retirement_401k",
  "pto",
  "fsa",
  "hsa",
  "other",
];

const TYPE_LABEL: Record<BenefitType, string> = {
  health: "Health",
  dental: "Dental",
  vision: "Vision",
  life_insurance: "Life insurance",
  disability: "Disability",
  retirement_401k: "401(k)",
  pto: "PTO",
  fsa: "FSA",
  hsa: "HSA",
  other: "Other",
};

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function enrollmentPct(b: Pick<Benefit, "enrolledCount" | "eligibleCount">): number {
  if (!b.eligibleCount || b.eligibleCount <= 0) return 0;
  return Math.round((b.enrolledCount / b.eligibleCount) * 100);
}

/* ----------------------------- dialog ------------------------------- */

interface BenefitForm {
  benefitType: BenefitType;
  planName: string;
  provider: string;
  policyNumber: string;
  employerContribution: string; // dollars
  employeeContribution: string; // dollars
  eligibilityRules: string;
  enrollmentDeadline: string;
  renewalDate: string;
  contactPhone: string;
  enrollmentUrl: string;
  enrolledCount: string;
  eligibleCount: string;
  active: boolean;
}

const EMPTY: BenefitForm = {
  benefitType: "health",
  planName: "",
  provider: "",
  policyNumber: "",
  employerContribution: "",
  employeeContribution: "",
  eligibilityRules: "",
  enrollmentDeadline: "",
  renewalDate: "",
  contactPhone: "",
  enrollmentUrl: "",
  enrolledCount: "",
  eligibleCount: "",
  active: true,
};

function fromBenefit(b: Benefit): BenefitForm {
  return {
    benefitType: b.benefitType,
    planName: b.planName,
    provider: b.provider ?? "",
    policyNumber: b.policyNumber ?? "",
    employerContribution: String(b.employerContributionCents / 100),
    employeeContribution: String(b.employeeContributionCents / 100),
    eligibilityRules: b.eligibilityRules ?? "",
    enrollmentDeadline: b.enrollmentDeadline ?? "",
    renewalDate: b.renewalDate ?? "",
    contactPhone: b.contactPhone ?? "",
    enrollmentUrl: b.enrollmentUrl ?? "",
    enrolledCount: String(b.enrolledCount),
    eligibleCount: String(b.eligibleCount),
    active: b.active,
  };
}

function BenefitDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: Benefit;
  onClose: () => void;
  onSave: (data: BenefitForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<BenefitForm>(initial ? fromBenefit(initial) : EMPTY);

  const setText =
    (k: keyof BenefitForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const employerNum = parseFloat(form.employerContribution);
  const employeeNum = parseFloat(form.employeeContribution);
  const employerValid = form.employerContribution === "" || (!isNaN(employerNum) && employerNum >= 0);
  const employeeValid = form.employeeContribution === "" || (!isNaN(employeeNum) && employeeNum >= 0);

  const enrolledNum = parseInt(form.enrolledCount, 10);
  const eligibleNum = parseInt(form.eligibleCount, 10);
  const enrolledValid = form.enrolledCount === "" || (!isNaN(enrolledNum) && enrolledNum >= 0);
  const eligibleValid = form.eligibleCount === "" || (!isNaN(eligibleNum) && eligibleNum >= 0);

  const canSave =
    form.planName.trim() !== "" &&
    employerValid &&
    employeeValid &&
    enrolledValid &&
    eligibleValid;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit benefit plan" : "Add benefit plan"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <select className="input w-full" value={form.benefitType} onChange={setText("benefitType")}>
              {BENEFIT_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Provider</label>
            <input className="input w-full" value={form.provider} onChange={setText("provider")} placeholder="e.g. Delta Dental" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Plan name *</label>
            <input className="input w-full" value={form.planName} onChange={setText("planName")} placeholder="e.g. Medical — PPO Gold" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Policy number</label>
            <input className="input w-full" value={form.policyNumber} onChange={setText("policyNumber")} placeholder="Policy #" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contact phone</label>
            <input className="input w-full" value={form.contactPhone} onChange={setText("contactPhone")} placeholder="(555) 555-5555" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Employer contribution ($/mo)</label>
            <input type="number" min="0" step="0.01" className="input w-full" value={form.employerContribution} onChange={setText("employerContribution")} placeholder="0.00" />
            {!employerValid && <p className="text-xs text-destructive">Must be a positive number</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Employee contribution ($/mo)</label>
            <input type="number" min="0" step="0.01" className="input w-full" value={form.employeeContribution} onChange={setText("employeeContribution")} placeholder="0.00" />
            {!employeeValid && <p className="text-xs text-destructive">Must be a positive number</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Enrolled count</label>
            <input type="number" min="0" className="input w-full" value={form.enrolledCount} onChange={setText("enrolledCount")} placeholder="0" />
            {!enrolledValid && <p className="text-xs text-destructive">Must be a positive number</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Eligible count</label>
            <input type="number" min="0" className="input w-full" value={form.eligibleCount} onChange={setText("eligibleCount")} placeholder="0" />
            {!eligibleValid && <p className="text-xs text-destructive">Must be a positive number</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Enrollment deadline</label>
            <input type="date" className="input w-full" value={form.enrollmentDeadline} onChange={setText("enrollmentDeadline")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Renewal date</label>
            <input type="date" className="input w-full" value={form.renewalDate} onChange={setText("renewalDate")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Enrollment URL</label>
            <input className="input w-full" value={form.enrollmentUrl} onChange={setText("enrollmentUrl")} placeholder="https://…" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Eligibility rules</label>
            <textarea className="input w-full" rows={3} value={form.eligibilityRules} onChange={setText("eligibilityRules")} placeholder="Who qualifies and when…" />
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={form.active}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
            />
            <span className="text-sm font-medium">Active plan</span>
          </label>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!canSave || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function BenefitsPage() {
  const { data, isLoading, isError, refetch } = useCollection("benefits");
  const createMut = useCreate("benefits");
  const updateMut = useUpdate("benefits");

  const [editing, setEditing] = useState<Benefit | null | "new">(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const benefits = useMemo(() => data ?? [], [data]);

  const stats = useMemo(() => {
    const active = benefits.filter((b) => b.active);
    const monthlyEmployerCents = active.reduce((s, b) => s + b.employerContributionCents, 0);
    const enrollable = active.filter((b) => b.eligibleCount > 0);
    const avgEnrollment = enrollable.length
      ? Math.round(enrollable.reduce((s, b) => s + enrollmentPct(b), 0) / enrollable.length)
      : 0;
    return {
      total: benefits.length,
      active: active.length,
      monthlyEmployerCents,
      avgEnrollment,
    };
  }, [benefits]);

  async function handleSave(form: BenefitForm) {
    setSaving(true);
    try {
      const toCents = (s: string) => {
        const n = parseFloat(s);
        return s === "" || isNaN(n) ? 0 : Math.round(n * 100);
      };
      const toCount = (s: string) => {
        const n = parseInt(s, 10);
        return s === "" || isNaN(n) ? 0 : n;
      };
      const payload = {
        benefitType: form.benefitType,
        planName: form.planName.trim(),
        provider: form.provider.trim() || undefined,
        policyNumber: form.policyNumber.trim() || undefined,
        employerContributionCents: toCents(form.employerContribution),
        employeeContributionCents: toCents(form.employeeContribution),
        eligibilityRules: form.eligibilityRules.trim() || undefined,
        enrollmentDeadline: form.enrollmentDeadline || null,
        renewalDate: form.renewalDate || null,
        contactPhone: form.contactPhone.trim() || undefined,
        enrollmentUrl: form.enrollmentUrl.trim() || null,
        enrolledCount: toCount(form.enrolledCount),
        eligibleCount: toCount(form.eligibleCount),
        active: form.active,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Benefit plan updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Benefit plan added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save benefit plan");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: Benefit) {
    setBusyId(b.id);
    try {
      await updateMut.mutateAsync({ id: b.id, patch: { active: !b.active } });
      toast.success(b.active ? "Plan deactivated" : "Plan activated");
    } catch {
      toast.error("Failed to update plan");
    } finally {
      setBusyId(null);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Benefits" />
        <ErrorState message="We couldn't load benefit plans." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <BenefitDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Benefits"
        description="Benefit plan catalog, contribution summary, and enrollment tracking."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add plan
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total benefits" value={stats.total} icon={Heart} loading={isLoading} />
        <StatCard label="Active plans" value={stats.active} icon={Heart} tone="success" loading={isLoading} />
        <StatCard label="Monthly employer cost" value={formatCents(stats.monthlyEmployerCents)} icon={Heart} loading={isLoading} />
        <StatCard label="Avg. enrollment" value={`${stats.avgEnrollment}%`} icon={Heart} loading={isLoading} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : benefits.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No benefit plans"
          description="Add your benefit plan catalog to start tracking enrollment and costs."
          action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add plan</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {benefits.map((b) => {
            const pct = enrollmentPct(b);
            return (
              <Card key={b.id} className={b.active ? "" : "opacity-60"}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{b.planName}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {b.provider || "No provider"}
                        {b.policyNumber ? ` · ${b.policyNumber}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{TYPE_LABEL[b.benefitType]}</Badge>
                      <Badge variant={b.active ? "success" : "secondary"}>{b.active ? "Active" : "Inactive"}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Employer contribution</p>
                      <p className="font-medium">{formatCents(b.employerContributionCents)}/mo</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Employee contribution</p>
                      <p className="font-medium">
                        {b.employeeContributionCents > 0 ? `${formatCents(b.employeeContributionCents)}/mo` : "Employer-paid"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Enrollment</p>
                      <p className="font-medium tabular-nums">{b.enrolledCount} / {b.eligibleCount} · {pct}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Renewal</p>
                      <p className="font-medium">{b.renewalDate ? formatDate(b.renewalDate) : "—"}</p>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex items-center gap-2">
                    {b.enrollmentUrl && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={b.enrollmentUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-3" /> Enroll
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(b)} disabled={busyId === b.id}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(b)} disabled={busyId === b.id}>
                      {b.active ? "Deactivate" : "Activate"}
                    </Button>
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
