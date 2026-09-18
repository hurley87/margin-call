"use client";

import {
  createDynamicClient,
  initializeClient,
} from "@dynamic-labs-sdk/client";
import { addEvmExtension } from "@dynamic-labs-sdk/evm";
import { DynamicProvider } from "@dynamic-labs-sdk/react-hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { PositionWorkspace } from "@/components/workspace/position-workspace";

// Loaded only through the ssr:false boundary in wallet-connect-control.tsx.
// Module scope touches the Dynamic SDK, which requires a browser.
const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
if (!environmentId) {
  throw new Error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not configured");
}

const client = createDynamicClient({
  autoInitialize: false,
  environmentId,
  metadata: {
    name: "Margin Call",
    universalLink:
      typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  },
});
addEvmExtension();

if (typeof window !== "undefined") {
  void initializeClient();
}

/** Browser-only Dynamic + React Query tree wrapping the Base workspace. */
export function WalletConnectIsland() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <DynamicProvider client={client}>
        <ConvexClientProvider>
          <PositionWorkspace />
        </ConvexClientProvider>
      </DynamicProvider>
    </QueryClientProvider>
  );
}
