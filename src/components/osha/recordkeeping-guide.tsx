"use client";

import { useMemo, useState } from "react";
import {
  FileText, ExternalLink, AlertTriangle, CheckCircle2, ChevronDown,
  Phone, RotateCcw, Wand2, Printer, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import {
  buildOsha300Html, buildOsha300aHtml, buildOsha301Html, openPrint, summarize300,
  type CaseRow, type Osha300aExtra, type Osha301Extra,
} from "@/lib/osha-forms-doc";

// Official OSHA blank forms — fallback for filling by hand (osha.gov/recordkeeping/forms).
export const OSHA_FORMS_PACKAGE_URL = "https://www.osha.gov/sites/default/files/OSHA-RK-Forms-Package.pdf";
const OSHA_FORMS_HUB_URL = "https://www.osha.gov/recordkeeping/forms";
const OSHA_REPORT_URL = "https://www.osha.gov/report";

interface OshaForm { code: string; name: string; purpose: string; when: string[]; deadline: string; retention: string }
const FORMS: OshaForm[] = [
  {
    code: "OSHA 301", name: "Injury and Illness Incident Report",
    purpose: "The detailed report of a single recordable case — what happened, how, the treatment, and the outcome.",
    when: ["One per recordable case, within 7 calendar days of learning of it.", "A workers'-comp first report may substitute if it has the same info.", "Attach the completed 301 to the case in this tracker."],
    deadline: "Within 7 days of a recordable case", retention: "Keep 5 years",
  },
  {
    code: "OSHA 300", name: "Log of Work-Related Injuries and Illnesses",
    purpose: "A running log of every recordable case for the year — one line per case, with the most serious outcome classified.",
    when: ["Enter each recordable case within 7 calendar days.", "Classify the outcome (death / days away / restricted / other).", "Keep a separate log for each physical location."],
    deadline: "Log within 7 days of a recordable case", retention: "Keep 5 years",
  },
  {
    code: "OSHA 300A", name: "Summary of Work-Related Injuries and Illnesses",
    purpose: "The year-end summary of the 300 Log totals — certified by a company executive and posted for employees, even in a zero-case year.",
    when: ["Complete after year-end from the 300 Log totals.", "A company executive must certify it.", "Post Feb 1 – Apr 30; some establishments also e-file by March 2."],
    deadline: "Post Feb 1 – Apr 30 each year", retention: "Keep 5 years",
  },
];

const CRITERIA = [
  "Death",
  "One or more days away from work",
  "Restricted work, or transfer to another job",
  "Medical treatment beyond first aid",
  "Loss of consciousness",
  "A significant injury or illness diagnosed by a physician or licensed health-care professional (e.g. fractured bone, punctured eardrum, cancer)",
  "A needlestick or sharp contaminated with blood/OPIM, a diagnosed TB case, a standard-threshold hearing loss, or a medical-removal case",
];

type YN = null | boolean;

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      {children} <ExternalLink className="size-3" />
    </a>
  );
}

