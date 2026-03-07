"use client";

import { useCallback, useState } from "react";
import { usePrivy, useActiveWallet, useWallets } from "@privy-io/react-auth";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { BASE_CHAIN_ID, isChainIdBase } from "@/lib/privy/config";

function getEthereumWallet(
  activeWallet: ReturnType<typeof useActiveWallet>["wallet"],
  wallets: ConnectedWallet[]
): ConnectedWallet | undefined {
  if (activeWallet?.type === "ethereum") return activeWallet as ConnectedWallet;
  return wallets[0];
}

export interface UseBaseNetworkResult {
  /** True when the connected EVM wallet is on a chain other than Base. */
  isWrongNetwork: boolean;
  /** True while a switch-chain request is in progress. */
  isSwitching: boolean;
  /** Non-null after a failed or rejected switch (e.g. user declined). */
  switchError: string | null;
  /** Request the active wallet to switch to Base. No-op if already on Base or no wallet. */
  switchToBase: () => Promise<void>;
  /** True when we have enough data to decide (authenticated, wallets ready). */
  isReady: boolean;
}

/**
 * Tracks whether the user's connected Privy wallet is on Base and exposes a switch action.
 * Uses the active wallet when it's Ethereum; otherwise falls back to the first connected wallet.
 */
export function useBaseNetwork(): UseBaseNetworkResult {
  const { authenticated, ready: privyReady } = usePrivy();
  const { wallet: activeWallet } = useActiveWallet();
  const { wallets, ready: walletsReady } = useWallets();

  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const evmWallet = getEthereumWallet(activeWallet, wallets);
  const isReady = Boolean(privyReady) && (authenticated ? walletsReady : true);
  const isWrongNetwork =
    isReady &&
    authenticated &&
    Boolean(evmWallet) &&
    !isChainIdBase(evmWallet!.chainId);

  const switchToBase = useCallback(async () => {
    const target = getEthereumWallet(activeWallet, wallets);
    if (!target || isChainIdBase(target.chainId)) return;
    setSwitchError(null);
    setIsSwitching(true);
    try {
      await target.switchChain(BASE_CHAIN_ID);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to switch network";
      setSwitchError(message);
    } finally {
      setIsSwitching(false);
    }
  }, [activeWallet, wallets]);

  return {
    isWrongNetwork,
    isSwitching,
    switchError,
    switchToBase,
    isReady,
  };
}
