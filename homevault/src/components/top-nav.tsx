"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The chrome bar.
 *
 * This is the structural heart of Jane's language and the biggest change from
 * HomeVault's old shell: primary navigation lives in a coloured bar across the
 * top, not down the side. The left sidebar is then free to be *secondary* nav —
 * report categories in Jane, vault categories here — which is what makes deep
 * sections navigable without a second row of tabs.
 *
 * Layout mirrors Jane exactly: sections on the left, brand centred, account and
 * utilities on the right.
 */

const SECTIONS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/vault", label: "Vault" },
  { href: "/handover", label: "Handover" },
  { href: "/people", label: "People" },
];

export function TopNav({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 bg-nav text-nav-foreground">
      <div className="flex items-stretch">
        {/* Sections. Jane fills the active tab with a darker step of the bar
            colour rather than underlining it. */}
        <nav className="flex items-stretch">
          {SECTIONS.map((section) => {
            const active = pathname === section.href || pathname.startsWith(section.href + "/");
            return (
              <Link
                key={section.href}
                href={section.href}
                className={cn(
                  "flex items-center px-5 text-sm transition-colors",
                  active ? "bg-nav-active font-medium" : "hover:bg-nav-active/60",
                )}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>

        {/* Brand, centred and absolutely positioned so it stays put regardless
            of how wide the nav or the account area become. */}
        <div className="pointer-events-none relative flex-1">
          <Link
            href="/"
            className="pointer-events-auto absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap"
          >
            <ShieldCheck size={18} />
            <span className="text-[15px] font-semibold tracking-tight">HomeVault</span>
          </Link>
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5 text-sm">{right}</div>
      </div>
    </header>
  );
}
