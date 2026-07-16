"use client";

import { useState, useMemo } from "react";
import { Award, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { PersonLink } from "@/components/shared/person-link";
import { DuplicateFinder, dupNorm } from "@/components/shared/duplicate-finder";
import { formatDate } from "@/lib/dates";
import { humanizeLabel } from "@/lib/format";
import { buildHolderIndex, holderIsActive } from "@/lib/compliance";
import type { CompetencyRecord, Employee } from "@/lib/data/schema";
import { toast } from "sonner";

/* ----------------------------- constants --------------------------- */

const COMPETENCY_TYPES = [
  "clinical",
  "safety",
  "technical",
  "administrative",
  "other",
] as const;
type CompetencyType = (typeof COMPETENCY_TYPES)[number];

const STORED_STATUSES = [
  "pending",
  "evaluated",
  "passed",
  "failed",
  "expired",
] as const;
type StoredStatus = (typeof STORED_STATUSES)[number];

/** Common behavioral-health competencies — offered as a picklist (free text still allowed). */
const COMMON_COMPETENCIES = [
  "Suicide risk assessment (C-SSRS)",
  "De-escalation / crisis intervention",
  "Medication administration",
  "Spravato / esketamine REMS administration & monitoring",
  "Ketamine infusion monitoring",
  "Vital signs & patient monitoring",
  "Injection technique (IM/SC)",
  "CPR / BLS certification",
  "Controlled-substance handling & reconciliation",
  "Infection control & hand hygiene",
  "Telehealth visit workflow",
  "EHR / documentation standards",
  "Emergency response / code procedures",
  "HIPAA privacy in practice",
];

/** Display status includes a derived "expired" that we never persist on read. */
type DisplayStatus = StoredStatus;

const STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: "Pending",
  evaluated: "Evaluated",
  passed: "Passed",
  failed: "Failed",
  expired: "Expired",
};

const STATUS_VARIANT: Record<
  DisplayStatus,
  "success" | "warning" | "destructive" | "secondary"
> = {
  pending: "warning",
  evaluated: "secondary",
  passed: "success",
  failed: "destructive",
  expired: "destructive",
};

/* ----------------------------- helpers ----------------------------- */

