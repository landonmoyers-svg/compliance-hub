"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import { credentialStatus, assignmentIsOverdue } from "@/lib/compliance";
import { parseDate, formatDate } from "@/lib/dates";
import { humanizeLabel } from "@/lib/format";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  addMonths,
  subMonths,
  format,
} from "date-fns";

type CalEvent = {
  id: string;
  date: Date;
  label: string;
  type: "credential" | "training" | "document" | "insurance" | "drill" | "regulatory";
  urgent: boolean;
};

const TYPE_COLOR: Record<CalEvent["type"], string> = {
  credential: "bg-warning/80 text-warning-foreground",
  training: "bg-primary/80 text-primary-foreground",
  document: "bg-secondary text-secondary-foreground",
  insurance: "bg-chart-5/80 text-white",
  drill: "bg-success/80 text-success-foreground",
  regulatory: "bg-chart-4/80 text-white",
};

// Fixed recurring regulatory/statutory compliance deadlines for a behavioral
// health practice. Each is defined by a calendar month/day (month is 1-based)
// and expanded into a concrete Date for whatever year is being displayed.
type RegulatoryRule = {
  id: string;
  month?: number; // 1-12; omit for a monthly-recurring rule
  day: number;
  label: string;
  recurrence?: "monthly"; // expands to every month on `day`
};

const REGULATORY_RULES: RegulatoryRule[] = [
  { id: "osha-300a-open", month: 2, day: 1, label: "OSHA 300A posting opens" },
  { id: "osha-300a-close", month: 4, day: 30, label: "OSHA 300A posting closes" },
  { id: "osha-ita", month: 3, day: 2, label: "OSHA ITA electronic injury data submission due" },
  { id: "hipaa-training", month: 1, day: 31, label: "Annual HIPAA workforce training due" },
  { id: "bbp-training", month: 3, day: 31, label: "Annual OSHA / Bloodborne Pathogens training due" },
  { id: "compliance-review", month: 12, day: 31, label: "Annual compliance program review due" },
  { id: "wvp-review", month: 6, day: 30, label: "Workplace Violence Prevention plan review due" },
  { id: "eap-drill-spring", month: 4, day: 15, label: "Emergency Action Plan / drill review" },
  { id: "eap-drill-fall", month: 10, day: 15, label: "Emergency Action Plan / drill review" },
  { id: "dea-inventory", month: 5, day: 1, label: "DEA controlled-substance inventory (biennial)" },
  { id: "cs-recon-q1", month: 3, day: 31, label: "Quarterly controlled-substance reconciliation (Q1)" },
  { id: "cs-recon-q2", month: 6, day: 30, label: "Quarterly controlled-substance reconciliation (Q2)" },
  { id: "cs-recon-q3", month: 9, day: 30, label: "Quarterly controlled-substance reconciliation (Q3)" },
  { id: "cs-recon-q4", month: 12, day: 31, label: "Quarterly controlled-substance reconciliation (Q4)" },
  { id: "cs-upload-cadence", day: 5, recurrence: "monthly", label: "Scan & upload all controlled-substance paper logs (monthly)" },
  // Added from the regulatory source register. Provider-specific dates (each DEA
  // registration, state license, Spravato REMS cert) should also be entered as
  // credentials with real expiration dates — those render here automatically.
  { id: "hipaa-sra", month: 11, day: 30, label: "Annual HIPAA Security Risk Analysis due" },
  { id: "dea-reg-review", month: 1, day: 15, label: "Review DEA registrations & controlled-substance licenses (renewals)" },
  { id: "pdmp-audit-h1", month: 6, day: 15, label: "PDMP (Utah CSD) prescriber compliance audit (H1)" },
  { id: "pdmp-audit-h2", month: 12, day: 15, label: "PDMP (Utah CSD) prescriber compliance audit (H2)" },
  { id: "spravato-rems", month: 1, day: 20, label: "SPRAVATO REMS certification renewal (annual)" },
  { id: "oig-screen", month: 1, day: 10, label: "OIG/LEIE + SAM exclusion re-screening (recommended monthly)" },
  { id: "dea-telemed-recheck", month: 12, day: 1, label: "Recheck DEA telemedicine prescribing rule (flexibility expires 12/31/26)" },
  // Data backup & contingency (HIPAA 45 CFR 164.308(a)(7)).
  { id: "backup-restore-h1", month: 1, day: 31, label: "Backup restore test (H1) — verify offsite backups restore" },
  { id: "backup-restore-h2", month: 7, day: 31, label: "Backup restore test (H2) — verify offsite backups restore" },
  { id: "contingency-review", month: 12, day: 15, label: "Annual data backup & contingency plan review (HIPAA 164.308(a)(7))" },
];

