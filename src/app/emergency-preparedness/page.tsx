"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, Plus, Search, CheckCircle2, ShieldCheck, ChevronDown } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { FileLink } from "@/components/shared/file-link";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { formatDate, isExpired, daysUntil, dateInputToISO } from "@/lib/dates";
import type { EmergencyDrill, ComplianceDocument, TrainingAssignment } from "@/lib/data/schema";
import { humanizeLabel } from "@/lib/format";
import { toast } from "sonner";

const STATUS_VARIANT = {
  scheduled: "secondary",
  completed: "success",
  cancelled: "destructive",
} as const;

/* --------------------- convergence requirements --------------------- */
/**
 * Emergency preparedness is where OSHA, HIPAA, and internal SOPs converge. The
 * catalog below is a static, decision-support checklist of the plans, drills,
 * and training a psychiatric practice is expected to have. Evidence is
 * AGGREGATED from data the practice already maintains (active SOPs in
 * `documents`, `emergencyDrills`, completed `trainingAssignments`) — nothing
 * here creates or stores new records. Citations are provided for reference and
 * are not legal advice.
 */

interface EvidenceCtx {
  /** First active document whose title contains any of the keywords. */
  findDoc: (keywords: string[]) => ComplianceDocument | undefined;
  /** First non-cancelled drill of a matching type within the last year (or upcoming). */
  recentDrill: (keywords: string[]) => EmergencyDrill | undefined;
  /** First completed training assignment whose module title contains the keyword. */
  completedTraining: (keyword: string) => TrainingAssignment | undefined;
  /** Whether any drill has been completed (proxy for post-drill reporting). */
  hasCompletedDrill: boolean;
}

interface Evidence {
  met: boolean;
  doc?: ComplianceDocument;
  drill?: EmergencyDrill;
  note?: string;
}

interface RequirementDef {
  key: string;
  title: string;
  citation: string;
  guidance: string;
  check: (ctx: EvidenceCtx) => Evidence;
}

const REQUIREMENTS: RequirementDef[] = [
  {
    key: "eap",
    title: "OSHA Emergency Action Plan (EAP)",
    citation: "29 CFR 1910.38",
    guidance:
      "Draft a written EAP covering evacuation routes and procedures, alarm systems, how staff are accounted for after evacuation, and who to contact for more information. Upload it as an active SOP so it appears here.",
    check: (c) => {
      const doc = c.findDoc(["emergency action", "eap", "evacuation"]);
      return { met: !!doc, doc };
    },
  },
  {
    key: "fire-prevention",
    title: "OSHA Fire Prevention Plan",
    citation: "29 CFR 1910.39",
    guidance:
      "Create a written Fire Prevention Plan listing major fire hazards, ignition-source controls, and the staff responsible for maintaining fire-control equipment. Upload it as an active SOP.",
    check: (c) => {
      const doc = c.findDoc(["fire"]);
      return { met: !!doc, doc };
    },
  },
  {
    key: "fire-drills",
    title: "Fire / evacuation drills at OSHA cadence",
    citation: "29 CFR 1910.38 · NFPA 101",
    guidance:
      "Run and document a fire/evacuation drill at least annually (many jurisdictions and NFPA 101 expect more frequent drills). Schedule one below, then mark it completed with the participant count so it counts as evidence.",
    check: (c) => {
      const drill = c.recentDrill(["fire", "evacuation"]);
      return { met: !!drill, drill };
    },
  },
  {
    key: "hipaa-contingency",
    title: "HIPAA Contingency Plan (disaster recovery, emergency-mode ops, data backup)",
    citation: "45 CFR 164.308(a)(7)",
    guidance:
      "Adopt a written Contingency Plan with a data backup plan, disaster recovery plan, and emergency-mode operations plan so ePHI stays available and protected during an emergency. Upload it as an active SOP.",
    check: (c) => {
      const doc = c.findDoc(["contingency", "disaster recovery", "backup", "emergency mode", "emergency-mode"]);
      return { met: !!doc, doc };
    },
  },
  {
    key: "workplace-violence",
    title: "Workplace violence / active-shooter plan",
    citation: "29 U.S.C. 654(a)(1) — OSH Act General Duty Clause",
    guidance:
      "Document a workplace violence prevention plan (behavioral-health settings carry elevated risk), including active-shooter response, de-escalation, and reporting. Upload it as an active SOP.",
    check: (c) => {
      const doc = c.findDoc(["workplace violence", "active shooter", "active-shooter"]);
      return { met: !!doc, doc };
    },
  },
  {
    key: "severe-weather",
    title: "Severe weather / natural disaster plan",
    citation: "29 CFR 1910.38",
    guidance:
      "Add a severe-weather / natural-disaster annex to your EAP covering sheltering, closures, and communication for events like tornadoes, floods, or earthquakes. Upload it as an active SOP.",
    check: (c) => {
      const doc = c.findDoc(["severe weather", "tornado", "disaster", "natural disaster"]);
      return { met: !!doc, doc };
    },
  },
  {
    key: "staff-training",
    title: "Staff EAP training",
    citation: "29 CFR 1910.38(e)–(f)",
    guidance:
      "Train staff on the emergency action plan when it is developed, when responsibilities change, and when the plan changes. Assign an emergency-preparedness training module and record completions in Training.",
    check: (c) => {
      const asg = c.completedTraining("emergency");
      return {
        met: !!asg,
        note: asg ? `Completed: ${asg.moduleTitle} — ${asg.assignedToName}` : undefined,
      };
    },
  },
  {
    key: "post-incident",
    title: "Post-incident / post-drill reporting",
    citation: "45 CFR 164.308(a)(7)(ii)(D) — testing & revision",
    guidance:
      "Capture an after-action review after each drill or real event and use it to revise the plan. Document a completed drill below, or upload an after-action / debrief SOP as an active document.",
    check: (c) => {
      const doc = c.findDoc(["after-action", "after action", "post-incident", "post incident", "debrief", "drill report"]);
      if (doc) return { met: true, doc };
      return {
        met: c.hasCompletedDrill,
        note: c.hasCompletedDrill ? "At least one drill has been completed and can be reviewed." : undefined,
      };
    },
  },
];