export function RecordkeepingGuide({ cases, establishment }: {
  cases: CaseRow[];
  establishment: { name: string; city: string; state: string };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wand2 className="size-4 text-primary" />
              OSHA recordkeeping assistant — decide the form, then generate the completed document
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Walk a case through the recordability decision, then produce the filled OSHA 300 Log, 300A summary, or 301 report from your records — ready to print or save as PDF.</p>
          </div>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-6">
          <SevereBanner />
          <DecisionAlgorithm />
          <FormsStudio cases={cases} establishment={establishment} />
          <FormsReference />
          <NotesRow />
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
            General guidance summarizing 29 CFR 1904 for a behavioral-health practice — not legal advice. Generated forms are OSHA-equivalent; verify every entry before filing.
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function SevereBanner() {
  return (
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
  );
}

/* ── Step 1: which form / is it recordable ── */
function DecisionAlgorithm() {
  const [workRelated, setWorkRelated] = useState<YN>(null);
  const [newCase, setNewCase] = useState<YN>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [showResult, setShowResult] = useState(false);

  const reset = () => { setWorkRelated(null); setNewCase(null); setChecked(new Set()); setShowResult(false); };
  const recordable = showResult && workRelated === true && newCase === true && checked.size > 0;
  const firstAidOnly = showResult && workRelated === true && newCase === true && checked.size === 0;

  const YesNo = ({ value, onPick }: { value: YN; onPick: (v: boolean) => void }) => (
    <div className="flex gap-2">
      <Button size="sm" variant={value === true ? "default" : "outline"} onClick={() => onPick(true)}>Yes</Button>
      <Button size="sm" variant={value === false ? "default" : "outline"} onClick={() => onPick(false)}>No</Button>
    </div>
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Step 1 — Is this case recordable? Which form?</h3>
        {(workRelated !== null || showResult) && <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="size-3.5" /> Start over</Button>}
      </div>
      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">1. Is it a <span className="font-medium">work-related</span> injury or illness?</span>
          <YesNo value={workRelated} onPick={(v) => { setWorkRelated(v); setNewCase(null); setChecked(new Set()); setShowResult(v === false); }} />
        </div>
        {workRelated === false && <ResultBox tone="ok" title="Not OSHA-recordable" body="Only work-related injuries and illnesses are recordable. No 300 or 301 entry is required." />}

        {workRelated === true && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <span className="text-sm">2. Is it a <span className="font-medium">new case</span> (not a recurrence of one already recorded)?</span>
            <YesNo value={newCase} onPick={(v) => { setNewCase(v); setChecked(new Set()); setShowResult(v === false); }} />
          </div>
        )}
        {workRelated === true && newCase === false && <ResultBox tone="ok" title="Update the existing case" body="Update the original entry on the 300 Log (e.g. day counts) rather than recording it again." />}

        {workRelated === true && newCase === true && (
          <div className="border-t border-border/60 pt-3">
            <p className="mb-2 text-sm">3. Check <span className="font-medium">every outcome that applies</span> (any one makes it recordable):</p>
            <div className="space-y-1.5">
              {CRITERIA.map((c, i) => (
                <label key={i} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={checked.has(i)} onChange={() => { setChecked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; }); setShowResult(false); }} />
                  <span className="text-muted-foreground">{c}</span>
                </label>
              ))}
            </div>
            {!showResult && <Button size="sm" className="mt-3" onClick={() => setShowResult(true)}>See what to file</Button>}
          </div>
        )}

        {recordable && (
          <ResultBox tone="record" title="Recordable — file the OSHA forms">
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>Complete <span className="font-medium text-foreground">OSHA 301</span> within <span className="font-medium text-foreground">7 calendar days</span> — use <span className="font-medium text-foreground">Step 2</span> below to generate it filled.</li>
              <li>Enter the case on the <span className="font-medium text-foreground">300 Log</span> and classify the outcome.</li>
              <li>It rolls into the year-end <span className="font-medium text-foreground">300A</span> summary (post Feb 1 – Apr 30).</li>
              <li>Log the case below (<span className="font-medium text-foreground">New record → Injury/Illness</span>, recordability <span className="font-medium text-foreground">Recordable</span>) so it feeds the generated 300/300A.</li>
            </ol>
          </ResultBox>
        )}
        {firstAidOnly && <ResultBox tone="ok" title="Not recordable (first-aid only)" body="With none of the criteria met, this is a first-aid-only case — no 300/301 entry required. Keep an internal note. (Still report severe outcomes above.)" />}
      </div>
    </div>
  );
}

/* ── Step 2: generate the filled forms ── */
function FormsStudio({ cases, establishment }: { cases: CaseRow[]; establishment: { name: string; city: string; state: string } }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [dialog, setDialog] = useState<null | "300a" | "301">(null);

  const yearCases = useMemo(
    () => cases.filter((c) => (c.eventDate ?? "").slice(0, 4) === year),
    [cases, year],
  );
  const est = { name: establishment.name, city: establishment.city, state: establishment.state, year };

  function gen300() {
    if (!openPrint(buildOsha300Html(yearCases, est))) toast.error("Allow pop-ups to open the form.");
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Step 2 — Generate the completed form from your records</h3>
      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Reporting year</label>
            <input className="input w-28" value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} />
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{yearCases.length}</span> recordable injury/illness case{yearCases.length === 1 ? "" : "s"} logged for {year}
            {cases.length > 0 && yearCases.length === 0 && " — check the year or log cases below."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <GenTile code="OSHA 300" label="Log of injuries & illnesses" desc={`One line per recordable case for ${year}, filled from your records.`} onClick={gen300} />
          <GenTile code="OSHA 300A" label="Annual summary" desc="Totals computed from the year's cases — add employee counts + certifier." onClick={() => setDialog("300a")} />
          <GenTile code="OSHA 301" label="Incident report" desc="Pick a case and fill the full 301 — pre-filled from the record." onClick={() => setDialog("301")} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Generated as an OSHA-equivalent form (29 CFR 1904) — opens in a print / save-as-PDF window. Save it, then attach to the case.</p>
      </div>

      {dialog === "300a" && <Osha300aDialog cases={yearCases} est={est} onClose={() => setDialog(null)} />}
      {dialog === "301" && <Osha301Dialog cases={cases} onClose={() => setDialog(null)} />}
    </div>
  );
}

