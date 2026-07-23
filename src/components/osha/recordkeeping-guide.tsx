"use client";

import { useState } from "react";
import {
  FileText, ExternalLink, AlertTriangle, CheckCircle2, ChevronDown,
  Phone, RotateCcw, ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * OSHA recordkeeping guidance for the practice: an interactive recordability
 * decision algorithm (29 CFR 1904.7), the three official forms with what each
 * is for / when to use it / access to the blank form, and the always-required
 * severe-event reporting rules. General guidance, not legal advice.
 */

// Official OSHA blank forms — the fillable English package contains the 300,
// 300A, and 301 plus instructions (osha.gov/recordkeeping/forms).
export const OSHA_FORMS_PACKAGE_URL = "https://www.osha.gov/sites/default/files/OSHA-RK-Forms-Package.pdf";
const OSHA_FORMS_HUB_URL = "https://www.osha.gov/recordkeeping/forms";
const OSHA_REPORT_URL = "https://www.osha.gov/report";

interface OshaForm {
  code: string;
  name: string;
  purpose: string;
  when: string[];
  deadline: string;
  retention: string;
}

const FORMS: OshaForm[] = [
  {
    code: "OSHA 301",
    name: "Injury and Illness Incident Report",
    purpose: "The detailed report of a single recordable case — what the employee was doing, how the injury/illness happened, the object/substance involved, and the treatment.",
    when: [
      "Complete one 301 for each recordable case, within 7 calendar days of learning of it.",
      "An equivalent form (e.g. a workers'-comp first report of injury) may substitute if it captures the same information.",
      "Attach the completed 301 to the case record in this tracker.",
    ],
    deadline: "Within 7 days of a recordable case",
    retention: "Keep 5 years",
  },
  {
    code: "OSHA 300",
    name: "Log of Work-Related Injuries and Illnesses",
    purpose: "A running log of every recordable work-related injury and illness for the calendar year — one line per case, with the most serious outcome classified.",
    when: [
      "Enter each recordable case within 7 calendar days of learning about it.",
      "Classify the outcome: death, days away from work, restricted duty / job transfer, or other recordable.",
      "Keep a separate 300 Log for each physical location (establishment).",
    ],
    deadline: "Log within 7 days of a recordable case",
    retention: "Keep 5 years",
  },
  {
    code: "OSHA 300A",
    name: "Summary of Work-Related Injuries and Illnesses",
    purpose: "The year-end summary of the 300 Log totals — signed by a company executive and posted where employees can see it, even in a year with zero cases.",
    when: [
      "Complete after year-end from the 300 Log totals (enter zeros if there were no cases).",
      "A company executive must certify it.",
      "Post it in a common area February 1 – April 30.",
      "Some establishments must also e-file the 300A to OSHA by March 2 — verify at osha.gov/injuryreporting.",
    ],
    deadline: "Post Feb 1 – Apr 30 each year",
    retention: "Keep 5 years",
  },
];

// The general recording criteria (29 CFR 1904.7) — any one makes a case recordable.
const CRITERIA = [
  "Death",
  "One or more days away from work",
  "Restricted work, or transfer to another job",
  "Medical treatment beyond first aid",
  "Loss of consciousness",
  "A significant injury or illness diagnosed by a physician or licensed health-care professional (e.g. fractured or cracked bone, punctured eardrum, cancer)",
  "A needlestick or sharp contaminated with blood/OPIM, a diagnosed TB case, a standard-threshold hearing loss, or a medical-removal case",
];

type WorkRel = null | boolean;

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      {children} <ExternalLink className="size-3" />
    </a>
  );
}

