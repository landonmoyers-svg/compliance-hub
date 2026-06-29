"use client";

import { useState, useMemo } from "react";
import { FolderSync, CheckCircle2, AlertCircle, Circle, ChevronRight } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// Document migration is the process of auditing existing documents,
// identifying which are in the SOP Library vs. still on shared drives,
// and getting them fully migrated with proper metadata.

interface MigrationItem {
  id: string;
  title: string;
  currentLocation: string;
  docType: string;
  status: "not_started" | "in_progress" | "migrated" | "skipped";
  priority: "high" | "medium" | "low";
  inLibrary: boolean;
}

const MIGRATION_ITEMS: MigrationItem[] = [
  { id: "m1", title: "HIPAA Privacy Policy", currentLocation: "Shared Drive / Policies", docType: "Policy", status: "migrated", priority: "high", inLibrary: true },
  { id: "m2", title: "Employee Handbook", currentLocation: "Shared Drive / HR", docType: "Reference", status: "migrated", priority: "high", inLibrary: true },
  { id: "m3", title: "Medication Administration Procedure", currentLocation: "Shared Drive / Clinical SOPs", docType: "SOP", status: "in_progress", priority: "high", inLibrary: false },
  { id: "m4", title: "Emergency Action Plan", currentLocation: "Shared Drive / Safety", docType: "Plan", status: "not_started", priority: "high", inLibrary: false },
  { id: "m5", title: "OSHA Hazard Communication Program", currentLocation: "Paper binder — front desk", docType: "Program", status: "not_started", priority: "high", inLibrary: false },
  { id: "m6", title: "Infection Control Procedures", currentLocation: "Shared Drive / Clinical SOPs", docType: "SOP", status: "not_started", priority: "medium", inLibrary: false },
  { id: "m7", title: "Telehealth Consent Form", currentLocation: "Shared Drive / Forms", docType: "Form", status: "not_started", priority: "medium", inLibrary: false },
  { id: "m8", title: "Incident Reporting Procedure", currentLocation: "Old compliance software", docType: "SOP", status: "not_started", priority: "medium", inLibrary: false },
  { id: "m9", title: "Staff Meeting Minutes (2024)", currentLocation: "Email archive", docType: "Reference", status: "skipped", priority: "low", inLibrary: false },
  { id: "m10", title: "DEA Registration Certificate", currentLocation: "Physical file — Dr. office", docType: "Certificate", status: "not_started", priority: "high", inLibrary: false },
];

const STATUS_ICON = {
  not_started: <Circle className="size-4 text-muted-foreground" />,
  in_progress: <AlertCircle className="size-4 text-warning" />,
  migrated: <CheckCircle2 className="size-4 text-success" />,
  skipped: <Circle className="size-4 text-muted-foreground/40" />,
};

const STATUS_VARIANT: Record<MigrationItem["status"], "secondary" | "warning" | "success" | "default"> = {
  not_started: "secondary",
  in_progress: "warning",
  migrated: "success",
  skipped: "default",
};

const PRIORITY_VARIANT: Record<MigrationItem["priority"], "destructive" | "warning" | "secondary"> = {
  high: "destructive",
  medium: "warning",
  low: "secondary",
};

export default function DocumentMigrationPage() {
  const docsQ = useCollection("documents");
  const [items, setItems] = useState(MIGRATION_ITEMS);
  const [filter, setFilter] = useState<"all" | MigrationItem["status"]>("all");

  const docs = docsQ.data ?? [];

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );

  const stats = useMemo(() => ({
    total: items.length,
    migrated: items.filter((i) => i.status === "migrated").length,
    inProgress: items.filter((i) => i.status === "in_progress").length,
    notStarted: items.filter((i) => i.status === "not_started").length,
  }), [items]);

  const pct = Math.round((stats.migrated / stats.total) * 100);

  function advance(id: string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const next: Record<MigrationItem["status"], MigrationItem["status"]> = {
          not_started: "in_progress",
          in_progress: "migrated",
          migrated: "migrated",
          skipped: "not_started",
        };
        const newStatus = next[i.status];
        if (newStatus === "migrated") toast.success(`"${i.title}" marked as migrated`);
        return { ...i, status: newStatus };
      }),
    );
  }

  function skip(id: string) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: "skipped" } : i));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Migration"
        description="Track the migration of existing documents from shared drives, paper binders, and legacy systems into the SOP Library."
      />

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FolderSync className="size-4 text-primary" />
              <span className="font-medium">Migration progress</span>
            </div>
            <span className="text-sm text-muted-foreground">{stats.migrated} / {stats.total} documents</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span className="text-success">{stats.migrated} migrated</span>
            <span className="text-warning">{stats.inProgress} in progress</span>
            <span>{stats.notStarted} not started</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["all", "not_started", "in_progress", "migrated", "skipped"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">{docs.length} docs already in library</div>
      </div>

      {docsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} className={`flex items-center gap-4 rounded-lg border border-border p-4 ${item.status === "skipped" ? "opacity-50" : ""}`}>
              {STATUS_ICON[item.status]}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{item.title}</p>
                  <Badge variant={STATUS_VARIANT[item.status]} className="capitalize text-xs">
                    {item.status.replace("_", " ")}
                  </Badge>
                  <Badge variant={PRIORITY_VARIANT[item.priority]} className="capitalize text-xs">
                    {item.priority}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{item.docType} · Currently in: {item.currentLocation}</p>
              </div>
              {item.status !== "migrated" && item.status !== "skipped" && (
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={() => advance(item.id)}>
                    {item.status === "not_started" ? "Start" : <><CheckCircle2 className="size-3" /> Done</>}
                    <ChevronRight className="size-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => skip(item.id)}>Skip</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
