"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import { getAuthBoundaryState } from "./auth-boundary";

/**
 * Renders children only when the player is fully signed in with an embedded
 * wallet. Login / logout chrome lives in AuthControls (AppShell).
 */
export function AuthGate({
  children,
}: Readonly<{
  children?: React.ReactNode;
}>) {
  const { ready: privyReady, authenticated, user } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const walletAddress = getEvmWalletAddress(user);
  const state = getAuthBoundaryState({
    privyReady,
    authenticated,
    walletsReady,
    walletAddress,
    loginError: false,
    logoutPending: false,
    logoutError: false,
  });

  if (state.status !== "signed-in") return null;
  return <>{children}</>;
}
