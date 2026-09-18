"use client";

import { createDynamicClient } from "@dynamic-labs-sdk/client";
import { addEvmExtension } from "@dynamic-labs-sdk/evm";
import { DynamicProvider } from "@dynamic-labs-sdk/react-hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletConnectUi } from "@/components/wallet/wallet-connect-ui";

// Loaded only through the ssr:false boundary in wallet-connect-control.tsx.
// Module scope touches the Dynamic SDK, which requires a browser.
const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
if (!environmentId) {
  throw new Error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not configured");
}

const client = createDynamicClient({
  environmentId,
  metadata: { name: "Margin Call" },
});
addEvmExtension(client);

const queryClient = new QueryClient();

/** Browser-only Dynamic + React Query tree for the landing wallet control. */
export function WalletConnectIsland() {
  return (
    <QueryClientProvider client={queryClient}>
      <DynamicProvider client={client}>
        <WalletConnectUi />
      </DynamicProvider>
    </QueryClientProvider>
  );
}
