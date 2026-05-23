"use client";

import { useState, useCallback } from "react";
import { useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import { makePublicClient } from "@/lib/contracts/client";
import { getEmbeddedEvmWalletAddress } from "@/lib/privy/wallet";
import { useSponsoredContractWrite } from "@/hooks/use-sponsored-contract-write";
import {
  ESCROW_ADDRESS,
  escrowAbi,
  CONTRACTS_CHAIN_ID,
  USDC_SEPOLIA_ADDRESS,
} from "@/lib/contracts/escrow";
import { usdcFromRaw } from "@/lib/contracts/balance";

export function useSepoliaUsdcBalance() {
  const { user } = usePrivy();
  const walletAddress = getEmbeddedEvmWalletAddress(user) ?? undefined;

  const { data, isLoading, error, refetch } = useReadContract({
    address: USDC_SEPOLIA_ADDRESS as `0x${string}`,
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

  return { balance, isLoading, error, refetch, walletAddress };
}

export function useTraderEscrowBalance(
  tokenId: number | undefined,
  options?: { refetchInterval?: number }
) {
  const { data: rawBalance, refetch } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getBalance",
    args: tokenId ? [BigInt(tokenId)] : undefined,
    chainId: CONTRACTS_CHAIN_ID,
    query: {
      enabled: !!tokenId,
      refetchInterval: options?.refetchInterval ?? 15_000,
    },
  });

  const balanceUsdc = rawBalance !== undefined ? usdcFromRaw(rawBalance) : null;
  const unfunded = rawBalance === undefined || rawBalance === BigInt(0);

  return { rawBalance, balanceUsdc, unfunded, refetch };
}

type DepositStep = "idle" | "approving" | "depositing" | "done";

interface DepositState {
  step: DepositStep;
  error?: string;
}

/** Approve USDC then deposit into escrow. Awaits 2 confirmations. */
export function useDepositFlow() {
  const [state, setState] = useState<DepositState>({ step: "idle" });
  const writeSponsoredContract = useSponsoredContractWrite();

  const deposit = useCallback(
    async (traderId: bigint, amount: bigint) => {
      setState({ step: "approving" });

      try {
        const publicClient = makePublicClient();

        const approveHash = await writeSponsoredContract({
          address: USDC_SEPOLIA_ADDRESS as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [ESCROW_ADDRESS, amount],
          chainId: CONTRACTS_CHAIN_ID,
        });

        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        setState({ step: "depositing" });

        const depositHash = await writeSponsoredContract({
          address: ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "depositFor",
          args: [traderId, amount],
          chainId: CONTRACTS_CHAIN_ID,
        });

        await publicClient.waitForTransactionReceipt({
          hash: depositHash,
          confirmations: 2,
        });

        setState({ step: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Deposit failed";
        setState({ step: "idle", error: message });
        throw err;
      }
    },
    [writeSponsoredContract]
  );

  const reset = useCallback(() => {
    setState({ step: "idle" });
  }, []);

  return {
    deposit,
    reset,
    step: state.step,
    error: state.error,
    isLoading: state.step !== "idle" && state.step !== "done",
  };
}

/** Withdraw from escrow. Awaits 2 confirmations. */
export function useWithdrawFlow() {
  const [state, setState] = useState<{
    busy: boolean;
    done: boolean;
    error?: string;
  }>({
    busy: false,
    done: false,
  });
  const writeSponsoredContract = useSponsoredContractWrite();

  const withdraw = useCallback(
    async (traderId: bigint, amount: bigint) => {
      setState({ busy: true, done: false });

      try {
        const publicClient = makePublicClient();

        const hash = await writeSponsoredContract({
          address: ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "withdraw",
          args: [traderId, amount],
          chainId: CONTRACTS_CHAIN_ID,
        });

        await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 2,
        });

        setState({ busy: false, done: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Withdraw failed";
        setState({ busy: false, done: false, error: message });
        throw err;
      }
    },
    [writeSponsoredContract]
  );

  const reset = useCallback(() => {
    setState({ busy: false, done: false });
  }, []);

  return { withdraw, reset, ...state };
}
