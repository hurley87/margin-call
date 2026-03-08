"use client";

import { useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import {
  USDC_SEPOLIA_ADDRESS,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";

export function useUsdcBalance() {
  const { user } = usePrivy();

  const walletAddress = user?.wallet?.address as `0x${string}` | undefined;

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

  const balance = data !== undefined ? Number(data) / 1_000_000 : undefined;

  return { balance, isLoading, error, refetch, walletAddress };
}
