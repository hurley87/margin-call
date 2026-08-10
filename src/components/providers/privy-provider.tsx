"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { getPrivyProviderProps } from "@/lib/privy/config";

export function MarginCallPrivyProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PrivyProvider
      {...getPrivyProviderProps(process.env.NEXT_PUBLIC_PRIVY_APP_ID)}
    >
      {children}
    </PrivyProvider>
  );
}
