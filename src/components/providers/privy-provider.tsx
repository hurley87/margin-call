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
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000 },
        },
      })
  );

  if (!appId) {
    return <>{children}</>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BasePrivyProvider appId={appId} config={privyConfig}>
        <WagmiProvider config={wagmiConfig}>
          <ConvexClientProvider>
            <BaseNetworkGuard />
            {children}
          </ConvexClientProvider>
        </WagmiProvider>
      </BasePrivyProvider>
    </QueryClientProvider>
  );
}
