"use client";

import { useState, useMemo } from "react";
import { Package, Plus, Search } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import type { InventoryItem } from "@/lib/data/schema";
import { toast } from "sonner";

const STATUS_VARIANT = {
  active: "success",
  broken: "destructive",
  removed: "secondary",
} as const;

const CONDITION_VARIANT = {
  new: "success",
  good: "success",
  fair: "warning",
  poor: "destructive",
} as const;

/* ----------------------------- dialog ------------------------------- */

interface ItemForm {
  itemName: string;
  itemType: string;
  status: InventoryItem["status"];
  condition: InventoryItem["condition"];
}

const EMPTY: ItemForm = {
  itemName: "",
  itemType: "equipment",
  status: "active",
  condition: "good",
};

function ItemDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: InventoryItem;
  onClose: () => void;
  onSave: (data: ItemForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ItemForm>(
    initial
      ? {
          itemName: initial.itemName,
          itemType: initial.itemType,
          status: initial.status,
          condition: initial.condition,
        }
      : EMPTY,
  );

  const set =
    (k: keyof ItemForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit item" : "Add inventory item"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Item name *</label>
            <input className="input w-full" value={form.itemName} onChange={set("itemName")} placeholder="e.g. Blood Pressure Monitor" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <input className="input w-full" value={form.itemType} onChange={set("itemType")} placeholder="equipment, supply, furniture…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select className="input w-full" value={form.status} onChange={set("status")}>
                <option value="active">Active</option>
                <option value="broken">Broken</option>
                <option value="removed">Removed</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Condition</label>
              <select className="input w-full" value={form.condition} onChange={set("condition")}>
                <option value="new">New</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.itemName.trim() || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function InventoryPage() {
  const { data, isLoading, isError, refetch } = useCollection("inventory");
  const createMut = useCreate("inventory");
  const updateMut = useUpdate("inventory");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<InventoryItem["status"] | "all">("all");
  const [editing, setEditing] = useState<InventoryItem | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const items = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => {
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (q && !i.itemName.toLowerCase().includes(q) && !i.itemType.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, filterStatus]);

  const stats = useMemo(() => ({
    active: items.filter((i) => i.status === "active").length,
    broken: items.filter((i) => i.status === "broken").length,
    removed: items.filter((i) => i.status === "removed").length,
  }), [items]);

  async function handleSave(form: ItemForm) {
    setSaving(true);
    try {
      const payload = {
        itemName: form.itemName.trim(),
        itemType: form.itemType.trim() || "equipment",
        status: form.status,
        condition: form.condition,
        removedFromInventory: form.status === "removed",
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Item updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Item added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Inventory" />
        <ErrorState message="We couldn't load inventory." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <ItemDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Inventory"
        description="Track assets, equipment, and supplies across all locations."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add item
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active" value={stats.active} icon={Package} tone="success" loading={isLoading} />
        <StatCard label="Broken" value={stats.broken} icon={Package} tone={stats.broken ? "destructive" : "default"} loading={isLoading} />
        <StatCard label="Removed" value={stats.removed} icon={Package} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(["all", "active", "broken", "removed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {s}
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
              icon={Package}
              title="No items found"
              description={search || filterStatus !== "all" ? "Try adjusting your filter." : "Add your first inventory item."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add item</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Condition</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => (
                    <tr key={i.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-3 pr-4 font-medium">{i.itemName}</td>
                      <td className="py-3 pr-4 capitalize text-muted-foreground">{i.itemType}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={CONDITION_VARIANT[i.condition]} className="capitalize">{i.condition}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={STATUS_VARIANT[i.status]} className="capitalize">{i.status}</Badge>
                      </td>
                      <td className="py-3">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>Edit</Button>
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