/** Today's date-only string (YYYY-MM-DD) in UTC. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** TZ-safe parse of a date-only string to epoch ms (UTC midnight), or null. */
function dateOnlyMs(d: string | null | undefined): number | null {
  if (!d) return null;
  const ms = new Date(d + "T00:00:00Z").getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Derive the display status from a record without mutating stored state.
 * If validUntil is in the past and the record was passed/evaluated, show "Expired".
 */
function displayStatus(r: CompetencyRecord): DisplayStatus {
  const validMs = dateOnlyMs(r.validUntil);
  const todayMs = dateOnlyMs(todayISO())!;
  if (
    validMs !== null &&
    validMs < todayMs &&
    (r.status === "passed" || r.status === "evaluated")
  ) {
    return "expired";
  }
  return r.status;
}

/* ------------------------------- form ------------------------------ */

interface FormState {
  employeeId: string;
  employeeName: string;
  competencyName: string;
  competencyType: CompetencyType;
  evaluatorName: string;
  assessmentDate: string;
  validUntil: string;
  score: string;
  status: StoredStatus;
  notes: string;
}

function emptyForm(defaultEvaluator: string): FormState {
  return {
    employeeId: "",
    employeeName: "",
    competencyName: "",
    competencyType: "clinical",
    evaluatorName: defaultEvaluator,
    assessmentDate: "",
    validUntil: "",
    score: "",
    status: "pending",
    notes: "",
  };
}

function CompetencyDialog({
  initial,
  employees,
  defaultEvaluator,
  onClose,
  onSave,
  saving,
}: {
  initial?: CompetencyRecord;
  employees: Employee[];
  defaultEvaluator: string;
  onClose: () => void;
  onSave: (data: FormState) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          employeeId: initial.employeeId ?? "",
          employeeName: initial.employeeName,
          competencyName: initial.competencyName,
          competencyType: initial.competencyType,
          evaluatorName: initial.evaluatorName ?? "",
          assessmentDate: initial.assessmentDate ?? "",
          validUntil: initial.validUntil ?? "",
          score: initial.score != null ? String(initial.score) : "",
          status: initial.status,
          notes: initial.notes ?? "",
        }
      : emptyForm(defaultEvaluator),
  );

  function onEmployeeChange(id: string) {
    const emp = employees.find((e) => e.id === id);
    setForm((p) => ({
      ...p,
      employeeId: id,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
    }));
  }

  const scoreNum = form.score.trim() === "" ? null : Number(form.score);
  const scoreInvalid =
    scoreNum !== null &&
    (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100);

  const dateOrderInvalid =
    form.assessmentDate !== "" &&
    form.validUntil !== "" &&
    dateOnlyMs(form.validUntil)! < dateOnlyMs(form.assessmentDate)!;

  const valid =
    form.employeeName.trim() !== "" &&
    form.competencyName.trim() !== "" &&
    !scoreInvalid &&
    !dateOrderInvalid;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">
            {initial ? "Edit competency" : "Add competency"}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Employee *</label>
            <select
              className="input w-full"
              value={form.employeeId}
              onChange={(e) => onEmployeeChange(e.target.value)}
            >
              <option value="">Select an employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                  {e.title ? ` — ${e.title}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Competency name *</label>
            <input
              className="input w-full"
              list="competency-names"
              value={form.competencyName}
              onChange={(e) =>
                setForm((p) => ({ ...p, competencyName: e.target.value }))
              }
              placeholder="Pick or type…"
            />
            <datalist id="competency-names">
              {COMMON_COMPETENCIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <select
              className="input w-full"
              value={form.competencyType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  competencyType: e.target.value as CompetencyType,
                }))
              }
            >
              {COMPETENCY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanizeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Evaluator</label>
            <input
              className="input w-full"
              list="competency-evaluators"
              value={form.evaluatorName}
              onChange={(e) =>
                setForm((p) => ({ ...p, evaluatorName: e.target.value }))
              }
              placeholder="Who assessed this"
            />
            <datalist id="competency-evaluators">
              {employees.map((e) => <option key={e.id} value={`${e.firstName} ${e.lastName}`.trim()} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select
              className="input w-full"
              value={form.status}
              onChange={(e) =>
                setForm((p) => ({ ...p, status: e.target.value as StoredStatus }))
              }
            >
              {STORED_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Assessment date</label>
            <input
              type="date"
              className="input w-full"
              value={form.assessmentDate}
              onChange={(e) =>
                setForm((p) => ({ ...p, assessmentDate: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Valid until</label>
            <input
              type="date"
              className="input w-full"
              value={form.validUntil}
              min={form.assessmentDate || undefined}
              onChange={(e) =>
                setForm((p) => ({ ...p, validUntil: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Score (0–100)</label>
            <input
              type="number"
              min={0}
              max={100}
              className="input w-full"
              value={form.score}
              onChange={(e) =>
                setForm((p) => ({ ...p, score: e.target.value }))
              }
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              className="input min-h-[80px] w-full"
              value={form.notes}
              onChange={(e) =>
                setForm((p) => ({ ...p, notes: e.target.value }))
              }
              placeholder="Optional notes…"
            />
          </div>
          {dateOrderInvalid && (
            <p className="text-sm text-destructive sm:col-span-2">
              Valid-until date must be on or after the assessment date.
            </p>
          )}
          {scoreInvalid && (
            <p className="text-sm text-destructive sm:col-span-2">
              Score must be between 0 and 100.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => onSave(form)} disabled={!valid || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- page ------------------------------ */

export default function CompetencyTrackerPage() {
  const { profile, user } = useAuth();
  const defaultEvaluator = profile?.fullName ?? user?.fullName ?? "";

  const { data, isLoading, isError, refetch } =
    useCollection("competencyRecords");
  const employeesQ = useCollection("employees");
  const createMut = useCreate("competencyRecords");
  const updateMut = useUpdate("competencyRecords");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<DisplayStatus | "all">("all");
  const [filterType, setFilterType] = useState<CompetencyType | "all">("all");
  const [editing, setEditing] = useState<CompetencyRecord | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const records = useMemo(() => data ?? [], [data]);
  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter((r) => {
      if (filterStatus !== "all" && displayStatus(r) !== filterStatus)
        return false;
      if (filterType !== "all" && r.competencyType !== filterType) return false;
      if (
        q &&
        !r.competencyName.toLowerCase().includes(q) &&
        !r.employeeName.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [records, search, filterStatus, filterType]);

  const { sorted, sort, toggle } = useSort(filtered, {
    employee: (r) => r.employeeName,
    competency: (r) => r.competencyName,
    type: (r) => r.competencyType,
    evaluator: (r) => r.evaluatorName,
    assessment: (r) => r.assessmentDate,
    validUntil: (r) => r.validUntil,
    score: (r) => r.score,
    status: (r) => STATUS_LABEL[displayStatus(r)],
  });

  // Context: expired/pending warnings only count current staff. CompetencyRecord
  // links via employeeId (employees.id) — resolve through the directory.
  const activeEmployeeIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) if (e.employmentStatus === "active" || e.employmentStatus === "on_leave") set.add(e.id);
    return set;
  }, [employees]);
  const holderIdx = useMemo(() => buildHolderIndex(employees), [employees]);
  const isCurrentStaff = useMemo(() => (r: CompetencyRecord) =>
    r.employeeId ? activeEmployeeIds.has(r.employeeId) : holderIsActive({ employeeName: r.employeeName }, holderIdx),
  [activeEmployeeIds, holderIdx]);

  const stats = useMemo(() => {
    let total = 0;
    let passed = 0;
    let pending = 0;
    let expired = 0;
    for (const r of records) {
      total++;
      const st = displayStatus(r);
      if (st === "passed") passed++;
      if (st === "pending" && isCurrentStaff(r)) pending++;
      if (st === "expired" && isCurrentStaff(r)) expired++;
    }
    return { total, passed, pending, expired };
  }, [records, isCurrentStaff]);

  async function handleSave(form: FormState) {
    const scoreNum = form.score.trim() === "" ? null : Number(form.score);

    // Validate score 0-100 when provided.
    if (scoreNum !== null && (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100)) {
      toast.error("Score must be between 0 and 100.");
      return;
    }
    // Validate validUntil >= assessmentDate.
    if (
      form.assessmentDate &&
      form.validUntil &&
      dateOnlyMs(form.validUntil)! < dateOnlyMs(form.assessmentDate)!
    ) {
      toast.error("Valid-until date must be on or after the assessment date.");
      return;
    }

    // Non-blocking duplicate warning on add.
    if (editing === "new") {
      const dup = records.some(
        (r) =>
          (form.employeeId && r.employeeId === form.employeeId) ||
          (r.employeeName.trim().toLowerCase() ===
            form.employeeName.trim().toLowerCase()),
      ) &&
      records.some(
        (r) =>
          r.competencyName.trim().toLowerCase() ===
            form.competencyName.trim().toLowerCase() &&
          ((form.employeeId && r.employeeId === form.employeeId) ||
            r.employeeName.trim().toLowerCase() ===
              form.employeeName.trim().toLowerCase()),
      );
      if (dup) {
        toast.warning(
          `${form.employeeName} already has a "${form.competencyName.trim()}" record.`,
        );
      }
    }

    setSaving(true);
    try {
      const payload = {
        employeeId: form.employeeId || null,
        employeeName: form.employeeName.trim(),
        competencyName: form.competencyName.trim(),
        competencyType: form.competencyType,
        evaluatorName: form.evaluatorName.trim() || undefined,
        assessmentDate: form.assessmentDate || null,
        validUntil: form.validUntil || null,
        score: scoreNum,
        status: form.status,
        notes: form.notes.trim() || undefined,
      };

      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Competency updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Competency added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save competency");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Competency Tracker" />
        <ErrorState
          message="We couldn't load competency data."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const STATUS_FILTERS = [
    "all",
    "pending",
    "evaluated",
    "passed",
    "failed",
    "expired",
  ] as const;

  return (
    <div className="space-y-6">
      {editing && (
        <CompetencyDialog
          initial={editing === "new" ? undefined : editing}
          employees={employees}
          defaultEvaluator={defaultEvaluator}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Competency Tracker"
        description="Track staff competency assessments and validations. Expired status is derived live from validity dates — stored status is never mutated on read."
        actions={
          <div className="flex flex-wrap gap-2">
            <DuplicateFinder
              items={records}
              collection="competencyRecords"
              keyOf={(r) => {
                const k = dupNorm(r.competencyName);
                return k ? `${dupNorm(r.employeeName)}::${k}` : null;
              }}
              describe={(r) => ({ title: r.competencyName, subtitle: r.employeeName })}
              score={(r) => (r.score != null ? 1 : 0) + (r.validUntil ? 1 : 0)}
            />
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add competency
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} icon={Award} loading={isLoading} />
        <StatCard label="Passed" value={stats.passed} icon={Award} tone="success" loading={isLoading} />
        <StatCard label="Pending evaluation" value={stats.pending} icon={Award} tone="warning" loading={isLoading} />
        <StatCard label="Expired" value={stats.expired} icon={Award} tone="destructive" loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="input w-full pl-9"
                  placeholder="Search competency or employee…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="input w-auto"
                value={filterType}
                onChange={(e) =>
                  setFilterType(e.target.value as CompetencyType | "all")
                }
              >
                <option value="all">All types</option>
                {COMPETENCY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanizeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    filterStatus === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {s === "all" ? "All" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Award}
              title="No competencies found"
              description={
                search || filterStatus !== "all" || filterType !== "all"
                  ? "Try adjusting your search or filters."
                  : "Add your first competency assessment to start tracking."
              }
              action={
                <Button onClick={() => setEditing("new")}>
                  <Plus className="size-4" /> Add competency
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Employee" sortKey="employee" sort={sort} onToggle={toggle} />
                    <SortHeader label="Competency" sortKey="competency" sort={sort} onToggle={toggle} />
                    <SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortHeader label="Evaluator" sortKey="evaluator" sort={sort} onToggle={toggle} />
                    <SortHeader label="Assessment" sortKey="assessment" sort={sort} onToggle={toggle} />
                    <SortHeader label="Valid until" sortKey="validUntil" sort={sort} onToggle={toggle} />
                    <SortHeader label="Score" sortKey="score" sort={sort} onToggle={toggle} className="text-right" align="right" />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const st = displayStatus(r);
                    const isExpiredRow = st === "expired";
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-border/50 hover:bg-secondary/20"
                      >
                        <td data-label="Employee" className="py-3 pr-4 font-medium">
                          <PersonLink userId={null} name={r.employeeName} />
                        </td>
                        <td data-label="Competency" className="py-3 pr-4">{r.competencyName}</td>
                        <td data-label="Type" className="py-3 pr-4 capitalize">{humanizeLabel(r.competencyType)}</td>
                        <td data-label="Evaluator" className="py-3 pr-4 text-muted-foreground">
                          {r.evaluatorName || "—"}
                        </td>
                        <td data-label="Assessment" className="py-3 pr-4 text-muted-foreground">
                          {r.assessmentDate ? formatDate(r.assessmentDate) : "—"}
                        </td>
                        <td data-label="Valid until" className="py-3 pr-4">
                          {r.validUntil ? (
                            <span className={isExpiredRow ? "text-destructive font-medium" : ""}>
                              {formatDate(r.validUntil)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td data-label="Score" className="py-3 pr-4 text-right tabular-nums">
                          {r.score != null ? r.score : "—"}
                        </td>
                        <td data-label="Status" className="py-3 pr-4">
                          <button type="button" onClick={() => setEditing(r)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                            <Badge variant={STATUS_VARIANT[st]}>
                              {STATUS_LABEL[st]}
                            </Badge>
                          </button>
                        </td>
                        <td data-label="" className="py-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(r)}
                          >
                            Edit
                          </Button>
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
