"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { getConvexUrl, toConvexAuthProvider } from "@/lib/convex/auth";
import { getPrivyProviderProps } from "@/lib/privy/config";

function usePrivyConvexAuth() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const fetchAccessToken = useCallback(
    async () => getAccessToken(),
    [getAccessToken]
  );

  return useMemo(
    () =>
      toConvexAuthProvider({
        ready,
        authenticated,
        getAccessToken: fetchAccessToken,
      }),
    [ready, authenticated, fetchAccessToken]
  );
}

function MarginCallConvexProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [convex] = useState(
    () =>
      new ConvexReactClient(getConvexUrl(process.env.NEXT_PUBLIC_CONVEX_URL))
  );

  return (
    <ConvexProviderWithAuth client={convex} useAuth={usePrivyConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

export function MarginCallPrivyProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PrivyProvider
      {...getPrivyProviderProps(process.env.NEXT_PUBLIC_PRIVY_APP_ID)}
    >
      <MarginCallConvexProvider>{children}</MarginCallConvexProvider>
    </PrivyProvider>
  );
}
