"use client";

import {
  createDynamicClient,
  initializeClient,
  type DynamicClient,
} from "@dynamic-labs-sdk/client";
import { addEvmExtension } from "@dynamic-labs-sdk/evm";
import {
  DynamicProvider,
  useGetWalletAccounts,
  useInitStatus,
} from "@dynamic-labs-sdk/react-hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getEvmWalletAddress } from "@/lib/dynamic/wallet";

export type WalletSession =
  | { kind: "unset" }
  | { kind: "hydrating" }
  | { kind: "failed"; message: string }
  | { kind: "disconnected" }
  | { kind: "connected"; address: `0x${string}` };

const DynamicReadyContext = createContext(false);
const WalletSessionContext = createContext<WalletSession>({ kind: "unset" });

/** True once DynamicProvider is mounted (browser-only). */
export function useDynamicReady(): boolean {
  return useContext(DynamicReadyContext);
}

/** App-wide wallet session — one derivation for header and portfolio. */
export function useWalletSession(): WalletSession {
  return useContext(WalletSessionContext);
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

function WalletSessionLiveProvider({ children }: { children: ReactNode }) {
  const { data: initStatus, error: initError } = useInitStatus();
  const { data: accounts = [] } = useGetWalletAccounts();

  const session = useMemo((): WalletSession => {
    if (initStatus === "failed") {
      return {
        kind: "failed",
        message: initError?.message ?? "Wallet failed to initialize.",
      };
    }
    if (initStatus !== "finished") {
      return { kind: "hydrating" };
    }
    const address = getEvmWalletAddress(accounts);
    if (address) {
      return { kind: "connected", address };
    }
    return { kind: "disconnected" };
  }, [accounts, initError?.message, initStatus]);

  return (
    <WalletSessionContext.Provider value={session}>
      {children}
    </WalletSessionContext.Provider>
  );
}

/**
 * Browser Dynamic + React Query providers.
 * Renders children on the server; DynamicProvider mounts on the client so the
 * app shell can SSR without wrapping the tree in next/dynamic ssr:false.
 * Missing DYNAMIC env publishes `{ kind: "unset" }` without mounting Dynamic.
 */
export function WalletProviders({ children }: { children: ReactNode }) {
  const hasDynamic = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);

  if (!hasDynamic) {
    return (
      <WalletSessionContext.Provider value={{ kind: "unset" }}>
        <DynamicReadyContext.Provider value={false}>
          {children}
        </DynamicReadyContext.Provider>
      </WalletSessionContext.Provider>
    );
  }

  return <WalletProvidersConfigured>{children}</WalletProvidersConfigured>;
}

function WalletProvidersConfigured({ children }: { children: ReactNode }) {
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
      <WalletSessionContext.Provider value={{ kind: "hydrating" }}>
        <DynamicReadyContext.Provider value={false}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </DynamicReadyContext.Provider>
      </WalletSessionContext.Provider>
    );
  }

  return (
    <DynamicReadyContext.Provider value={true}>
      <QueryClientProvider client={queryClient}>
        <DynamicProvider client={client}>
          <WalletSessionLiveProvider>{children}</WalletSessionLiveProvider>
        </DynamicProvider>
      </QueryClientProvider>
    </DynamicReadyContext.Provider>
  );
}
