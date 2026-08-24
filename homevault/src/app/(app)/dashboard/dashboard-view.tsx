"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, Circle, Clock, ArrowRight, Sparkles, MoreHorizontal, Info,
} from "lucide-react";
import { Card, SectionCard, PageHeader, Badge } from "@/components/ui";
import { useJourney } from "@/lib/vault/journey-store";
import { JOURNEYS, JOURNEY_BY_KEY } from "@/lib/domain/journeys";
import { assessReadiness, maintenanceState, valueStatement } from "@/lib/domain/readiness";
import { coachSteps } from "@/lib/domain/coach";
import type { RecordMeta } from "@/lib/domain/records";
import { ValueEstimate } from "@/components/value-estimate";
import { SecurityModePicker } from "@/components/security-mode-picker";

/**
 * The dashboard.
 *
 * What this deliberately does NOT have: a completeness percentage, a streak, or
 * any count of what's outstanding. A single number can't distinguish "recorded"
 * from "correct", so it either understates or — much worse — tells a household
 * they're safe when they aren't. Milestones say what you actually gained, and
 * they can be finished.
 *
 * The other rule: when there's nothing worth doing, this page says so and gets
 * out of the way. A tool meant to lift a burden shouldn't invent work to look
 * busy.
 */
export function DashboardView({ records }: { records: RecordMeta[] }) {
  const { effectiveJourney, hasChosen, prefs, choose, dismissCategory, snoozeStep } = useJourney();
  const [showLimits, setShowLimits] = useState(false);
  const [changing, setChanging] = useState(false);

  // Changing your mind is a first-class action, not a settings-page scavenger
  // hunt. Someone who came to get organised may later be preparing a handover,
  // and the app shouldn't hold them to a choice they made once.
  if (!hasChosen || changing) {
    return (
      <JourneyPicker
        current={hasChosen ? effectiveJourney : null}
        onChoose={(key) => {
          choose(key);
          setChanging(false);
        }}
        onCancel={changing ? () => setChanging(false) : undefined}
      />
    );
  }

  const journey = JOURNEY_BY_KEY[effectiveJourney];
  const readiness = assessReadiness(records, effectiveJourney);
  const steps = coachSteps(records, effectiveJourney, prefs);
  const rest = maintenanceState(readiness);
  const value = valueStatement(readiness);

  return (
    <div>
      <PageHeader
        icon={<Sparkles size={22} />}
        title={value.headline}
        subtitle={value.detail}
      />

      {rest.atRest ? (
        <Card className="card-gradient mb-6 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 text-success" size={20} />
            <div>
              <h2 className="font-semibold">Nothing needs you today</h2>
              <p className="mt-1 text-sm text-muted">
                We&apos;ll check in about every {Math.round(rest.cadenceDays / 30)} months, or sooner if a
                document is genuinely about to expire. That&apos;s the whole idea — this shouldn&apos;t be one
                more thing on your list.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Milestones — what you've gained, and what's next. */}
        <SectionCard
          className="lg:col-span-2"
          title={journey.label}
          action={
            <div className="flex items-center gap-2">
              <button onClick={() => setChanging(true)} className="text-sm text-accent-strong hover:underline">
                Change
              </button>
              <Badge tone="neutral">
                {readiness.achieved} of {readiness.total}
              </Badge>
            </div>
          }
        >
          <p className="-mt-1 mb-4 text-sm text-muted">{journey.goal}</p>

          <ul className="flex flex-col divide-y divide-border">
            {readiness.milestones.map(({ milestone, complete, missing, stale }) => (
              <li key={milestone.key} className="flex items-start gap-3 py-3">
                {complete ? (
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
                ) : (
                  <Circle size={18} className="mt-0.5 shrink-0 text-muted" />
                )}
                <div className="min-w-0">
                  <div className={complete ? "text-sm font-medium text-success" : "text-sm font-medium"}>
                    {milestone.title}
                  </div>
                  <div className="text-xs text-muted">{milestone.why}</div>
                  {!complete && stale.length > 0 ? (
                    <div className="mt-1 text-xs text-warning">
                      Something&apos;s recorded here, but it&apos;s out of date.
                    </div>
                  ) : null}
                  {!complete && missing.length > 0 ? (
                    <div className="mt-1 text-xs text-muted">
                      Needs: {missing.join(", ").replace(/_/g, " ")}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* Next steps — invitations, each dismissible. */}
        <SectionCard title="If you have a few minutes">
          <ul className="-mt-1 flex flex-col gap-3">
            {steps.map((step) => (
              <li key={step.id} className="rounded-md border border-border bg-surface-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{step.title}</div>
                    <div className="mt-0.5 text-xs text-muted">{step.detail}</div>
                    {step.because ? (
                      <div className="mt-1 text-xs text-muted italic">{step.because}</div>
                    ) : null}
                  </div>
                  {step.minutes > 0 ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                      <Clock size={11} /> {step.minutes}m
                    </span>
                  ) : null}
                </div>

                {step.kind !== "celebrate" ? (
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <Link href="/vault" className="inline-flex items-center gap-1 text-accent hover:underline">
                      Do it <ArrowRight size={11} />
                    </Link>
                    <button onClick={() => snoozeStep(step.id, 30)} className="text-muted hover:text-foreground">
                      Not now
                    </button>
                    {step.category ? (
                      <button onClick={() => dismissCategory(step.category!)}
                        className="text-muted hover:text-foreground" title="Stop suggesting this">
                        Doesn&apos;t apply to us
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          {prefs.notApplicable.length > 0 ? (
            <p className="mt-3 text-xs text-muted">
              {prefs.notApplicable.length} categor{prefs.notApplicable.length === 1 ? "y" : "ies"} hidden at your
              request.
            </p>
          ) : null}
        </SectionCard>
      </div>

      <div className="mt-6">
        <ValueEstimate journeyKey={effectiveJourney} />
      </div>

      <div className="mt-6">
        <SecurityModePicker />
      </div>

      {/* What this doesn't measure — stated plainly rather than implied. */}
      <div className="mt-6">
        <button onClick={() => setShowLimits(!showLimits)}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <Info size={13} /> What this page can&apos;t tell you
          <MoreHorizontal size={13} />
        </button>
        {showLimits ? (
          <Card className="mt-2 p-4">
            <ul className="flex flex-col gap-2 text-xs text-muted">
              {readiness.limits.map((limit) => (
                <li key={limit}>• {limit}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              A finished checklist here means the records exist and haven&apos;t expired — not that what&apos;s
              inside them is right. Only you can know that.
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * First run: what brought you here?
 *
 * Asked because the same vault serves someone organising a young household and
 * someone preparing for a handover they know is coming, and leading with the
 * wrong one is either morbid or irrelevant. There is no "recommended" option and
 * no wrong answer — and it can be changed later.
 */
function JourneyPicker({
  current,
  onChoose,
  onCancel,
}: {
  current: (typeof JOURNEYS)[number]["key"] | null;
  onChoose: (key: (typeof JOURNEYS)[number]["key"]) => void;
  onCancel?: () => void;
}) {
  return (
    <div>
      <PageHeader
        icon={<Sparkles size={22} />}
        title={current ? "What are you working on now?" : "What brings you here?"}
        subtitle="This just sets where we start and how we talk about it. You can change it whenever you like, and it doesn't limit anything."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {JOURNEYS.map((journey) => (
          <button key={journey.key} onClick={() => onChoose(journey.key)}
            className={`rounded-md border p-5 text-left transition-colors hover:border-accent/40 hover:bg-surface-2 ${
              journey.key === current ? "border-accent/40 bg-surface-2" : "border-border bg-surface"
            }`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{journey.label}</h3>
              {journey.key === current ? <Badge tone="accent">current</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted">{journey.tagline}</p>
            <p className="mt-3 text-xs text-muted">
              Starts with: <span className="text-foreground">{journey.milestones[0].title}</span>
            </p>
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <p className="text-xs text-muted">
          Everything in HomeVault is available on every path — this only changes the order we suggest things
          and the language we use. Nothing you&apos;ve already saved is affected.
        </p>
        {onCancel ? (
          <button onClick={onCancel} className="ml-auto shrink-0 text-xs text-muted hover:text-foreground">
            Never mind
          </button>
        ) : null}
      </div>
    </div>
  );
}
