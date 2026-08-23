"use client";

import { cn } from "@/lib/cn";

/**
 * Secondary navigation, in Jane's shape.
 *
 * Jane's left rail is a stack of grouped lists: a plain grey section heading,
 * then items in a bordered white block, with the selected one washed in soft
 * mint. It reads as a table of contents rather than a menu, which is why it
 * scales to the twenty-odd entries a Reports or Settings page needs.
 *
 * Presentational only — callers own the routing — so the same component serves
 * links, filters and category pickers.
 */

export interface SideNavItem {
  key: string;
  label: string;
  /** Right-aligned count, as on Jane's Billing rail. */
  badge?: number | string;
  onSelect?: () => void;
  href?: string;
}

export interface SideNavGroup {
  /** Omit for an ungrouped block at the top of the rail. */
  heading?: string;
  items: SideNavItem[];
}

export function SideNav({
  groups,
  activeKey,
  search,
}: {
  groups: SideNavGroup[];
  activeKey?: string;
  /** Renders Jane's search field above the rail. */
  search?: { placeholder: string; value: string; onChange: (v: string) => void };
}) {
  return (
    <aside className="w-60 shrink-0 px-4 py-5">
      {search ? (
        <label className="mb-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </label>
      ) : null}

      {groups.map((group, groupIndex) => (
        <div key={group.heading ?? groupIndex} className={groupIndex > 0 ? "mt-6" : ""}>
          {group.heading ? (
            <h2 className="mb-2 px-1 text-lg font-normal text-muted">{group.heading}</h2>
          ) : null}

          {/* One bordered block with hairline dividers, rather than separate
              cards — this is what gives Jane's rail its list-like density. */}
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            {group.items.map((item) => {
              const active = item.key === activeKey;
              const Tag = item.href ? "a" : "button";
              return (
                <Tag
                  key={item.key}
                  {...(item.href ? { href: item.href } : { type: "button" as const })}
                  onClick={item.onSelect}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 border-b border-border px-4 py-3 text-left text-sm transition-colors last:border-b-0",
                    active ? "bg-accent-soft font-medium text-foreground" : "hover:bg-surface-2",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined ? (
                    <span className="shrink-0 rounded-full bg-muted/80 px-2 py-0.5 text-xs font-medium text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </Tag>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
