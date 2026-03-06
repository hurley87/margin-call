"use client";

import { useState } from "react";
import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { privyConfig } from "@/lib/privy/config";

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      })
  );

  if (!appId) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return (
    <BasePrivyProvider appId={appId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </BasePrivyProvider>
  );
}
