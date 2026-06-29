"use client";

import { useState } from "react";
import { Heart, ExternalLink, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";
import { toast } from "sonner";

interface BenefitPlan {
  id: string;
  name: string;
  type: "health" | "dental" | "vision" | "life" | "retirement" | "disability" | "other";
  carrier: string;
  planId?: string;
  effectiveDate: string;
  renewalDate: string;
  employeePremiumCents: number;
  employerPremiumCents: number;
  enrolledCount: number;
  eligibleCount: number;
  enrollmentUrl?: string;
  status: "active" | "inactive";
}

const SEED: BenefitPlan[] = [
  { id: "b1", name: "Medical — PPO Gold", type: "health", carrier: "BlueCross BlueShield", planId: "BC-PPO-GOLD-2026", effectiveDate: "2026-01-01", renewalDate: "2026-12-31", employeePremiumCents: 38000, employerPremiumCents: 72000, enrolledCount: 4, eligibleCount: 5, status: "active" },
  { id: "b2", name: "Dental — Enhanced", type: "dental", carrier: "Delta Dental", planId: "DD-ENH-2026", effectiveDate: "2026-01-01", renewalDate: "2026-12-31", employeePremiumCents: 2500, employerPremiumCents: 5000, enrolledCount: 3, eligibleCount: 5, status: "active" },
  { id: "b3", name: "Vision — Standard", type: "vision", carrier: "VSP", planId: "VSP-STD-2026", effectiveDate: "2026-01-01", renewalDate: "2026-12-31", employeePremiumCents: 800, employerPremiumCents: 1500, enrolledCount: 3, eligibleCount: 5, status: "active" },
  { id: "b4", name: "Life Insurance — 2× salary", type: "life", carrier: "Lincoln Financial", effectiveDate: "2026-01-01", renewalDate: "2026-12-31", employeePremiumCents: 0, employerPremiumCents: 4000, enrolledCount: 5, eligibleCount: 5, status: "active" },
  { id: "b5", name: "401(k) — Safe Harbor", type: "retirement", carrier: "Fidelity", effectiveDate: "2025-01-01", renewalDate: "2026-12-31", employeePremiumCents: 0, employerPremiumCents: 0, enrolledCount: 3, eligibleCount: 5, status: "active" },
];

const TYPE_LABEL: Record<BenefitPlan["type"], string> = {
  health: "Health",
  dental: "Dental",
  vision: "Vision",
  life: "Life",
  retirement: "Retirement",
  disability: "Disability",
  other: "Other",
};

function formatCents(c: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
}

export default function BenefitsPage() {
  const [plans, setPlans] = useState<BenefitPlan[]>(SEED);

  function toggleStatus(id: string) {
    setPlans((prev) => prev.map((p) => p.id === id ? { ...p, status: p.status === "active" ? "inactive" : "active" } : p));
    toast.success("Status updated");
  }

  const active = plans.filter((p) => p.status === "active");
  const totalEmployerCost = active.reduce((s, p) => s + p.employerPremiumCents * p.enrolledCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benefits"
        description="Benefit plan catalog, premium summary, and enrollment tracking."
        actions={
          <Button onClick={() => toast.info("Add plan form coming soon")}>
            <Plus className="size-4" /> Add plan
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active plans" value={active.length} icon={Heart} tone="success" />
        <StatCard label="Total employer cost/mo" value={formatCents(totalEmployerCost)} icon={Heart} />
        <StatCard label="Avg. enrollment" value={`${Math.round(active.reduce((s, p) => s + (p.enrolledCount / p.eligibleCount), 0) / (active.length || 1) * 100)}%`} icon={Heart} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.length === 0 ? (
          <div className="sm:col-span-2">
            <EmptyState icon={Heart} title="No benefit plans" description="Add your benefit plan catalog." />
          </div>
        ) : plans.map((p) => (
          <Card key={p.id} className={p.status === "inactive" ? "opacity-60" : ""}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{p.carrier}{p.planId ? ` · ${p.planId}` : ""}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <Badge variant="outline" className="capitalize">{TYPE_LABEL[p.type]}</Badge>
                  <Badge variant={p.status === "active" ? "success" : "secondary"} className="capitalize">{p.status}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Employee premium</p>
                  <p className="font-medium">{p.employeePremiumCents > 0 ? `${formatCents(p.employeePremiumCents)}/mo` : "Employer-paid"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Employer premium</p>
                  <p className="font-medium">{formatCents(p.employerPremiumCents)}/mo</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Enrollment</p>
                  <p className="font-medium">{p.enrolledCount} / {p.eligibleCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Renewal</p>
                  <p className="font-medium">{p.renewalDate}</p>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(p.enrolledCount / p.eligibleCount) * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-2">
                {p.enrollmentUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={p.enrollmentUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-3" /> Enroll
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => toggleStatus(p.id)}>
                  {p.status === "active" ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
