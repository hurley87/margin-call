"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig, http } from "wagmi";
import { BaseNetworkGuard } from "@/components/providers/base-network-guard";
import { baseSepoliaRpcUrl } from "@/lib/contracts/client";
import { PAYMENT_CHAIN, privyConfig } from "@/lib/privy/config";
import { ConvexClientProvider } from "@/components/providers/convex-provider";

const wagmiConfig = createConfig({
  chains: [PAYMENT_CHAIN],
  transports: {
    [PAYMENT_CHAIN.id]: http(baseSepoliaRpcUrl()),
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
            <BaseNetworkGuard />
            {children}
          </ConvexClientProvider>
        </BasePrivyProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
