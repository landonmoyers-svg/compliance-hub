"use client";

import type { ReactNode } from "react";
import { Trophy, Star, CheckCircle2, Lock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { scoreBand, type ComplianceScore } from "@/lib/compliance";
import { cn } from "@/lib/cn";

/**
 * The single, shared compliance-progress card used on every surface that shows
 * the score (home dashboard, executive dashboard). Leads with the gamified
 * progress layer — Level, Readiness, achievement badges — and shows the
 * penalty-based health score secondarily, so ramp-up feels like climbing rather
 * than digging out. One source of truth so the pages never drift apart.
 */

function toneBadgeVariant(tone: "success" | "warning" | "destructive"): "success" | "warning" | "destructive" {
  return tone;
}

export function ComplianceProgressCard({
  score,
  loading,
  configured,
  title = "Compliance progress",
}: {
  score: ComplianceScore;
  loading: boolean;
  configured: boolean;
  title?: string;
}): ReactNode {
  const band = scoreBand(score.score);
  const barTone =
    band.tone === "success" ? "bg-success" : band.tone === "warning" ? "bg-warning" : "bg-destructive";

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  // A fresh, unconfigured program: encourage the first steps rather than show 100.
  if (!configured) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-muted-foreground" />
            <span className="text-lg font-semibold">Getting Started</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" />
          <p className="text-sm text-muted-foreground">
            Every record you upload earns points and raises your readiness. Add employees, credentials,
            and training — the <a href="/compliance-concierge" className="text-primary hover:underline">Setup Concierge</a> can help.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { level, points, readiness, achievements, strengths, rampUp } = score;
  const toNext = level.nextAt != null ? level.nextAt - points : null;
  const levelProgress = level.nextAt != null && level.nextAt > level.floor
    ? Math.min(100, Math.round(((points - level.floor) / (level.nextAt - level.floor)) * 100))
    : 100;
  const readinessTone = readiness >= 85 ? "bg-success" : readiness >= 50 ? "bg-primary" : "bg-warning";
  const unlocked = achievements.filter((a) => a.unlocked);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Star className="size-3.5 text-amber-500" /> {points.toLocaleString()} pts
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Level + progress to next — the positive "you're climbing" header */}
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-500" />
              <div>
                <div className="text-sm font-semibold leading-tight">Level {level.tier} · {level.name}</div>
                <div className="text-xs text-muted-foreground">
                  {toNext != null ? `${toNext.toLocaleString()} pts to next level` : "Top level reached 🎉"}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${levelProgress}%` }} />
          </div>
        </div>

        {/* Readiness — the metric that climbs as records get uploaded/completed */}
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium"><TrendingUp className="size-4 text-primary" /> Readiness</span>
            <span className="tabular-nums font-semibold">{readiness}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full transition-all", readinessTone)} style={{ width: `${readiness}%` }} />
          </div>
          {rampUp && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              You&apos;re building. Items you haven&apos;t uploaded yet lower readiness but don&apos;t hurt your score — every upload moves this up.
            </p>
          )}
        </div>

        {/* Achievements */}
        {achievements.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {achievements.map((a) => (
              <span key={a.key} title={a.description}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  a.unlocked
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border bg-secondary/30 text-muted-foreground",
                )}>
                {a.unlocked ? <CheckCircle2 className="size-3" /> : <Lock className="size-3" />}
                {a.label}
              </span>
            ))}
          </div>
        )}

        {/* Health score — present but secondary, so it's never the demoralizing headline */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Health score</div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-semibold tabular-nums">{score.score}</span>
                <Badge variant={toneBadgeVariant(band.tone)}>{band.label}</Badge>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{unlocked.length}/{achievements.length} badges</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full transition-all", barTone)} style={{ width: `${score.score}%` }} />
          </div>

          {strengths.length > 0 && (
            <div className="mt-3 space-y-1">
              {strengths.map((s) => (
                <div key={s} className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="size-3.5 shrink-0" /> {s}
                </div>
              ))}
            </div>
          )}

          {score.factors.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-border/60 pt-2">
              <div className="text-xs font-medium text-muted-foreground">What&apos;s affecting your score</div>
              {score.factors.map((f) => (
                <div key={f.key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{f.label}<span className="ml-1 text-xs">({f.count})</span></span>
                  <span className="tabular-nums text-destructive">{f.impact}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
