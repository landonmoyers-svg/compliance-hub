"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PersonRecordsPanel } from "@/components/shared/person-records-panel";
import { cn } from "@/lib/cn";

/**
 * A clickable person name that opens a modal with all of that person's linked
 * compliance records (credentials, forms, documents, competencies…). The direct
 * "link to the employee/contractor" for any table row. Falls back to plain text
 * when there is no name.
 */
export function PersonLink({ userId = null, name, className }: { userId?: string | null; name?: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const label = (name ?? "").trim();
  if (!label) return <span className="text-muted-foreground">—</span>;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("text-left text-primary hover:underline", className)}>
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card text-foreground shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold">{label}</h2>
                <p className="text-xs text-muted-foreground">All linked compliance records</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <PersonRecordsPanel userId={userId} name={label} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
