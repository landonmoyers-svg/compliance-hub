"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { FileLink } from "@/components/shared/file-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import type { RecordVersion } from "@/lib/data/schema";

const DATETIME = "MMM d, yyyy · h:mm a";

// Snapshot fields worth surfacing per governed entity. The snapshot is the raw
// DB row, so keys are snake_case. We show whichever of these are present.
const SUMMARY_FIELDS: { key: string; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "credential_name", label: "Credential" },
  { key: "vendor_name", label: "Vendor" },
  { key: "version", label: "Version" },
  { key: "status", label: "Status" },
  { key: "expiration_date", label: "Expires" },
  { key: "issue_date", label: "Issued" },
  { key: "credential_number", label: "Number" },
  { key: "baa_status", label: "BAA status" },
  { key: "baa_signed_date", label: "BAA signed" },
  { key: "review_date", label: "Review date" },
  { key: "access_level", label: "Access" },
];

function snapshotSummary(snapshot: Record<string, unknown>) {
  const out: { label: string; value: string }[] = [];
  for (const { key, label } of SUMMARY_FIELDS) {
    const raw = snapshot[key];
    if (raw === null || raw === undefined || raw === "") continue;
    let value = String(raw);
    if (key.endsWith("_date") || key === "expiration_date") value = formatDate(value);
    out.push({ label, value });
  }
  return out;
}

/**
 * Opens the retained version history for one governed record (document,
 * credential, vendor, employee document). History is written server-side by a
 * DB trigger and is readable only by privileged roles — so for non-privileged
 * users the query returns nothing and this button renders null.
 */
export function VersionHistoryButton({
  entityType,
  entityId,
  title,
}: {
  entityType: string;
  entityId: string;
  title?: string;
}) {
  const { data } = useCollection("recordVersions");
  const [open, setOpen] = useState(false);

  const versions = useMemo(
    () =>
      (data ?? [])
        .filter((v) => v.entityType === entityType && v.entityId === entityId)
        .sort((a, b) => b.versionNum - a.versionNum),
    [data, entityType, entityId],
  );

  if (versions.length === 0) return null;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        title="Version history"
        className="text-xs"
      >
        <History className="size-4" /> History ({versions.length})
      </Button>
      {open && (
        <VersionHistoryDialog title={title} versions={versions} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function VersionHistoryDialog({
  title,
  versions,
  onClose,
}: {
  title?: string;
  versions: RecordVersion[];
  onClose: () => void;
}) {
  // Oldest retained version's effective date == when the record first took effect.
  const originalEffective = versions[versions.length - 1]?.effectiveFrom;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Version history</h2>
            {title && <p className="text-sm text-muted-foreground">{title}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="border-b border-border bg-secondary/20 px-5 py-2 text-xs text-muted-foreground">
          Originally effective {formatDate(originalEffective, DATETIME)} ·{" "}
          {versions.length} prior version{versions.length === 1 ? "" : "s"} retained.
          The current version is shown in the record.
        </div>

        <div className="space-y-3 overflow-y-auto p-5">
          {versions.map((v) => (
            <div key={v.id} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium">Version {v.versionNum}</span>
                <Badge variant={v.changeKind === "delete" ? "destructive" : "outline"}>
                  {v.changeKind === "delete" ? "Deleted" : "Replaced"}
                </Badge>
              </div>

              <div className="text-xs text-muted-foreground">
                Effective {formatDate(v.effectiveFrom, DATETIME)} →{" "}
                {v.changeKind === "delete" ? "deleted" : "replaced"}{" "}
                {formatDate(v.supersededAt, DATETIME)}
              </div>

              {snapshotSummary(v.snapshot).length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {snapshotSummary(v.snapshot).map(({ label, value }) => (
                    <div key={label} className="flex gap-1">
                      <dt className="text-muted-foreground">{label}:</dt>
                      <dd className="truncate font-medium" title={value}>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {v.filePath && (
                <div className="mt-2">
                  <FileLink path={v.filePath} label="View this version's file" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
