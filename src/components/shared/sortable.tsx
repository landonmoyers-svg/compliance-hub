"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type SortDir = "asc" | "desc";
export interface SortState { key: string; dir: SortDir }

/**
 * Column sorting for a list table. Pass the rows and a map of column key →
 * accessor. `sorted` is the rows in the current order (unchanged until a header
 * is clicked); `toggle(key)` cycles asc → desc → unsorted. Empty values always
 * sort last regardless of direction.
 */
export function useSort<T>(
  rows: T[],
  accessors: Record<string, (r: T) => string | number | null | undefined>,
  initial: SortState | null = null,
) {
  const [sort, setSort] = useState<SortState | null>(initial);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const acc = accessors[sort.key];
    if (!acc) return rows;
    const mul = sort.dir === "asc" ? 1 : -1;
    const empty = (v: unknown) => v === null || v === undefined || v === "";
    return [...rows].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      if (empty(va) && empty(vb)) return 0;
      if (empty(va)) return 1;
      if (empty(vb)) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * mul;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  function toggle(key: string) {
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  return { sorted, sort, toggle };
}

/** A sortable <th>. Drop into a table header in place of a plain <th>. */
export function SortHeader({ label, sortKey, sort, onToggle, className, align = "left" }: {
  label: string;
  sortKey: string;
  sort: SortState | null;
  onToggle: (key: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("pb-2 pr-4 font-medium", className)}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", align === "right" && "flex-row-reverse", active && "text-foreground")}
      >
        {label}
        <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}
