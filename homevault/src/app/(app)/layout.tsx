import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui";
import { VaultProvider } from "@/lib/vault/provider";
import { VaultLockBadge } from "@/components/vault-lock";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <VaultProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1">
          <header className="flex items-center justify-between border-b border-border bg-surface/60 px-6 py-3 backdrop-blur">
            <div className="text-sm text-muted">
              Household: <span className="text-foreground">The Rivera household</span>
            </div>
            <div className="flex items-center gap-2">
              <VaultLockBadge />
              <Badge tone="accent">demo mode · no live backend</Badge>
            </div>
          </header>
          <main className="px-6 py-6">{children}</main>
        </div>
      </div>
    </VaultProvider>
  );
}
