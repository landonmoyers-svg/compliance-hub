import { redirect } from "next/navigation";
import { Badge } from "@/components/ui";
import { TopNav } from "@/components/top-nav";
import { VaultProvider } from "@/lib/vault/provider";
import { VaultLockBadge } from "@/components/vault-lock";
import { SignOutButton } from "@/components/sign-out-button";
import { isSupabaseBackend } from "@/lib/data/client";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * The authenticated shell, in Jane's layout: a teal chrome bar carrying primary
 * navigation and the account area, over a near-white page. The old left rail
 * held primary nav; it now belongs to whichever page needs secondary nav, which
 * is how Jane keeps deep sections navigable.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabaseBacked = isSupabaseBackend();

  // The proxy only keeps cookies fresh; this is a real check, and the data
  // layer checks again next to the query itself.
  const user = supabaseBacked ? await getCurrentUser() : null;
  if (supabaseBacked && !user) redirect("/signin");

  return (
    <VaultProvider backend={supabaseBacked ? "supabase" : "demo"}>
      <div className="min-h-screen">
        <TopNav
          right={
            <>
              {/* Jane puts the current context — clinic location — up here.
                  The household is the equivalent. */}
              <span className="hidden text-sm/none opacity-90 sm:inline">
                {user?.email ?? "The Rivera household"}
              </span>
              <VaultLockBadge />
              {supabaseBacked ? <SignOutButton /> : null}
            </>
          }
        />

        <main className="mx-auto max-w-[1400px] px-6 py-7">
          {/* Aligned with the content rather than centred across the window —
              a floating centred strip is not a shape Jane uses anywhere. */}
          {!supabaseBacked ? (
            <div className="mb-5">
              <Badge tone="accent">demo mode · no live backend</Badge>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </VaultProvider>
  );
}
