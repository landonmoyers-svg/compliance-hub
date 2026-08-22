"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderLock, Users, KeyRound, ShieldCheck, Lock } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vault", label: "Vault", icon: FolderLock },
  { href: "/handover", label: "Estate handover", icon: KeyRound },
  { href: "/people", label: "People & recipients", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2">
        <ShieldCheck className="text-accent" size={20} />
        <span className="font-semibold tracking-tight">HomeVault</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <item.icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-lg border border-border bg-surface-2 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-success">
          <Lock size={13} /> Zero-knowledge
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Secrets are encrypted on your device. The server stores ciphertext only.
        </p>
      </div>
    </aside>
  );
}
