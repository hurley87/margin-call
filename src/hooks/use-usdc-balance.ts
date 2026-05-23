"use client";

import { useEffect } from "react";
import { useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import { getEmbeddedEvmWalletAddress } from "@/lib/privy/wallet";
import { syncDeskWalletBalance } from "@/lib/api";
import {
  USDC_SEPOLIA_ADDRESS,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";
import { usdcFromRaw } from "@/lib/contracts/balance";

// Module-level dedup so two callers (e.g. dashboard + create-deal dialog) of the
// same wallet share one sync POST per balance change instead of double-firing.
const lastSyncedByWallet = new Map<string, string>();

export function useUsdcBalance() {
  const { user } = usePrivy();

  const walletAddress = getEmbeddedEvmWalletAddress(user) ?? undefined;

  const { data, isLoading, error, refetch } = useReadContract({
    address: USDC_SEPOLIA_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    chainId: CONTRACTS_CHAIN_ID,
    query: {
      enabled: !!walletAddress,
      refetchInterval: 15_000,
    },
  });

  const balance = data !== undefined ? usdcFromRaw(data) : undefined;

  useEffect(() => {
    if (!walletAddress || data === undefined) return;
    const syncKey = data.toString();
    if (lastSyncedByWallet.get(walletAddress) === syncKey) return;
    lastSyncedByWallet.set(walletAddress, syncKey);
    void syncDeskWalletBalance("Failed to sync wallet balance").catch(() => {
      lastSyncedByWallet.delete(walletAddress);
    });
  }, [data, walletAddress]);

  return { balance, isLoading, error, refetch, walletAddress };
}
