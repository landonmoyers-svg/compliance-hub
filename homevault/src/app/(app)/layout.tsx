import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui";
import { VaultProvider } from "@/lib/vault/provider";
import { VaultLockBadge } from "@/components/vault-lock";
import { SignOutButton } from "@/components/sign-out-button";
import { isSupabaseBackend } from "@/lib/data/client";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabaseBacked = isSupabaseBackend();

  // Gate the authenticated shell. The proxy only keeps cookies fresh; this is
  // a real check, and the data layer checks again next to the query itself.
  const user = supabaseBacked ? await getCurrentUser() : null;
  if (supabaseBacked && !user) redirect("/signin");

  return (
    <VaultProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1">
          <header className="flex items-center justify-between border-b border-border bg-surface/60 px-6 py-3 backdrop-blur">
            <div className="text-sm text-muted">
              Household: <span className="text-foreground">{user?.email ?? "The Rivera household"}</span>
            </div>
            <div className="flex items-center gap-2">
              <VaultLockBadge />
              {supabaseBacked ? <SignOutButton /> : <Badge tone="accent">demo mode · no live backend</Badge>}
            </div>
          </header>
          <main className="px-6 py-6">{children}</main>
        </div>
      </div>
    </VaultProvider>
  );
}
