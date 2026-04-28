"use client";

import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
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

  if (!appId) {
    return <>{children}</>;
  }

  return (
    <BasePrivyProvider appId={appId} config={privyConfig}>
      <WagmiProvider config={wagmiConfig}>
        <ConvexClientProvider>
          <BaseNetworkGuard />
          {children}
        </ConvexClientProvider>
      </WagmiProvider>
    </BasePrivyProvider>
  );
}