export default function ComplianceCalendarPage() {
  const credsQ = useCollection("credentials");
  const trainingQ = useCollection("trainingAssignments");
  const docsQ = useCollection("documents");
  const insQ = useCollection("insurancePolicies");
  const drillsQ = useCollection("emergencyDrills");

  const [current, setCurrent] = useState(() => new Date());

  const queries = [credsQ, trainingQ, docsQ, insQ, drillsQ];
  const loading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const events = useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = [];
    const push = (
      id: string,
      dateStr: string | null | undefined,
      label: string,
      type: CalEvent["type"],
      urgent = false,
    ) => {
      const d = parseDate(dateStr);
      if (d) out.push({ id, date: d, label, type, urgent });
    };

    for (const c of credsQ.data ?? []) {
      const st = credentialStatus(c);
      if (st !== "no_expiry") {
        push(`cred-${c.id}`, c.expirationDate, `${c.credentialName} (${c.employeeName})`, "credential", st === "expired" || st === "expiring_soon");
      }
    }
    for (const a of trainingQ.data ?? []) {
      if (a.status !== "completed") {
        push(`tr-${a.id}`, a.dueDate, `${a.moduleTitle} — ${a.assignedToName}`, "training", assignmentIsOverdue(a));
      }
    }
    for (const d of docsQ.data ?? []) {
      if (d.status === "active" && d.reviewDate) {
        push(`doc-${d.id}`, d.reviewDate, `Review: ${d.title}`, "document");
      }
    }
    for (const i of insQ.data ?? []) {
      push(`ins-${i.id}`, i.renewalDate, `Renew: ${i.policyName}`, "insurance");
    }
    for (const dr of drillsQ.data ?? []) {
      if (dr.status === "scheduled") {
        push(`drill-${dr.id}`, dr.scheduledDate, dr.drillTitle, "drill");
      }
    }

    // Fixed recurring regulatory deadlines, expanded for the displayed year.
    const year = current.getFullYear();
    for (const rule of REGULATORY_RULES) {
      if (rule.recurrence === "monthly") {
        // Expand to every month on `day` for the displayed year.
        for (let m = 0; m < 12; m++) {
          out.push({ id: `reg-${rule.id}-${year}-${m}`, date: new Date(year, m, rule.day), label: rule.label, type: "regulatory", urgent: false });
        }
      } else {
        out.push({ id: `reg-${rule.id}-${year}`, date: new Date(year, (rule.month ?? 1) - 1, rule.day), label: rule.label, type: "regulatory", urgent: false });
      }
    }

    return out;
  }, [credsQ.data, trainingQ.data, docsQ.data, insQ.data, drillsQ.data, current]);

  // Build grid for current month: weeks × days, with leading/trailing empty cells
  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart); // Sunday=0

  const [selected, setSelected] = useState<Date | null>(null);
  const selectedEvents = selected ? events.filter((e) => isSameDay(e.date, selected)) : [];

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance Calendar" />
        <ErrorState
          message="We couldn't load calendar data."
          onRetry={() => queries.forEach((q) => void q.refetch())}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Calendar"
        description="Visualize credential expirations, training due dates, document reviews, and drills in one calendar view."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{format(current, "MMMM yyyy")}</CardTitle>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setCurrent(subMonths(current, 1))} aria-label="Previous month">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="ghost" onClick={() => setCurrent(new Date())}>Today</Button>
                <Button size="icon" variant="ghost" onClick={() => setCurrent(addMonths(current, 1))} aria-label="Next month">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <>
                {/* Day headers */}
                <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="py-1">{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div className="grid grid-cols-7 gap-px bg-border rounded overflow-hidden">
                  {Array.from({ length: leadingBlanks }).map((_, i) => (
                    <div key={`blank-${i}`} className="bg-card min-h-[72px]" />
                  ))}
                  {days.map((day) => {
                    const dayEvents = events.filter((e) => isSameDay(e.date, day));
                    const isSelected = selected && isSameDay(day, selected);
                    const isToday = isSameDay(day, new Date());
                    return (
                      <div
                        key={day.toISOString()}
                        onClick={() => setSelected(isSelected ? null : day)}
                        className={`bg-card min-h-[72px] p-1 cursor-pointer transition-colors hover:bg-secondary/50 ${isSelected ? "ring-1 ring-primary" : ""}`}
                      >
                        <div className={`mb-1 flex size-6 items-center justify-center rounded-full text-xs font-medium ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
                          {format(day, "d")}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map((e) => (
                            <div
                              key={e.id}
                              className={`truncate rounded px-1 text-[10px] leading-tight py-0.5 ${TYPE_COLOR[e.type]}`}
                            >
                              {e.label}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sidebar: legend + selected events */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(Object.entries(TYPE_COLOR) as [CalEvent["type"], string][]).map(([type, cls]) => (
                <div key={type} className="flex items-center gap-2 text-sm">
                  <span className={`size-3 rounded-sm ${cls}`} />
                  <span className="capitalize">{humanizeLabel(type)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {selected ? formatDate(selected.toISOString()) : "Select a day"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selected ? (
                <p className="text-sm text-muted-foreground">Click a day to see events.</p>
              ) : selectedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events on this day.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedEvents.map((e) => (
                    <li key={e.id} className="flex items-start gap-2 text-sm">
                      <Badge variant="secondary" className="shrink-0 capitalize text-xs">{humanizeLabel(e.type)}</Badge>
                      <span className="break-words">{e.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* All upcoming this month */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            {format(current, "MMMM")} events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            (() => {
              const monthEvents = events.filter((e) => e.date >= monthStart && e.date <= monthEnd).sort((a, b) => a.date.getTime() - b.date.getTime());
              if (monthEvents.length === 0) {
                return <p className="text-sm text-muted-foreground">No events this month.</p>;
              }
              return (
                <ul className="divide-y divide-border">
                  {monthEvents.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.label}</p>
                        <p className="text-xs text-muted-foreground capitalize">{humanizeLabel(e.type)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {e.urgent && <Badge variant="destructive">Urgent</Badge>}
                        <span className="text-muted-foreground">{format(e.date, "MMM d")}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()
          )}
        </CardContent>
      </Card>
    </div>
  );
}
