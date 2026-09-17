"use client";

import dynamic from "next/dynamic";
import { isDynamicConfigured } from "@/lib/dynamic/client";

const ConfiguredWalletConnectControl = dynamic(
  () =>
    import("@/components/wallet/configured-wallet-connect-control").then(
      (mod) => mod.ConfiguredWalletConnectControl
    ),
  { ssr: false }
);

/**
 * Small Connect / address / Disconnect control for the coming-soon landing.
 * Hidden when Dynamic is not configured.
 */
export function WalletConnectControl() {
  if (!isDynamicConfigured()) {
    return null;
  }

  return <ConfiguredWalletConnectControl />;
}
