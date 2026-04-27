"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithAuth } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";

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

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!convexUrl) return <>{children}</>;
  return (
    <ConvexProviderWithAuth client={convex} useAuth={usePrivyAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
