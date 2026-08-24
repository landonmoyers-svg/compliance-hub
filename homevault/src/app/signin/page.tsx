import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { isSupabaseBackend } from "@/lib/data/client";
import { getCurrentUser } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  // In demo mode there is no backend to sign in to, and pretending otherwise
  // would be misleading. Say so instead of showing a form that cannot work.
  if (!isSupabaseBackend()) {
    return (
      <main className="px-6 py-16">
        <Card className="mx-auto max-w-md p-6">
          <h1 className="text-lg font-semibold">No sign-in needed</h1>
          <p className="mt-2 text-sm text-muted">
            HomeVault is running in demo mode with no backend, so there is no account to sign in to. The demo
            vault lives entirely in this browser.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-accent hover:underline">
            Go to the demo →
          </Link>
        </Card>
      </main>
    );
  }

  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="px-6 py-16">
      <SignInForm />
    </main>
  );
}
