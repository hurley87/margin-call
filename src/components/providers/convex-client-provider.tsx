"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { createContext, useContext, useMemo, type ReactNode } from "react";

const ConvexClientContext = createContext<ConvexReactClient | null>(null);

/** Optional Convex client from the nearest ConvexClientProvider (null when unset). */
export function useOptionalConvexClient(): ConvexReactClient | null {
  return useContext(ConvexClientContext);
}

/**
 * Optional Convex provider for the public Position read model.
 * When NEXT_PUBLIC_CONVEX_URL is unset, children render without Convex.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
    if (!url) return null;
    return new ConvexReactClient(url);
  }, []);

  if (!client) {
    return (
      <ConvexClientContext.Provider value={null}>
        {children}
      </ConvexClientContext.Provider>
    );
  }

  return (
    <ConvexClientContext.Provider value={client}>
      <ConvexProvider client={client}>{children}</ConvexProvider>
    </ConvexClientContext.Provider>
  );
}
