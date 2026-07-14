"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRemove } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import type { CollectionName } from "@/lib/data/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Admin-only delete for a single record. Renders nothing for non-admins.
 * The record's actual name/title is deleted server-side under a DB trigger
 * that writes the deletion (with the human-readable label) to the audit log,
 * so the audit trail clearly shows what was removed and by whom.
 */
export function AdminDeleteButton<K extends CollectionName>({
  collection,
  id,
  label,
  noun = "record",
  onDeleted,
}: {
  collection: K;
  id: string;
  /** Human-readable name of the record, shown in the confirm dialog. */
  label: string;
  /** What kind of thing this is, e.g. "document", "credential". */
  noun?: string;
  onDeleted?: () => void;
}) {
  const { isAdmin } = useAuth();
  const removeMut = useRemove(collection);
  const [confirming, setConfirming] = useState(false);

  if (!isAdmin) return null;

  async function handleDelete() {
    try {
      await removeMut.mutateAsync(id);
      toast.success(`Deleted "${label}". Recorded in the audit log.`);
      setConfirming(false);
      onDeleted?.();
    } catch {
      toast.error("Failed to delete. Please try again.");
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${noun}`}
        title={`Delete ${noun} (admin)`}
      >
        <Trash2 className="size-4" />
      </Button>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && !removeMut.isPending && setConfirming(false)}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold text-destructive">Delete {noun}?</h2>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <p>
                You are about to permanently delete{" "}
                <span className="font-medium text-foreground">“{label}”</span>. This cannot be undone.
              </p>
              <p className="text-muted-foreground">
                This deletion is recorded in the audit log — showing the {noun} name, your account, and
                the time.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={removeMut.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                disabled={removeMut.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {removeMut.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
