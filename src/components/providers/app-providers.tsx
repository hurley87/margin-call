"use client";

import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { WalletProviders } from "@/components/wallet/wallet-providers";

/**
 * App-wide providers for Convex + optional Dynamic wallet.
 * Shell and pages SSR; Dynamic mounts after hydration when configured.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID) {
    return <ConvexClientProvider>{children}</ConvexClientProvider>;
  }

  return (
    <ConvexClientProvider>
      <WalletProviders>{children}</WalletProviders>
    </ConvexClientProvider>
  );
}
