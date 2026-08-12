"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import {
  getDeskDollarsTokenAddress,
  readDeskDollarsBalance,
} from "@/lib/desk-dollars";
import { subscribeToWalletBalanceChanges } from "@/lib/wallet-balance-sync";

type BalanceState = {
  wallet: Address;
  balance: bigint;
  decimals: number;
};

/**
 * Display-only tUSD balance for always-mounted chrome (AppShell header).
 * Unlike useDeskDollarsFaucet, it carries no claim plumbing and no cooldown
 * ticker, so consumers never re-render on the faucet's one-second interval.
 */
export function useDeskDollarsBalance(walletAddress: Address | null) {
  const tokenAddress = useMemo(() => getDeskDollarsTokenAddress(), []);
  const [state, setState] = useState<BalanceState | null>(null);

  useEffect(() => {
    if (!tokenAddress || !walletAddress) return;
    let cancelled = false;
    const read = () => {
      readDeskDollarsBalance(tokenAddress, walletAddress)
        .then(({ balance, decimals }) => {
          if (!cancelled)
            setState({ wallet: walletAddress, balance, decimals });
        })
        // Display-only: the label just stays hidden until a read lands.
        .catch(() => undefined);
    };
    read();
    const unsubscribe = subscribeToWalletBalanceChanges(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tokenAddress, walletAddress]);

  // Keying the result by wallet (instead of resetting state in the effect)
  // also keeps a previous wallet's balance from flashing after a switch.
  return state && state.wallet === walletAddress
    ? { balance: state.balance, decimals: state.decimals }
    : { balance: null, decimals: null };
}
