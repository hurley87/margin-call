"use client";

import dynamic from "next/dynamic";

const WalletConnectIsland = dynamic(
  () =>
    import("@/components/wallet/wallet-connect-island").then(
      (mod) => mod.WalletConnectIsland
    ),
  { ssr: false }
);

/**
 * Env-gated Base workspace shell.
 * Hidden when Dynamic is not configured at build time (Connect chunk elided).
 */
export function WalletConnectControl() {
  // Inlined at build time by Next, so this elides the island chunk entirely.
  if (!process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID) {
    return null;
  }

  return <WalletConnectIsland />;
}
