"use client";

import { useCallback, useMemo } from "react";
import {
  ConvexProvider,
  ConvexReactClient,
  ConvexProviderWithAuth,
} from "convex/react";
import { usePrivy } from "@privy-io/react-auth";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/** Used when Privy is unavailable (e.g. build) so Convex hooks have a client. */
const unauthConvex = new ConvexReactClient(
  convexUrl || "https://placeholder.convex.cloud"
);

function usePrivyAuth() {
  const { ready, authenticated, getAccessToken } = usePrivy();

  // Stable references — Convex compares the auth object's identity to decide
  // whether auth changed. A new function or object every render triggers a
  // reconnect storm.
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken: _ }: { forceRefreshToken: boolean }) =>
      getAccessToken(),
    [getAccessToken]
  );

  return useMemo(
    () => ({
      isLoading: !ready,
      isAuthenticated: authenticated,
      fetchAccessToken,
    }),
    [ready, authenticated, fetchAccessToken]
  );
}

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!convex) return <>{children}</>;
  return (
    <ConvexProviderWithAuth client={convex} useAuth={usePrivyAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

/**
 * Unauthenticated Convex provider — used when Privy is not configured
 * (e.g. Next.js build-time SSR with no env vars).
 */
export function ConvexUnauthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConvexProvider client={unauthConvex}>{children}</ConvexProvider>;
}
