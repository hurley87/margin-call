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
 * Small Connect / address / Disconnect control for the coming-soon landing.
 * Hidden when Dynamic is not configured at build time.
 */
export function WalletConnectControl() {
  // Inlined at build time by Next, so this elides the island chunk entirely.
  if (!process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID) {
    return null;
  }

  return <WalletConnectIsland />;
}
