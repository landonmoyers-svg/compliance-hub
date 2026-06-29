"use client";

import { useState, useMemo } from "react";
import { FileText, Plus, X, Check, Trash2, Pencil, Archive, ClipboardList, UserPlus, PenLine } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  FillableFormTemplate,
  FormField,
  FormCategory,
  FormAssignment,
  CompletedForm,
  Employee,
} from "@/lib/data/schema";
import { formCategories } from "@/lib/data/schema";
import { toast } from "sonner";

/* ─── constants ─────────────────────────────────────────────── */

const CATEGORY_LABEL: Record<FormCategory, string> = {
  hr_onboarding: "HR Onboarding",
  hr_discipline: "HR Discipline",
  hipaa: "HIPAA",
  osha_safety: "OSHA / Safety",
  training: "Training",
  credentialing: "Credentialing",
  insurance_risk: "Insurance / Risk",
  emergency: "Emergency",
  policy_review: "Policy Review",
  other: "Other",
};

const FIELD_TYPES: FormField["type"][] = ["text", "textarea", "date", "number", "checkbox", "select"];

const TEMPLATE_STATUS_VARIANT: Record<FillableFormTemplate["status"], "success" | "secondary" | "outline"> = {
  active: "success",
  draft: "outline",
  archived: "secondary",
};

const ASSIGNMENT_STATUS_VARIANT: Record<FormAssignment["status"], "warning" | "secondary" | "success"> = {
  assigned: "warning",
  in_progress: "secondary",
  completed: "success",
};

type Tab = "templates" | "assignments" | "completed";

/** lowercase, non-alnum → underscore, trim leading/trailing underscores. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fullName(e: Employee): string {
  return `${e.firstName} ${e.lastName}`.trim();
}

/* ─── field-builder row type ────────────────────────────────── */

interface DraftField {
  label: string;
  type: FormField["type"];
  required: boolean;
  optionsText: string; // comma-separated, only used for select
}

const EMPTY_DRAFT_FIELD: DraftField = { label: "", type: "text", required: false, optionsText: "" };

interface TemplateForm {
  title: string;
  category: FormCategory;
  description: string;
  requiresSignature: boolean;
  sensitive: boolean;
  fields: DraftField[];
}

function templateToForm(t?: FillableFormTemplate): TemplateForm {
  if (!t) {
    return {
      title: "",
      category: "other",
      description: "",
      requiresSignature: false,
      sensitive: false,
      fields: [{ ...EMPTY_DRAFT_FIELD }],
    };
  }
  return {
    title: t.title,
    category: t.category,
    description: t.description ?? "",
    requiresSignature: t.requiresSignature,
    sensitive: t.sensitive,
    fields: t.fields.length
      ? t.fields.map((f) => ({ label: f.label, type: f.type, required: f.required, optionsText: f.options.join(", ") }))
      : [{ ...EMPTY_DRAFT_FIELD }],
  };
}

function buildFields(drafts: DraftField[]): FormField[] {
  return drafts
    .filter((d) => d.label.trim())
    .map((d) => ({
      key: slugify(d.label),
      label: d.label.trim(),
      type: d.type,
      required: d.required,
      options:
        d.type === "select"
          ? d.optionsText.split(",").map((o) => o.trim()).filter(Boolean)
          : [],
    }));
}

/* ─── template dialog ───────────────────────────────────────── */

function TemplateDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: FillableFormTemplate;
  onClose: () => void;
  onSave: (form: TemplateForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<TemplateForm>(() => templateToForm(initial));

  const setField = (i: number, patch: Partial<DraftField>) =>
    setForm((p) => ({ ...p, fields: p.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) }));
  const addField = () => setForm((p) => ({ ...p, fields: [...p.fields, { ...EMPTY_DRAFT_FIELD }] }));
  const removeField = (i: number) => setForm((p) => ({ ...p, fields: p.fields.filter((_, idx) => idx !== i) }));

  const canSave = form.title.trim().length > 0 && form.fields.some((f) => f.label.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit template" : "New form template"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title *</label>
              <input className="input w-full" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. HIPAA Acknowledgment" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <select className="input w-full" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as FormCategory }))}>
                {formCategories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <textarea className="input w-full" rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Brief description of this form…" />
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="size-4" checked={form.requiresSignature} onChange={(e) => setForm((p) => ({ ...p, requiresSignature: e.target.checked }))} />
              Requires signature
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="size-4" checked={form.sensitive} onChange={(e) => setForm((p) => ({ ...p, sensitive: e.target.checked }))} />
              Sensitive
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Fields</label>
              <Button size="sm" variant="outline" onClick={addField}><Plus className="size-3" /> Add field</Button>
            </div>
            {form.fields.map((f, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input className="input w-full" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Field label" />
                  <select className="input" value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormField["type"] })}>
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={() => removeField(i)} className="flex items-center justify-center rounded-md px-2 text-muted-foreground hover:text-destructive" aria-label="Remove field">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input type="checkbox" className="size-3.5" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                    Required
                  </label>
                  {f.label.trim() && (
                    <span className="text-xs text-muted-foreground">key: <code className="font-mono">{slugify(f.label) || "—"}</code></span>
                  )}
                </div>
                {f.type === "select" && (
                  <input className="input w-full" value={f.optionsText} onChange={(e) => setField(i, { optionsText: e.target.value })} placeholder="Options, comma-separated (e.g. Yes, No, N/A)" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!canSave || saving}>
            {saving ? "Saving…" : <><Check className="size-3" /> Save template</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── assign dialog ─────────────────────────────────────────── */

function AssignDialog({
  templates,
  employees,
  onClose,
  onSave,
  saving,
}: {
  templates: FillableFormTemplate[];
  employees: Employee[];
  onClose: () => void;
  onSave: (data: { templateId: string; employeeId: string; dueDate: string }) => void;
  saving: boolean;
}) {
  const [templateId, setTemplateId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [dueDate, setDueDate] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Assign form</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="grid gap-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Template *</label>
            <select className="input w-full" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Select a template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Employee *</label>
            <select className="input w-full" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select an employee…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{fullName(e)}{e.title ? ` — ${e.title}` : ""}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Due date (optional)</label>
            <input type="date" className="input w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ templateId, employeeId, dueDate })} disabled={!templateId || !employeeId || saving}>
            {saving ? "Assigning…" : <><Check className="size-3" /> Assign</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── form filler dialog ────────────────────────────────────── */

function FormFiller({
  template,
  assignment,
  signerName,
  onClose,
  onSubmit,
  saving,
}: {
  template: FillableFormTemplate;
  assignment: FormAssignment;
  signerName: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>, signature: string) => void;
  saving: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of template.fields) init[f.key] = f.type === "checkbox" ? "false" : "";
    return init;
  });
  const [signature, setSignature] = useState(signerName);

  const set = (key: string, value: string) => setValues((p) => ({ ...p, [key]: value }));

  function handleSubmit() {
    const missing = template.fields.find(
      (f) => f.required && (f.type === "checkbox" ? values[f.key] !== "true" : !(values[f.key] ?? "").trim()),
    );
    if (missing) {
      toast.error(`"${missing.label}" is required.`);
      return;
    }
    if (template.requiresSignature && !signature.trim()) {
      toast.error("Signature is required.");
      return;
    }
    onSubmit(values, signature.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">{template.title}</h2>
            <p className="text-xs text-muted-foreground">For {assignment.assignedToName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5">
          {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
          {template.fields.length === 0 && <p className="text-sm text-muted-foreground">This template has no fields.</p>}
          {template.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-sm font-medium">
                {f.label}{f.required && <span className="text-destructive"> *</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea className="input w-full" rows={3} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
              ) : f.type === "select" ? (
                <select className="input w-full" value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">Select…</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={values[f.key] === "true"} onChange={(e) => set(f.key, e.target.checked ? "true" : "false")} />
                  Yes
                </label>
              ) : (
                <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} className="input w-full" value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
              )}
            </div>
          ))}

          {template.requiresSignature && (
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <p className="mb-2 text-xs text-muted-foreground">By typing your name below you are electronically signing this form.</p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">E-signature (type full name) *</label>
                <input className="input w-full font-serif italic" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Full legal name" />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Submitting…" : <><Check className="size-3" /> Submit form</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── page ──────────────────────────────────────────────────── */

export default function FillableDocumentsPage() {
  const { profile, user } = useAuth();
  const signerName = profile?.fullName ?? user?.fullName ?? "";

  const templatesQ = useCollection("formTemplates");
  const assignmentsQ = useCollection("formAssignments");
  const completedQ = useCollection("completedForms");
  const employeesQ = useCollection("employees");

  const createTemplate = useCreate("formTemplates");
  const updateTemplate = useUpdate("formTemplates");
  const createAssignment = useCreate("formAssignments");
  const updateAssignment = useUpdate("formAssignments");
  const createCompleted = useCreate("completedForms");

  const [tab, setTab] = useState<Tab>("templates");
  const [categoryFilter, setCategoryFilter] = useState<FormCategory | "all">("all");
  const [editingTemplate, setEditingTemplate] = useState<FillableFormTemplate | null | "new">(null);
  const [showAssign, setShowAssign] = useState(false);
  const [filling, setFilling] = useState<FormAssignment | null>(null);
  const [saving, setSaving] = useState(false);

  const templates = useMemo(() => templatesQ.data ?? [], [templatesQ.data]);
  const assignments = useMemo(() => assignmentsQ.data ?? [], [assignmentsQ.data]);
  const completed = useMemo(() => completedQ.data ?? [], [completedQ.data]);
  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);

  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  const visibleTemplates = useMemo(
    () => (categoryFilter === "all" ? templates : templates.filter((t) => t.category === categoryFilter)),
    [templates, categoryFilter],
  );

  const stats = useMemo(() => ({
    total: templates.length,
    active: templates.filter((t) => t.status === "active").length,
    pending: assignments.filter((a) => a.status !== "completed").length,
    completed: completed.length,
  }), [templates, assignments, completed]);

  /* ─── handlers ──────────────────────────────────────────── */

  async function saveTemplate(form: TemplateForm) {
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim() || undefined,
        fields: buildFields(form.fields),
        requiresSignature: form.requiresSignature,
        sensitive: form.sensitive,
      };
      if (editingTemplate && editingTemplate !== "new") {
        await updateTemplate.mutateAsync({ id: editingTemplate.id, patch: payload });
        toast.success("Template updated");
      } else {
        await createTemplate.mutateAsync({ ...payload, status: "active", isDraft: false, fileUrl: null });
        toast.success("Template created");
      }
      setEditingTemplate(null);
    } catch {
      toast.error("Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveTemplate(t: FillableFormTemplate) {
    try {
      await updateTemplate.mutateAsync({ id: t.id, patch: { status: t.status === "archived" ? "active" : "archived" } });
      toast.success(t.status === "archived" ? "Template restored" : "Template archived");
    } catch {
      toast.error("Failed to update template.");
    }
  }

  async function saveAssignment(data: { templateId: string; employeeId: string; dueDate: string }) {
    const template = templateById.get(data.templateId);
    const employee = employees.find((e) => e.id === data.employeeId);
    if (!template || !employee) return;
    setSaving(true);
    try {
      await createAssignment.mutateAsync({
        templateId: template.id,
        templateTitle: template.title,
        assignedToUserId: employee.id,
        assignedToName: fullName(employee),
        status: "assigned",
        dueDate: data.dueDate || null,
        completedFormId: null,
      });
      setShowAssign(false);
      toast.success("Form assigned");
    } catch {
      toast.error("Failed to assign form.");
    } finally {
      setSaving(false);
    }
  }

  async function submitFilled(values: Record<string, string>, signature: string) {
    if (!filling) return;
    const template = templateById.get(filling.templateId);
    if (!template) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const created = await createCompleted.mutateAsync({
        templateId: filling.templateId,
        templateTitle: filling.templateTitle,
        employeeId: filling.assignedToUserId ?? null,
        employeeName: filling.assignedToName,
        fieldValues: values,
        signedByName: template.requiresSignature ? signature || undefined : undefined,
        completedAt: now,
      });
      await updateAssignment.mutateAsync({ id: filling.id, patch: { status: "completed", completedFormId: created.id } });
      setFilling(null);
      toast.success("Form completed");
    } catch {
      toast.error("Failed to submit form.");
    } finally {
      setSaving(false);
    }
  }

  /* ─── error / loading ───────────────────────────────────── */

  const isError = templatesQ.isError || assignmentsQ.isError || completedQ.isError || employeesQ.isError;
  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Fillable Documents" />
        <ErrorState
          message="We couldn't load form data."
          onRetry={() => {
            void templatesQ.refetch();
            void assignmentsQ.refetch();
            void completedQ.refetch();
            void employeesQ.refetch();
          }}
        />
      </div>
    );
  }

  const loading = templatesQ.isLoading || assignmentsQ.isLoading || completedQ.isLoading || employeesQ.isLoading;
  const fillingTemplate = filling ? templateById.get(filling.templateId) : undefined;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "templates", label: "Templates", count: templates.length },
    { id: "assignments", label: "Assignments", count: assignments.length },
    { id: "completed", label: "Completed", count: completed.length },
  ];

  return (
    <div className="space-y-6">
      {editingTemplate && (
        <TemplateDialog
          initial={editingTemplate === "new" ? undefined : editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSave={saveTemplate}
          saving={saving}
        />
      )}
      {showAssign && (
        <AssignDialog
          templates={templates.filter((t) => t.status === "active")}
          employees={employees}
          onClose={() => setShowAssign(false)}
          onSave={saveAssignment}
          saving={saving}
        />
      )}
      {filling && fillingTemplate && (
        <FormFiller
          template={fillingTemplate}
          assignment={filling}
          signerName={signerName}
          onClose={() => setFilling(null)}
          onSubmit={submitFilled}
          saving={saving}
        />
      )}

      <PageHeader
        title="Fillable Documents"
        description="Build form templates, assign them to employees, and track completed submissions."
        actions={
          tab === "templates" ? (
            <Button onClick={() => setEditingTemplate("new")}><Plus className="size-4" /> New template</Button>
          ) : tab === "assignments" ? (
            <Button onClick={() => setShowAssign(true)} disabled={templates.filter((t) => t.status === "active").length === 0 || employees.length === 0}>
              <UserPlus className="size-4" /> Assign form
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total templates" value={stats.total} icon={FileText} loading={loading} />
        <StatCard label="Active" value={stats.active} icon={FileText} tone="success" loading={loading} />
        <StatCard label="Pending assignments" value={stats.pending} icon={ClipboardList} tone={stats.pending ? "warning" : "default"} loading={loading} />
        <StatCard label="Completed forms" value={stats.completed} icon={Check} tone="success" loading={loading} />
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} <span className="text-xs text-muted-foreground">({t.count})</span>
          </button>
        ))}
      </div>

      {/* ─── TEMPLATES ─── */}
      {tab === "templates" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                categoryFilter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              All
            </button>
            {formCategories.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  categoryFilter === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
            </div>
          ) : visibleTemplates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No templates found"
              description={categoryFilter !== "all" ? "Try a different category." : "Create your first form template to get started."}
              action={<Button onClick={() => setEditingTemplate("new")}><Plus className="size-4" /> New template</Button>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleTemplates.map((t) => (
                <Card key={t.id} className={t.status === "archived" ? "opacity-60" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm leading-snug">{t.title}</CardTitle>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <Badge variant={TEMPLATE_STATUS_VARIANT[t.status]} className="capitalize">{t.status}</Badge>
                        {t.isDraft && <Badge variant="warning">DRAFT — needs review</Badge>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{CATEGORY_LABEL[t.category]}</Badge>
                      <span>{t.fields.length} field{t.fields.length === 1 ? "" : "s"}</span>
                      {t.requiresSignature && <Badge variant="secondary"><PenLine className="size-3" /> Signature</Badge>}
                      {t.sensitive && <Badge variant="destructive">Sensitive</Badge>}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingTemplate(t)}><Pencil className="size-3" /> Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => archiveTemplate(t)}>
                        <Archive className="size-3" /> {t.status === "archived" ? "Restore" : "Archive"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── ASSIGNMENTS ─── */}
      {tab === "assignments" && (
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : assignments.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No assignments yet"
                description="Assign a form template to an employee to get started."
                action={
                  <Button onClick={() => setShowAssign(true)} disabled={templates.filter((t) => t.status === "active").length === 0 || employees.length === 0}>
                    <UserPlus className="size-4" /> Assign form
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Form</th>
                      <th className="pb-2 pr-4 font-medium">Assigned to</th>
                      <th className="pb-2 pr-4 font-medium">Due</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="py-3 pr-4 font-medium">{a.templateTitle}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{a.assignedToName}</td>
                        <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{a.dueDate ?? "—"}</td>
                        <td className="py-3 pr-4"><Badge variant={ASSIGNMENT_STATUS_VARIANT[a.status]} className="capitalize">{a.status.replace("_", " ")}</Badge></td>
                        <td className="py-3 text-right">
                          {a.status !== "completed" ? (
                            <Button size="sm" onClick={() => setFilling(a)} disabled={!templateById.has(a.templateId)}>
                              <PenLine className="size-3" /> Fill out
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Done</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── COMPLETED ─── */}
      {tab === "completed" && (
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : completed.length === 0 ? (
              <EmptyState icon={Check} title="No completed forms yet" description="Completed submissions will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Form</th>
                      <th className="pb-2 pr-4 font-medium">Employee</th>
                      <th className="pb-2 pr-4 font-medium">Signed by</th>
                      <th className="pb-2 font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completed.map((c: CompletedForm) => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="py-3 pr-4 font-medium">{c.templateTitle}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{c.employeeName}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{c.signedByName ?? "—"}</td>
                        <td className="whitespace-nowrap py-3 text-muted-foreground">
                          {c.completedAt ? new Date(c.completedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
