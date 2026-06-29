"use client";

import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shown when a user is authenticated but has no ComplianceUserProfile yet.
 * Placeholder for the full multi-step profile flow; wired to refreshProfile so
 * the state machine advances to `ready` once a profile exists.
 */
export function Onboarding() {
  const { refreshProfile } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/15">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <CardTitle>Finish setting up your profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            We need a few details — your role and department — before you can
            access the workspace.
          </p>
          <Button className="w-full" onClick={() => void refreshProfile()}>
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
