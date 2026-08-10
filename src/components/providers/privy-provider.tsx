"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { toConvexAuthProvider } from "@/lib/convex/auth";
import { privyProviderConfig } from "@/lib/privy/config";

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
  convexUrl,
  children,
}: Readonly<{
  convexUrl: string;
  children: React.ReactNode;
}>) {
  const [convex] = useState(() => new ConvexReactClient(convexUrl));

  return (
    <ConvexProviderWithAuth client={convex} useAuth={usePrivyConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

function MissingAuthConfigNotice({
  missingVariables,
}: Readonly<{
  missingVariables: string[];
}>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--t-bg)] px-6 font-mono text-[var(--t-text)]">
      <div className="max-w-xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
          Margin Call
        </p>
        <p className="mt-5 text-sm leading-6 text-[var(--t-muted)]">
          Authentication isn&apos;t configured for this environment. Set{" "}
          {missingVariables.join(" and ")} to enable sign-in.
        </p>
      </div>
    </main>
  );
}

export function MarginCallPrivyProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  // Degrade instead of throwing so builds, prerenders, and unconfigured
  // environments still render a page.
  if (!appId || !convexUrl) {
    return (
      <MissingAuthConfigNotice
        missingVariables={[
          ...(appId ? [] : ["NEXT_PUBLIC_PRIVY_APP_ID"]),
          ...(convexUrl ? [] : ["NEXT_PUBLIC_CONVEX_URL"]),
        ]}
      />
    );
  }

  return (
    <PrivyProvider appId={appId} config={privyProviderConfig}>
      <MarginCallConvexProvider convexUrl={convexUrl}>
        {children}
      </MarginCallConvexProvider>
    </PrivyProvider>
  );
}
