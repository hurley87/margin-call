"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig, http } from "wagmi";
import { NetworkGuard } from "@/components/providers/network-guard";
import { getActiveNetwork } from "@/lib/network";
import { PAYMENT_CHAIN, privyConfig } from "@/lib/privy/config";
import { ConvexClientProvider } from "@/components/providers/convex-provider";

/**
 * Browser wagmi transport URL. Prefers the public env key; falls back to the
 * network's documented public RPC so Next.js prerender can import this module
 * without Convex/server RPC secrets. Server financial paths still use
 * `requireRpcUrl` (fail closed).
 */
function wagmiRpcUrl(): string {
  const network = getActiveNetwork();
  const fromPublic = network.rpc.publicEnvKey
    ? process.env[network.rpc.publicEnvKey]?.trim()
    : undefined;
  return fromPublic || network.publicRpcUrl;
}

const wagmiConfig = createConfig({
  chains: [PAYMENT_CHAIN],
  transports: {
    [PAYMENT_CHAIN.id]: http(wagmiRpcUrl()),
  },
});

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const [queryClient] = useState(() => new QueryClient());

  if (!appId) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <BasePrivyProvider appId={appId} config={privyConfig}>
          <ConvexClientProvider>
            <NetworkGuard />
            {children}
          </ConvexClientProvider>
        </BasePrivyProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
