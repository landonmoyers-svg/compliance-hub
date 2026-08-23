import { LayoutDashboard, ShieldCheck, FolderLock, KeyRound, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, PageHeader, StatCard, Badge } from "@/components/ui";
import { getDataClient } from "@/lib/data/client";
import { completenessScore, coachSteps } from "@/lib/domain/coach";
import { expiryStatus } from "@/lib/domain/records";

export default async function DashboardPage() {
  const data = await getDataClient();
  const [records, plans, recipients] = await Promise.all([
    data.listRecords(),
    data.listPlans(),
    data.listRecipients(),
  ]);

  const score = completenessScore(records);
  const steps = coachSteps(records).slice(0, 6);
  const expiring = records.filter((r) => ["soon", "expired"].includes(expiryStatus(r))).length;
  const criticalCount = records.filter((r) => r.tier === "critical").length;
  const armedPlans = plans.filter((p) => p.state === "ARMED").length;

  const priorityTone = { high: "danger", medium: "warning", low: "neutral" } as const;

  return (
    <div>
      <PageHeader
        icon={<LayoutDashboard size={22} />}
        title="Dashboard"
        subtitle="How ready is your household to secure and hand over what matters?"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Vault completeness"
          value={`${score}%`}
          hint={`${records.length} records across your categories`}
          icon={<ShieldCheck size={20} />}
        />
        <StatCard label="Critical records" value={criticalCount} hint="SSN, financial, estate, accounts" icon={<FolderLock size={20} />} />
        <StatCard label="Handover plans armed" value={armedPlans} hint={`${recipients.length} designated recipients`} icon={<KeyRound size={20} />} />
        <StatCard label="Needs attention" value={expiring} hint="Documents expiring or expired" icon={<AlertTriangle size={20} />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Your coach — next steps</h2>
            <Badge tone="accent">prioritized</Badge>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {steps.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-3">
                <Badge tone={priorityTone[s.priority]} className="mt-0.5 shrink-0">
                  {s.priority}
                </Badge>
                <div>
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted">{s.detail}</div>
                </div>
              </li>
            ))}
            {steps.length === 0 ? (
              <li className="flex items-center gap-2 py-3 text-sm text-success">
                <CheckCircle2 size={16} /> Everything&apos;s covered. Time for a handover fire-drill.
              </li>
            ) : null}
          </ul>
        </Card>

        <Card className="card-gradient p-5">
          <h2 className="font-semibold">Handover readiness</h2>
          <p className="mt-2 text-sm text-muted">
            Your household runs different handover rules per sensitivity tier.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {plans.map((p) => (
              <li key={p.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{p.tiers.join(", ")} tier</span>
                  <Badge tone="success">{p.state}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {p.triggers.map((t) => t.kind.replace("_", "-")).join(` ${p.combine === "all" ? "AND" : "OR"} `)} ·{" "}
                  {p.graceDays}-day grace
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
