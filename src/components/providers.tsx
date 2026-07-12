"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/context";
import { ThemeProvider, useTheme } from "@/components/theme-provider";

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="top-right" richColors closeButton />;
}

/**
 * Client-side provider stack: React Query (data fetching/cache),
 * the mock Auth context, and the toast portal. Mounted once from the
 * root server layout so the static shell stays server-rendered.
 */
export function Providers({ children }: { children: ReactNode }) {
  // useState keeps a single QueryClient instance across re-renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Retry transient failures (e.g. a brief Supabase blip) with backoff
            // so a page self-heals instead of getting stuck on "Try again".
            retry: 3,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
        <ThemedToaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
