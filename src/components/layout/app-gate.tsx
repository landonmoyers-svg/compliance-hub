"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";
import { AppShell } from "@/components/layout/app-shell";
import { Landing } from "@/components/auth/landing";
import { Onboarding } from "@/components/auth/onboarding";
import { LoadingScreen } from "@/components/layout/loading-screen";

/**
 * Auth gate for the entire app, mounted once in the root layout. Mirrors the
 * source app's router: the state machine decides whether to show the loader,
 * the public landing page, onboarding, or the full authenticated shell.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") return <LoadingScreen />;
  if (status === "unauthenticated" || status === "error") return <Landing />;
  if (status === "no_profile") return <Onboarding />;
  return <AppShell>{children}</AppShell>;
}