export function RecordkeepingGuide() {
  const [open, setOpen] = useState(false);

  // Decision algorithm state
  const [workRelated, setWorkRelated] = useState<WorkRel>(null);
  const [newCase, setNewCase] = useState<WorkRel>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [showResult, setShowResult] = useState(false);

  const toggleCriterion = (i: number) =>
    setChecked((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const reset = () => { setWorkRelated(null); setNewCase(null); setChecked(new Set()); setShowResult(false); };

  const recordable = showResult && workRelated === true && newCase === true && checked.size > 0;
  const firstAidOnly = showResult && workRelated === true && newCase === true && checked.size === 0;

  const YesNo = ({ value, onPick }: { value: WorkRel; onPick: (v: boolean) => void }) => (
    <div className="flex gap-2">
      <Button size="sm" variant={value === true ? "default" : "outline"} onClick={() => onPick(true)}>Yes</Button>
      <Button size="sm" variant={value === false ? "default" : "outline"} onClick={() => onPick(false)}>No</Button>
    </div>
  );

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="size-4 text-primary" />
            OSHA recordkeeping guide — which form to file, when, and blank forms
          </CardTitle>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-6">
          {/* Severe-event reporting — always applies, even when not recordable */}
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Report severe events to OSHA directly — regardless of recordkeeping.</p>
              <p className="mt-0.5 text-muted-foreground">
                A work-related <span className="font-medium text-foreground">fatality within 8 hours</span>; an{" "}
                <span className="font-medium text-foreground">inpatient hospitalization, amputation, or loss of an eye within 24 hours</span>.
                Call <span className="inline-flex items-center gap-1 font-medium text-foreground"><Phone className="size-3" /> 1-800-321-OSHA (6742)</span> or report at <ExtLink href={OSHA_REPORT_URL}>osha.gov/report</ExtLink>.
              </p>
            </div>
          </div>

          {/* Decision algorithm */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Is this case recordable? Which form?</h3>
              {(workRelated !== null || showResult) && (
                <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="size-3.5" /> Start over</Button>
              )}
            </div>
            <div className="space-y-3 rounded-lg border border-border p-4">
              {/* Step 1 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">1. Is it a <span className="font-medium">work-related</span> injury or illness?</span>
                <YesNo value={workRelated} onPick={(v) => { setWorkRelated(v); setNewCase(null); setChecked(new Set()); setShowResult(v === false); }} />
              </div>

              {workRelated === false && (
                <ResultBox tone="ok" title="Not OSHA-recordable"
                  body="Only work-related injuries and illnesses are recordable. No 300 or 301 entry is required — keep any internal note." />
              )}

              {/* Step 2 */}
              {workRelated === true && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <span className="text-sm">2. Is it a <span className="font-medium">new case</span> (not a recurrence of a case already recorded)?</span>
                  <YesNo value={newCase} onPick={(v) => { setNewCase(v); setChecked(new Set()); setShowResult(v === false); }} />
                </div>
              )}

              {workRelated === true && newCase === false && (
                <ResultBox tone="ok" title="Update the existing case"
                  body="This isn't a new case — update the original entry on the 300 Log (e.g. day counts) rather than recording it again." />
              )}

              {/* Step 3 */}
              {workRelated === true && newCase === true && (
                <div className="border-t border-border/60 pt-3">
                  <p className="mb-2 text-sm">3. Check <span className="font-medium">every outcome that applies</span> (any one makes it recordable):</p>
                  <div className="space-y-1.5">
                    {CRITERIA.map((c, i) => (
                      <label key={i} className="flex cursor-pointer items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={checked.has(i)} onChange={() => { toggleCriterion(i); setShowResult(false); }} />
                        <span className="text-muted-foreground">{c}</span>
                      </label>
                    ))}
                  </div>
                  {!showResult && (
                    <Button size="sm" className="mt-3" onClick={() => setShowResult(true)}>See what to file</Button>
                  )}
                </div>
              )}

              {recordable && (
                <ResultBox tone="record" title="Recordable — file the OSHA forms">
                  <ol className="mt-1 list-decimal space-y-1 pl-4">
                    <li>Complete <span className="font-medium text-foreground">OSHA 301</span> (Incident Report) within <span className="font-medium text-foreground">7 calendar days</span>. <ExtLink href={OSHA_FORMS_PACKAGE_URL}>Open the blank form</ExtLink></li>
                    <li>Enter the case on the <span className="font-medium text-foreground">OSHA 300 Log</span> and classify the outcome (death / days away / restricted / other).</li>
                    <li>It rolls into the year-end <span className="font-medium text-foreground">OSHA 300A</span> summary (post Feb 1 – Apr 30).</li>
                    <li>Log it below (<span className="font-medium text-foreground">New record → Injury/Illness</span>), set recordability to <span className="font-medium text-foreground">Recordable</span>, and attach the completed 301.</li>
                  </ol>
                </ResultBox>
              )}

              {firstAidOnly && (
                <ResultBox tone="ok" title="Not recordable (first-aid only)"
                  body="With none of the criteria met, this is a first-aid-only case — not OSHA-recordable. No 300/301 entry is required; keep an internal note. (Still report severe outcomes above.)" />
              )}
            </div>
          </div>

          {/* Forms reference */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">The forms — purpose, when to use, and blank copies</h3>
              <ExtLink href={OSHA_FORMS_HUB_URL}>All blank forms &amp; instructions at osha.gov</ExtLink>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {FORMS.map((f) => (
                <div key={f.code} className="flex flex-col rounded-lg border border-border p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <span className="font-semibold">{f.code}</span>
                  </div>
                  <p className="text-xs font-medium text-foreground">{f.name}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{f.purpose}</p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">When to use</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {f.when.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="warning">{f.deadline}</Badge>
                    <Badge variant="secondary">{f.retention}</Badge>
                  </div>
                  <div className="mt-3 pt-2">
                    <ExtLink href={OSHA_FORMS_PACKAGE_URL}>Open blank form (PDF)</ExtLink>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Official fillable 300 / 300A / 301 package.</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Related requirement + small-employer note */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Sharps injury log (needlesticks)</p>
              <p className="mt-1">Under the Bloodborne Pathogens standard (29 CFR 1910.1030), practices that keep the 300 Log must also maintain a sharps injury log — date, device type and brand, department/location, and how the injury happened. There is no official OSHA form; keep your own. A contaminated needlestick is also OSHA-recordable (above).</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Small-practice partial exemption</p>
              <p className="mt-1">A practice with <span className="font-medium text-foreground">10 or fewer employees</span> at all times during the previous calendar year is partially exempt from routinely keeping the 300/300A/301 (29 CFR 1904.1) — but must still report severe events above and respond to any OSHA/BLS survey. This exemption is by <span className="font-medium text-foreground">size, not industry</span>; confirm your headcount. When in doubt, keep the records.</p>
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
            General guidance summarizing 29 CFR 1904 for a behavioral-health practice — not legal advice. Verify against the current OSHA standard.
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ResultBox({ tone, title, body, children }: {
  tone: "record" | "ok";
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  const record = tone === "record";
  return (
    <div className={cn("rounded-lg border p-3 text-sm", record ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5")}>
      <div className="flex items-center gap-2">
        {record ? <AlertTriangle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-success" />}
        <span className="font-semibold">{title}</span>
      </div>
      {body && <p className="mt-1 text-muted-foreground">{body}</p>}
      {children && <div className="text-muted-foreground">{children}</div>}
    </div>
  );
}
