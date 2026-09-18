"use client";

import {
  createDynamicClient,
  initializeClient,
  type DynamicClient,
} from "@dynamic-labs-sdk/client";
import { addEvmExtension } from "@dynamic-labs-sdk/evm";
import { DynamicProvider } from "@dynamic-labs-sdk/react-hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const DynamicReadyContext = createContext(false);

/** True once DynamicProvider is mounted (browser-only). */
export function useDynamicReady(): boolean {
  return useContext(DynamicReadyContext);
}

let dynamicClient: DynamicClient | null = null;
let evmExtensionAdded = false;

function getOrCreateDynamicClient(): DynamicClient {
  const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  if (!environmentId) {
    throw new Error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not configured");
  }
  if (!dynamicClient) {
    dynamicClient = createDynamicClient({
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
  }
  if (!evmExtensionAdded) {
    addEvmExtension();
    evmExtensionAdded = true;
  }
  return dynamicClient;
}

const emptySubscribe = () => () => {};

/**
 * Browser Dynamic + React Query providers.
 * Renders children on the server; DynamicProvider mounts on the client so the
 * app shell can SSR without wrapping the tree in next/dynamic ssr:false.
 */
export function WalletProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const client = useSyncExternalStore(
    emptySubscribe,
    getOrCreateDynamicClient,
    () => null
  );

  useEffect(() => {
    if (client) {
      void initializeClient();
    }
  }, [client]);

  if (!client) {
    return (
      <DynamicReadyContext.Provider value={false}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </DynamicReadyContext.Provider>
    );
  }

  return (
    <DynamicReadyContext.Provider value={true}>
      <QueryClientProvider client={queryClient}>
        <DynamicProvider client={client}>{children}</DynamicProvider>
      </QueryClientProvider>
    </DynamicReadyContext.Provider>
  );
}
