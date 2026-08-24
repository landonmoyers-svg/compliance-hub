"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useVault } from "@/lib/vault/provider";

/**
 * Sign out of the session — and lock the vault on the way out.
 *
 * Those are genuinely separate actions (a session carries no decryption power),
 * but leaving a vault unlocked on a machine someone just signed out of would be
 * a surprising and unsafe default.
 */
export function SignOutButton() {
  const router = useRouter();
  const { lock } = useVault();

  async function signOut() {
    lock();
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/signin");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
    >
      <LogOut size={11} /> sign out
    </button>
  );
}
