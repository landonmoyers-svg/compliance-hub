"use client";

import { useState, useMemo } from "react";
import { FlaskConical, Plus, Search } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import type { SDSRecord } from "@/lib/data/schema";
import { toast } from "sonner";

const STATUS_VARIANT = {
  active: "success",
  missing: "destructive",
  needs_review: "warning",
  archived: "secondary",
} as const;

const SIGNAL_VARIANT = {
  DANGER: "destructive",
  WARNING: "warning",
  CAUTION: "secondary",
  NONE: "outline",
} as const;

/* ----------------------------- dialog ------------------------------- */

interface SDSForm {
  productName: string;
  manufacturer: string;
  upc: string;
  signalWord: SDSRecord["signalWord"];
  status: SDSRecord["status"];
}

const EMPTY: SDSForm = {
  productName: "",
  manufacturer: "",
  upc: "",
  signalWord: "NONE",
  status: "active",
};

function SDSDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: SDSRecord;
  onClose: () => void;
  onSave: (data: SDSForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<SDSForm>(
    initial
      ? {
          productName: initial.productName,
          manufacturer: initial.manufacturer ?? "",
          upc: initial.upc ?? "",
          signalWord: initial.signalWord,
          status: initial.status,
        }
      : EMPTY,
  );

  const set =
    (k: keyof SDSForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit SDS record" : "Add SDS record"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Product name *</label>
            <input className="input w-full" value={form.productName} onChange={set("productName")} placeholder="Chemical / product name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Manufacturer</label>
            <input className="input w-full" value={form.manufacturer} onChange={set("manufacturer")} placeholder="Manufacturer name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">UPC / Product ID</label>
            <input className="input w-full" value={form.upc} onChange={set("upc")} placeholder="Barcode or product ID" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Signal word</label>
              <select className="input w-full" value={form.signalWord} onChange={set("signalWord")}>
                {(["DANGER", "WARNING", "CAUTION", "NONE"] as const).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select className="input w-full" value={form.status} onChange={set("status")}>
                <option value="active">Active</option>
                <option value="missing">Missing</option>
                <option value="needs_review">Needs review</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.productName.trim() || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function SDSLibraryPage() {
  const { data, isLoading, isError, refetch } = useCollection("sdsRecords");
  const createMut = useCreate("sdsRecords");
  const updateMut = useUpdate("sdsRecords");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<SDSRecord["status"] | "all">("all");
  const [editing, setEditing] = useState<SDSRecord | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const records = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (q && !r.productName.toLowerCase().includes(q) && !(r.manufacturer ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [records, search, filterStatus]);

  const stats = useMemo(() => ({
    active: records.filter((r) => r.status === "active").length,
    missing: records.filter((r) => r.status === "missing").length,
    needsReview: records.filter((r) => r.status === "needs_review").length,
    danger: records.filter((r) => r.signalWord === "DANGER").length,
  }), [records]);

  async function handleSave(form: SDSForm) {
    setSaving(true);
    try {
      const payload = {
        productName: form.productName.trim(),
        manufacturer: form.manufacturer.trim() || undefined,
        upc: form.upc.trim() || undefined,
        signalWord: form.signalWord,
        status: form.status,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("SDS record updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("SDS record added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save SDS record");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="SDS Library" />
        <ErrorState message="We couldn't load SDS records." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <SDSDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="SDS Library"
        description="Safety Data Sheets for all chemical and hazardous products used in your facility."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add SDS
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Active" value={stats.active} icon={FlaskConical} tone="success" loading={isLoading} />
        <StatCard label="Missing SDS" value={stats.missing} icon={FlaskConical} tone={stats.missing ? "destructive" : "default"} loading={isLoading} />
        <StatCard label="Needs review" value={stats.needsReview} icon={FlaskConical} tone={stats.needsReview ? "warning" : "default"} loading={isLoading} />
        <StatCard label="DANGER signal" value={stats.danger} icon={FlaskConical} tone={stats.danger ? "warning" : "default"} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search product or manufacturer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search SDS records"
              />
            </div>
            {(["all", "active", "missing", "needs_review", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {s === "all" ? "All" : s === "needs_review" ? "Needs review" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="No SDS records found"
              description={search || filterStatus !== "all" ? "Try adjusting your search or filter." : "Add your first SDS record to get started."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add SDS</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Product</th>
                    <th className="pb-2 pr-4 font-medium">Manufacturer</th>
                    <th className="pb-2 pr-4 font-medium">UPC / ID</th>
                    <th className="pb-2 pr-4 font-medium">Signal</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-3 pr-4 font-medium">{r.productName}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{r.manufacturer ?? "—"}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{r.upc ?? "—"}</td>
                      <td className="py-3 pr-4">
                        {r.signalWord !== "NONE" ? (
                          <Badge variant={SIGNAL_VARIANT[r.signalWord]}>{r.signalWord}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={STATUS_VARIANT[r.status]}>
                          {r.status === "needs_review" ? "Needs review" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
