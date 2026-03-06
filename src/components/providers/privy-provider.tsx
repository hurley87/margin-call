"use client";

import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { privyConfig } from "@/lib/privy/config";

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return <>{children}</>;
  }

  return (
    <BasePrivyProvider appId={appId} config={privyConfig}>
      {children}
    </BasePrivyProvider>
  );
}
