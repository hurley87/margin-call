"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { base, baseSepolia } from "viem/chains";
import { WagmiProvider, createConfig, http } from "wagmi";
import { BaseNetworkGuard } from "@/components/providers/base-network-guard";
import { baseSepoliaRpcUrl } from "@/lib/contracts/client";
import { privyConfig } from "@/lib/privy/config";
import { ConvexClientProvider } from "@/components/providers/convex-provider";

const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  transports: {
    [baseSepolia.id]: http(baseSepoliaRpcUrl),
    [base.id]: http(),
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
