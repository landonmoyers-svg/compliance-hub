"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useResolvedNav } from "@/lib/use-resolved-nav";
import { cn } from "@/lib/cn";

/**
 * Jane-style section navigation: the pages that belong to the section chosen in
 * the top bar, rendered as a hairline-bordered white list with a soft mint
 * "current page" state — the same shape as Jane's Settings and Reports rails.
 */
export function JaneSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { activeGroup: active } = useResolvedNav();

  if (!active) return null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <p className="px-1 text-2xl font-bold tracking-tight text-foreground">{active.label}</p>

      <nav className="overflow-hidden rounded-lg border border-sidebar-border">
        {active.items.map((item, i) => {
          const isActive = pathname === item.href
            || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              data-guide={item.href}
              className={cn(
                "flex items-center gap-2.5 px-4 py-3 text-[15px] transition-colors",
                i > 0 && "border-t border-sidebar-border",
                isActive
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-secondary",
              )}
            >
              {Icon && <Icon className={cn("size-4 shrink-0", isActive ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
