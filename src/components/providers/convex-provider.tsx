"use client";

import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexProviderWithAuth } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";

// Use a placeholder URL when NEXT_PUBLIC_CONVEX_URL is not set (e.g. build time).
// ConvexReactClient with a dummy URL will not connect but prevents Convex hooks
// from throwing "Could not find Convex client" during SSR prerendering.
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://placeholder.convex.cloud";

const convex = new ConvexReactClient(convexUrl);

function usePrivyAuth() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  return {
    isLoading: !ready,
    isAuthenticated: authenticated,
    fetchAccessToken: async ({
      forceRefreshToken,
    }: {
      forceRefreshToken: boolean;
    }) => {
      void forceRefreshToken;
      return getAccessToken();
    },
  };
}

/** Full Convex provider with Privy auth bridge (used when Privy is available). */
export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={usePrivyAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

/**
 * Unauthenticated Convex provider — used when Privy is not configured
 * (e.g. during Next.js build-time SSR with no env vars).
 * Convex hooks will return undefined/loading state instead of throwing.
 */
export function ConvexUnauthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