function GenTile({ code, label, desc, onClick }: { code: string; label: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5">
      <span className="flex items-center gap-2 font-semibold"><FileText className="size-4 text-primary" />{code}</span>
      <span className="text-xs font-medium text-foreground">{label}</span>
      <span className="mt-1 text-xs text-muted-foreground">{desc}</span>
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary"><Wand2 className="size-3" /> Generate</span>
    </button>
  );
}

/* ── 300A dialog: collect the numbers a computed summary needs ── */
function Osha300aDialog({ cases, est, onClose }: { cases: CaseRow[]; est: { name: string; city: string; state: string; year: string }; onClose: () => void }) {
  const t = summarize300(cases);
  const [f, setF] = useState<Osha300aExtra>({
    ...est, street: "", zip: "", naics: "621112", annualAvgEmployees: "", totalHoursWorked: "",
    certifierName: "", certifierTitle: "", certifierPhone: "", certifiedDate: new Date().toISOString().slice(0, 10),
  });
  const set = (k: keyof Osha300aExtra) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const generate = () => { if (!openPrint(buildOsha300aHtml(cases, f))) toast.error("Allow pop-ups to open the form."); onClose(); };

  return (
    <Modal title={`Generate OSHA 300A — ${est.year}`} onClose={onClose} onGenerate={generate}>
      <div className="rounded-md bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        Totals computed from {cases.length} recordable case{cases.length === 1 ? "" : "s"}: {t.deaths} death, {t.daysAwayCases} w/ days away, {t.restrictedCases} restricted, {t.otherCases} other · {t.totalDaysAway} days away, {t.totalDaysRestricted} restricted.
      </div>
      <Field label="Establishment name"><input className="input w-full" value={f.name} onChange={set("name")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Street"><input className="input w-full" value={f.street} onChange={set("street")} /></Field>
        <Field label="City"><input className="input w-full" value={f.city} onChange={set("city")} /></Field>
        <Field label="State"><input className="input w-full" value={f.state} onChange={set("state")} /></Field>
        <Field label="ZIP"><input className="input w-full" value={f.zip} onChange={set("zip")} /></Field>
        <Field label="Industry (NAICS)"><input className="input w-full" value={f.naics} onChange={set("naics")} /></Field>
        <Field label="Annual avg. # employees"><input className="input w-full" value={f.annualAvgEmployees} onChange={set("annualAvgEmployees")} /></Field>
        <Field label="Total hours worked (all employees)"><input className="input w-full" value={f.totalHoursWorked} onChange={set("totalHoursWorked")} /></Field>
      </div>
      <p className="pt-1 text-xs font-semibold text-foreground">Certification (a company executive)</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input className="input w-full" value={f.certifierName} onChange={set("certifierName")} /></Field>
        <Field label="Title"><input className="input w-full" value={f.certifierTitle} onChange={set("certifierTitle")} /></Field>
        <Field label="Phone"><input className="input w-full" value={f.certifierPhone} onChange={set("certifierPhone")} /></Field>
        <Field label="Date"><input type="date" className="input w-full" value={f.certifiedDate} onChange={set("certifiedDate")} /></Field>
      </div>
    </Modal>
  );
}

/* ── 301 dialog: pick a case, fill the remaining fields ── */
function Osha301Dialog({ cases, onClose }: { cases: CaseRow[]; onClose: () => void }) {
  const [caseId, setCaseId] = useState<string>(cases[0]?.id ?? "");
  const selected = cases.find((c) => c.id === caseId);
  const [f, setF] = useState<Osha301Extra>({ employeeGender: "" });
  const set = (k: keyof Osha301Extra) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const chk = (k: keyof Osha301Extra) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.checked }));

  const generate = () => {
    if (!selected) { toast.error("Pick a case to fill."); return; }
    if (!openPrint(buildOsha301Html(selected, f))) toast.error("Allow pop-ups to open the form.");
    onClose();
  };

  return (
    <Modal title="Fill an OSHA 301 — Incident Report" onClose={onClose} onGenerate={generate} generateLabel="Generate 301">
      {cases.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">No recordable injury/illness cases yet. Log one first (New record → Injury/Illness → Recordable).</p>
      ) : (
        <>
          <Field label="Case (from your records)">
            <select className="input w-full" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.injuredEmployeeName || c.recordTitle}{c.eventDate ? ` · ${c.eventDate.slice(0, 10)}` : ""}</option>)}
            </select>
          </Field>
          <p className="rounded-md bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">Pre-filled from the record: employee, date, injury description, what happened, physician. Add the rest below — blanks print as fill-in lines.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Case number (300 Log)"><input className="input w-full" value={f.caseNumber ?? ""} onChange={set("caseNumber")} /></Field>
            <Field label="Employee sex">
              <select className="input w-full" value={f.employeeGender} onChange={set("employeeGender")}>
                <option value="">—</option><option value="male">Male</option><option value="female">Female</option>
              </select>
            </Field>
            <Field label="Employee address (street/city/state/zip)"><input className="input w-full" value={f.employeeAddress ?? ""} onChange={set("employeeAddress")} /></Field>
            <Field label="Date of birth"><input type="date" className="input w-full" value={f.employeeDob ?? ""} onChange={set("employeeDob")} /></Field>
            <Field label="Date hired"><input type="date" className="input w-full" value={f.employeeHireDate ?? ""} onChange={set("employeeHireDate")} /></Field>
            <Field label="Time employee began work"><input className="input w-full" value={f.timeBeganWork ?? ""} onChange={set("timeBeganWork")} placeholder="e.g. 8:00 AM" /></Field>
            <Field label="Time of event"><input className="input w-full" value={f.timeOfEvent ?? ""} onChange={set("timeOfEvent")} placeholder="e.g. 2:30 PM" /></Field>
            <Field label="Health care professional"><input className="input w-full" value={f.physicianName ?? ""} onChange={set("physicianName")} placeholder={selected?.physicianName || ""} /></Field>
            <Field label="Facility (if off-site)"><input className="input w-full" value={f.facilityName ?? ""} onChange={set("facilityName")} /></Field>
            <Field label="Facility address"><input className="input w-full" value={f.facilityAddress ?? ""} onChange={set("facilityAddress")} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 py-1">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={!!f.treatedInEr} onChange={chk("treatedInEr")} /> Treated in an emergency room</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={!!f.hospitalizedOvernight} onChange={chk("hospitalizedOvernight")} /> Hospitalized overnight as in-patient</label>
          </div>
          <Field label="What was the employee doing just before the incident?"><textarea className="input w-full" rows={2} value={f.whatDoingBefore ?? ""} onChange={set("whatDoingBefore")} /></Field>
          <Field label="What happened / how did the injury occur?"><textarea className="input w-full" rows={2} value={f.whatHappened ?? ""} onChange={set("whatHappened")} placeholder={selected?.description || ""} /></Field>
          <Field label="What object or substance harmed the employee?"><input className="input w-full" value={f.objectSubstance ?? ""} onChange={set("objectSubstance")} /></Field>
          <p className="pt-1 text-xs font-semibold text-foreground">Completed by</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className="input w-full" value={f.completedByName ?? ""} onChange={set("completedByName")} /></Field>
            <Field label="Title"><input className="input w-full" value={f.completedByTitle ?? ""} onChange={set("completedByTitle")} /></Field>
            <Field label="Phone"><input className="input w-full" value={f.completedByPhone ?? ""} onChange={set("completedByPhone")} /></Field>
            <Field label="Date completed"><input type="date" className="input w-full" value={f.completedDate ?? ""} onChange={set("completedDate")} /></Field>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ── shared bits ── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>;
}

