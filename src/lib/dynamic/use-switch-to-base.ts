"use client";

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { isProgrammaticNetworkSwitchAvailable } from "@dynamic-labs-sdk/client";
import { useCallback, useState } from "react";
import { switchWalletToBase } from "@/lib/dynamic/resolve-wallet-client";

export type SwitchToBase = {
  /** False for wallets that cannot be switched programmatically. */
  canSwitch: boolean;
  switching: boolean;
  error: string | null;
  onSwitch: () => void;
};

/** Shared Switch-to-Base action for any surface blocked by the wrong chain. */
export function useSwitchToBase(evmAccount: WalletAccount): SwitchToBase {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSwitch = useCallback(() => {
    setSwitching(true);
    setError(null);
    switchWalletToBase(evmAccount)
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : "Failed to switch to Base."
        );
      })
      .finally(() => setSwitching(false));
  }, [evmAccount]);

  return {
    canSwitch: isProgrammaticNetworkSwitchAvailable({
      walletAccount: evmAccount,
    }),
    switching,
    error,
    onSwitch,
  };
}
