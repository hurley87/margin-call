"use client";

import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { WalletProviders } from "@/components/wallet/wallet-providers";

/**
 * App-wide providers for Convex + wallet session.
 * Shell and pages SSR; Dynamic mounts after hydration when configured.
 * Missing DYNAMIC env still wraps WalletProviders (publishes unset session).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConvexClientProvider>
      <WalletProviders>{children}</WalletProviders>
    </ConvexClientProvider>
  );
}