function Modal({ title, onClose, onGenerate, generateLabel = "Generate", children }: {
  title: string; onClose: () => void; onGenerate: () => void; generateLabel?: string; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-3 p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onGenerate}><Printer className="size-4" /> {generateLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function FormsReference() {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Reference — what each form is for, and blank copies</h3>
        <ExtLink href={OSHA_FORMS_HUB_URL}>All blank forms &amp; instructions at osha.gov</ExtLink>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {FORMS.map((f) => (
          <div key={f.code} className="flex flex-col rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center gap-2"><FileText className="size-4 text-primary" /><span className="font-semibold">{f.code}</span></div>
            <p className="text-xs font-medium text-foreground">{f.name}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{f.purpose}</p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">When to use</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{f.when.map((w, i) => <li key={i}>{w}</li>)}</ul>
            <div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="warning">{f.deadline}</Badge><Badge variant="secondary">{f.retention}</Badge></div>
            <div className="mt-3 pt-2"><ExtLink href={OSHA_FORMS_PACKAGE_URL}>Open blank form (PDF)</ExtLink></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesRow() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Sharps injury log (needlesticks)</p>
        <p className="mt-1">Under the Bloodborne Pathogens standard (29 CFR 1910.1030), practices that keep the 300 Log must also maintain a sharps injury log — date, device type and brand, location, and how the injury happened. No official OSHA form; keep your own. A contaminated needlestick is also OSHA-recordable.</p>
      </div>
      <div className="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Small-practice partial exemption</p>
        <p className="mt-1">A practice with <span className="font-medium text-foreground">10 or fewer employees</span> at all times during the previous calendar year is partially exempt from routinely keeping the 300/300A/301 (29 CFR 1904.1) — but must still report severe events above. This exemption is by <span className="font-medium text-foreground">size, not industry</span>; confirm your headcount. When in doubt, keep the records.</p>
      </div>
    </div>
  );
}

function ResultBox({ tone, title, body, children }: { tone: "record" | "ok"; title: string; body?: string; children?: React.ReactNode }) {
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
