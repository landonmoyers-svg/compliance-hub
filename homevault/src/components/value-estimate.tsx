"use client";

import { useState } from "react";
import { Clock, SlidersHorizontal, ExternalLink } from "lucide-react";
import { Card } from "./ui";
import {
  SOURCES,
  DEFAULT_ASSUMPTIONS,
  NOT_INCLUDED,
  DOLLAR_CAVEAT,
  annualHouseholdSaving,
  handoverSaving,
  formatHours,
  formatDollars,
  type ValueAssumptions,
} from "@/lib/domain/value";

/**
 * What being organised is worth.
 *
 * Two rules govern the copy here, and they are easy to break:
 *
 * 1. **Frame it as a gain, never as a loss.** "This saves your household
 *    31–49 hours a year" and "you're wasting 49 hours a year" are the same
 *    arithmetic, but the second is a guilt lever. The whole point of this
 *    product is a burden lifted, so the number has to feel like relief.
 *
 * 2. **Show the working.** The estimate is only trustworthy if a household can
 *    open it up, see where every figure came from, disagree with it, and change
 *    it. A number you can't audit is an advertisement.
 */
export function ValueEstimate({ journeyKey }: { journeyKey: string }) {
  const [assumptions, setAssumptions] = useState<ValueAssumptions>(DEFAULT_ASSUMPTIONS);
  const [showWorking, setShowWorking] = useState(false);

  const annual = annualHouseholdSaving(assumptions);
  const handover = handoverSaving(assumptions);
  // Someone here to organise a household hasn't asked about estates. Lead with
  // what they came for; the other figure is still there if they open it up.
  const leadWithHandover = journeyKey === "handover" || journeyKey === "caregiver";

  const set = <K extends keyof ValueAssumptions>(key: K, value: ValueAssumptions[K]) =>
    setAssumptions({ ...assumptions, [key]: value });

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 shrink-0 text-accent" size={18} />
          <div>
            <h2 className="font-semibold">What this is worth</h2>
            <p className="mt-1 text-sm text-muted">
              {leadWithHandover ? (
                <>
                  A complete, findable record set saves whoever settles your estate roughly{" "}
                  <b className="text-foreground">{formatHours(handover)}</b> of searching —{" "}
                  {formatDollars(handover)} of someone&apos;s time, at a point when they have the least to
                  spare. Day to day, it saves your household about {formatHours(annual)} a year.
                </>
              ) : (
                <>
                  Keeping this current saves your household roughly{" "}
                  <b className="text-foreground">{formatHours(annual)} a year</b> — about{" "}
                  {formatDollars(annual)} of your time — in passwords you don&apos;t have to reset and
                  paperwork you don&apos;t have to hunt for. If it&apos;s ever needed for a handover, it saves
                  whoever steps in another {formatHours(handover)}.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowWorking(!showWorking)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
      >
        <SlidersHorizontal size={12} />
        {showWorking ? "Hide the working" : "These are estimates — see and change the numbers"}
      </button>

      {showWorking ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs text-muted">
            Every figure below is a guess we made on your behalf. Change any of them and the estimate updates —
            including down to nothing, if you think we&apos;re wrong.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Adults in your household" value={assumptions.adults} min={1} max={8} step={1}
              onChange={(v) => set("adults", v)} />
            <Field label="Value of an hour ($)" value={assumptions.hourlyRate} min={0} max={200} step={1}
              onChange={(v) => set("hourlyRate", v)}
              note="Defaults to the US average wage (BLS, July 2026)." />
            <Field label="Hours/year per adult on passwords" value={assumptions.passwordHoursPerYear}
              min={0} max={60} step={1} onChange={(v) => set("passwordHoursPerYear", v)}
              note="Published studies say 11–26. We default to the lowest." />
            <Field label="Hours/year per adult hunting paperwork" value={assumptions.paperworkHoursPerYear}
              min={0} max={60} step={1} onChange={(v) => set("paperworkHoursPerYear", v)}
              note="A slice of the ~60 h/yr people lose to misplaced things generally." />
            <Field label="Share of that a vault removes" value={assumptions.recoverableShare}
              min={0} max={1} step={0.05} percent onChange={(v) => set("recoverableShare", v)}
              note="Not everything — you'll still fetch the odd physical document." />
            <Field label="Share of executor time spent searching" value={assumptions.executorSearchShare}
              min={0} max={1} step={0.05} percent onChange={(v) => set("executorSearchShare", v)}
              note="Most of settling an estate is filings and waiting, not hunting." />
          </div>

          <p className="mt-4 text-xs text-muted">{DOLLAR_CAVEAT}</p>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Not counted</h3>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-muted">
            {NOT_INCLUDED.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Where these come from</h3>
          <ul className="mt-1 flex flex-col gap-2 text-xs text-muted">
            {SOURCES.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline">
                  {source.publisher} <ExternalLink size={10} />
                </a>
                <div>{source.claim}</div>
                {/* Say who paid for the study, so nobody has to click to find out. */}
                <div className="italic">{source.provenance}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function Field({
  label, value, min, max, step, onChange, note, percent,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  note?: string;
  percent?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="flex items-center justify-between gap-2">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-foreground">{percent ? `${Math.round(value * 100)}%` : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="accent-accent" />
      {note ? <span className="text-muted">{note}</span> : null}
    </label>
  );
}
