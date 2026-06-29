import type { ReactNode } from "react";

/**
 * Inert passthrough. The auth gate + shell now live in the root layout
 * (`AppGate`), so this route group carries no behavior. Kept only because the
 * folder can't be removed in this environment; safe to delete later.
 */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
