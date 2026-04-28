"use client";

import { useState } from "react";
import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base, baseSepolia } from "viem/chains";
import { http } from "wagmi";
import { BaseNetworkGuard } from "@/components/providers/base-network-guard";
import { baseSepoliaRpcUrl } from "@/lib/contracts/client";
import { privyConfig } from "@/lib/privy/config";
import {
  ConvexClientProvider,
  ConvexUnauthProvider,
} from "@/components/providers/convex-provider";

const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  transports: {
    [baseSepolia.id]: http(baseSepoliaRpcUrl),
    [base.id]: http(),
  },
});

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
    // No Privy app ID (e.g. build-time env, local dev without .env.local).
    // Still wrap with ConvexUnauthProvider so Convex hooks return loading
    // state instead of throwing "Could not find Convex client".
    return (
      <QueryClientProvider client={queryClient}>
        <ConvexUnauthProvider>{children}</ConvexUnauthProvider>
      </QueryClientProvider>
    );
  }

  return (
    <BasePrivyProvider appId={appId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <ConvexClientProvider>
            <BaseNetworkGuard />
            {children}
          </ConvexClientProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </BasePrivyProvider>
  );
}
