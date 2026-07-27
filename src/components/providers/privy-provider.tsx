"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig, http } from "wagmi";
import { NetworkGuard } from "@/components/providers/network-guard";
import {
  PAYMENT_CHAIN,
  PAYMENT_PUBLIC_RPC_URL,
  privyConfig,
} from "@/lib/privy/config";
import { ConvexClientProvider } from "@/components/providers/convex-provider";

function wagmiRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL?.trim() ||
    PAYMENT_PUBLIC_RPC_URL
  );
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
