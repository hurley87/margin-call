"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  ensureDynamicClientInitialized,
  getDynamicClient,
  isDynamicConfigured,
} from "@/lib/dynamic/client";

const DynamicProvider = dynamic(
  () =>
    import("@dynamic-labs-sdk/react-hooks").then((mod) => mod.DynamicProvider),
  { ssr: false }
);

function DynamicClientTree({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [queryClient] = useState(() => new QueryClient());
  const [client] = useState(() => getDynamicClient());

  useEffect(() => {
    void ensureDynamicClientInitialized();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <DynamicProvider client={client}>{children}</DynamicProvider>
    </QueryClientProvider>
  );
}

/**
 * Mounts Dynamic + React Query when configured. Missing env degrades to
 * rendering children without a wallet provider so the coming-soon page still
 * works in unconfigured environments.
 */
export function MarginCallDynamicProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!isDynamicConfigured()) {
    return children;
  }

  return <DynamicClientTree>{children}</DynamicClientTree>;
}