/* ----------------------------- dialog ------------------------------- */

interface DrillForm {
  drillTitle: string;
  drillType: string;
  scheduledDate: string;
  status: EmergencyDrill["status"];
  participantCount: string;
}

const EMPTY: DrillForm = {
  drillTitle: "",
  drillType: "fire",
  scheduledDate: "",
  status: "scheduled",
  participantCount: "0",
};

function DrillDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: EmergencyDrill;
  onClose: () => void;
  onSave: (data: DrillForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<DrillForm>(
    initial
      ? {
          drillTitle: initial.drillTitle,
          drillType: initial.drillType,
          scheduledDate: initial.scheduledDate ?? "",
          status: initial.status,
          participantCount: String(initial.participantCount),
        }
      : EMPTY,
  );

  const set =
    (k: keyof DrillForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const participantNum = parseInt(form.participantCount, 10);
  const participantValid = form.participantCount === "" || (!isNaN(participantNum) && participantNum >= 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit drill" : "Schedule drill"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Drill title *</label>
            <input className="input w-full" value={form.drillTitle} onChange={set("drillTitle")} placeholder="e.g. Annual Fire Evacuation" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <input className="input w-full" value={form.drillType} onChange={set("drillType")} placeholder="fire, tornado, lockdown…" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select className="input w-full" value={form.status} onChange={set("status")}>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date</label>
              <input type="date" className="input w-full" value={form.scheduledDate} onChange={set("scheduledDate")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Participants</label>
              <input type="number" min="0" className="input w-full" value={form.participantCount} onChange={set("participantCount")} />
              {!participantValid && <p className="text-xs text-destructive">Must be ≥ 0</p>}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.drillTitle.trim() || !participantValid || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------- requirements section ------------------------- */

interface RequirementResult extends RequirementDef {
  evidence: Evidence;
}

function RequirementRow({ req }: { req: RequirementResult }) {
  const [open, setOpen] = useState(false);
  const { evidence } = req;
  const met = evidence.met;

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{req.title}</span>
            <Badge variant="outline">Required</Badge>
            <Badge variant={met ? "success" : "warning"}>
              {met ? "Done" : "Outstanding"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{req.citation}</p>

          {met ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-success">
              <CheckCircle2 className="size-3.5 shrink-0" />
              {evidence.doc ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">Evidence:</span>
                  <span className="text-foreground">{evidence.doc.title}</span>
                  {evidence.doc.fileUrl && <FileLink path={evidence.doc.fileUrl} label="Open SOP" />}
                </span>
              ) : evidence.drill ? (
                <span className="text-muted-foreground">
                  Evidence:{" "}
                  <span className="text-foreground">
                    {evidence.drill.drillTitle}
                    {evidence.drill.scheduledDate ? ` — ${formatDate(evidence.drill.scheduledDate)}` : ""}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">{evidence.note}</span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-xs text-warning hover:underline"
            >
              <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
              {open ? "Hide guidance" : "How to close this gap"}
            </button>
          )}

          {!met && open && (
            <p className="mt-1 max-w-prose rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              {req.guidance}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmergencyRequirementsSection({
  drills,
  loading,
}: {
  drills: EmergencyDrill[];
  loading: boolean;
}) {
  const { data: docsData, isLoading: docsLoading } = useCollection("documents");
  const { data: trainingData, isLoading: trainingLoading } = useCollection("trainingAssignments");

  const isLoading = loading || docsLoading || trainingLoading;

  const results = useMemo<RequirementResult[]>(() => {
    const activeDocs = (docsData ?? []).filter((d) => d.status === "active");
    const assignments = trainingData ?? [];

    const ctx: EvidenceCtx = {
      findDoc: (keywords) =>
        activeDocs.find((d) => {
          const t = d.title.toLowerCase();
          return keywords.some((k) => t.includes(k));
        }),
      recentDrill: (keywords) =>
        drills.find((d) => {
          if (d.status === "cancelled") return false;
          const hay = `${d.drillType} ${d.drillTitle}`.toLowerCase();
          if (!keywords.some((k) => hay.includes(k))) return false;
          const days = daysUntil(d.scheduledDate);
          // Completed/scheduled within the last year, or scheduled going forward.
          return days !== null && days >= -365;
        }),
      completedTraining: (keyword) =>
        assignments.find(
          (a) => a.status === "completed" && a.moduleTitle.toLowerCase().includes(keyword),
        ),
      hasCompletedDrill: drills.some((d) => d.status === "completed"),
    };

    return REQUIREMENTS.map((req) => ({ ...req, evidence: req.check(ctx) }));
  }, [docsData, trainingData, drills]);

  const summary = useMemo(() => {
    const met = results.filter((r) => r.evidence.met).length;
    const total = results.length;
    return {
      met,
      outstanding: total - met,
      coverage: total ? Math.round((met / total) * 100) : 0,
    };
  }, [results]);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Requirements met" value={summary.met} icon={CheckCircle2} tone="success" loading={isLoading} />
        <StatCard
          label="Outstanding"
          value={summary.outstanding}
          icon={AlertTriangle}
          tone={summary.outstanding ? "destructive" : "default"}
          loading={isLoading}
        />
        <StatCard label="Coverage" value={`${summary.coverage}%`} icon={ShieldCheck} tone="default" loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h2 className="font-semibold">Emergency preparedness requirements</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Where OSHA, HIPAA, and your SOPs converge for emergency planning. Evidence is aggregated from your
            active documents, drills, and completed training. Citations are for reference only, not legal advice.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {results.map((req) => (
                <RequirementRow key={req.key} req={req} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/* ----------------------------- page --------------------------------- */

export default function EmergencyPreparednessPage() {
  const { data, isLoading, isError, refetch } = useCollection("emergencyDrills");
  const createMut = useCreate("emergencyDrills");
  const updateMut = useUpdate("emergencyDrills");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<EmergencyDrill["status"] | "all">("all");
  const [editing, setEditing] = useState<EmergencyDrill | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const drills = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return drills.filter((d) => {
      if (filterStatus !== "all" && d.status !== filterStatus) return false;
      if (q && !d.drillTitle.toLowerCase().includes(q) && !d.drillType.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [drills, search, filterStatus]);

  const { sorted, sort, toggle } = useSort(filtered, {
    title: (d) => d.drillTitle,
    type: (d) => d.drillType,
    date: (d) => d.scheduledDate,
    participants: (d) => d.participantCount,
    status: (d) => d.status,
  });

  const stats = useMemo(() => {
    const upcoming = drills.filter((d) => {
      const days = daysUntil(d.scheduledDate);
      return d.status === "scheduled" && days !== null && days >= 0;
    });
    const overdue = drills.filter((d) => d.status === "scheduled" && isExpired(d.scheduledDate));
    return {
      scheduled: drills.filter((d) => d.status === "scheduled").length,
      completed: drills.filter((d) => d.status === "completed").length,
      overdue: overdue.length,
      upcoming: upcoming.length,
    };
  }, [drills]);

  async function handleSave(form: DrillForm) {
    setSaving(true);
    try {
      const payload = {
        drillTitle: form.drillTitle.trim(),
        drillType: form.drillType.trim() || "fire",
        scheduledDate: form.scheduledDate ? dateInputToISO(form.scheduledDate) : undefined,
        status: form.status,
        participantCount: parseInt(form.participantCount, 10) || 0,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Drill updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Drill scheduled");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save drill");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Emergency Preparedness" />
        <ErrorState message="We couldn't load drills." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <DrillDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Emergency Preparedness"
        description="The hub where OSHA, HIPAA, and internal SOPs converge for emergency planning — plus drill scheduling and tracking."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Schedule drill
          </Button>
        }
      />

      <EmergencyRequirementsSection drills={drills} loading={isLoading} />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Scheduled" value={stats.scheduled} icon={AlertTriangle} tone="warning" loading={isLoading} />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} tone={stats.overdue ? "destructive" : "default"} loading={isLoading} />
        <StatCard label="Upcoming (next 30d)" value={stats.upcoming} icon={AlertTriangle} loading={isLoading} />
        <StatCard label="Completed" value={stats.completed} icon={AlertTriangle} tone="success" loading={isLoading} />
      </div>

      {stats.overdue > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {stats.overdue} drill{stats.overdue > 1 ? "s are" : " is"} past the scheduled date and still marked as scheduled. Update the status or reschedule.
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search drills…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(["all", "scheduled", "completed", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {humanizeLabel(s)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No drills found"
              description={search || filterStatus !== "all" ? "Try adjusting your filter." : "Schedule your first emergency drill."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Schedule drill</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Title" sortKey="title" sort={sort} onToggle={toggle} />
                    <SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggle} />
                    <SortHeader label="Participants" sortKey="participants" sort={sort} onToggle={toggle} />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d) => {
                    const days = daysUntil(d.scheduledDate);
                    const overdue = d.status === "scheduled" && isExpired(d.scheduledDate);
                    return (
                      <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Title" className="py-3 pr-4 font-medium">{d.drillTitle}</td>
                        <td data-label="Type" className="py-3 pr-4 capitalize">{humanizeLabel(d.drillType)}</td>
                        <td data-label="Date" className="py-3 pr-4">
                          {d.scheduledDate ? (
                            <div>
                              <div className={overdue ? "text-destructive" : ""}>{formatDate(d.scheduledDate)}</div>
                              {d.status === "scheduled" && days !== null && (
                                <div className="text-xs text-muted-foreground">
                                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d away`}
                                </div>
                              )}
                            </div>
                          ) : "—"}
                        </td>
                        <td data-label="Participants" className="py-3 pr-4">{d.participantCount}</td>
                        <td data-label="Status" className="py-3 pr-4">
                          <button type="button" onClick={() => setEditing(d)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                            <Badge variant={overdue ? "destructive" : STATUS_VARIANT[d.status]}>
                              {overdue ? "Overdue" : humanizeLabel(d.status)}
                            </Badge>
                          </button>
                        </td>
                        <td data-label="" className="py-3">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Edit</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
