"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { AppShell } from "@/components/layout/app-shell";
import { Landing } from "@/components/auth/landing";
import { Onboarding } from "@/components/auth/onboarding";
import { LoadingScreen } from "@/components/layout/loading-screen";

export function AppGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();

  // Auth pages handle their own UI — never wrap them
  if (pathname.startsWith("/auth/")) return <>{children}</>;

  if (status === "loading") return <LoadingScreen />;
  if (status === "unauthenticated" || status === "error") return <Landing />;
  if (status === "no_profile") return <Onboarding />;
  return <AppShell>{children}</AppShell>;
}
