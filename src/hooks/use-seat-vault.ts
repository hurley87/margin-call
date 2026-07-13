"use client";

import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { useReadContract } from "wagmi";
import { erc20Abi, isAddressEqual, maxUint256, zeroAddress } from "viem";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSponsoredContractWrite } from "@/hooks/use-sponsored-contract-write";
import { useBaseNetwork } from "@/hooks/use-base-network";
import { getEmbeddedEvmWalletAddress } from "@/lib/privy/wallet";
import { makePublicClient } from "@/lib/contracts/client";
import {
  CONTRACTS_CHAIN_ID,
  ESCROW_ADDRESS,
  escrowAbi,
} from "@/lib/contracts/escrow";
import {
  MARGINCALL_TOKEN_ADDRESS,
  SEAT_VAULT_ADDRESS,
  parseBlowAmount,
  seatVaultAbi,
} from "@/lib/contracts/seatVault";

export type SeatVaultStep =
  | "idle"
  | "checking"
  | "approving"
  | "confirmingApproval"
  | "staking"
  | "confirmingStake"
  | "initiating"
  | "confirmingInitiate"
  | "completing"
  | "confirmingComplete"
  | "reconciling"
  | "done";

type SeatVaultState = {
  step: SeatVaultStep;
  error?: string;
  txHash?: `0x${string}`;
};

export function useBlowBalance() {
  const { user } = usePrivy();
  const walletAddress = getEmbeddedEvmWalletAddress(user) ?? undefined;

  const { data, isLoading, error, refetch } = useReadContract({
    address: MARGINCALL_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    chainId: CONTRACTS_CHAIN_ID,
    query: {
      enabled: !!walletAddress,
      refetchInterval: 15_000,
    },
  });

  return {
    balanceWei: data,
    isLoading,
    error,
    refetch,
    walletAddress: walletAddress ?? null,
  };
}

export function useTraderDepositor(onChainTraderId: number | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "depositors",
    args: onChainTraderId !== undefined ? [BigInt(onChainTraderId)] : undefined,
    chainId: CONTRACTS_CHAIN_ID,
    query: {
      enabled: onChainTraderId !== undefined && onChainTraderId > 0,
      refetchInterval: 30_000,
    },
  });

  const depositor =
    data && !isAddressEqual(data as `0x${string}`, zeroAddress)
      ? (data as `0x${string}`)
      : null;

  return { depositor, isLoading, refetch };
}

async function waitConfirmed(hash: `0x${string}`) {
  const publicClient = makePublicClient();
  return publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 2,
  });
}

export function useSeatVaultFlows() {
  const [state, setState] = useState<SeatVaultState>({ step: "idle" });
  const writeSponsoredContract = useSponsoredContractWrite();
  const { user } = usePrivy();
  const walletAddress = getEmbeddedEvmWalletAddress(user);
  const { isWrongNetwork } = useBaseNetwork();
  const reconcileOwnedTrader = useAction(
    api.seatVault.actions.reconcileOwnedTrader
  );

  const assertWalletReady = useCallback(() => {
    if (!walletAddress) {
      throw new Error("Connect the desk treasury wallet first.");
    }
    if (isWrongNetwork) {
      throw new Error("Wrong chain — switch to Base Sepolia before posting.");
    }
    if (state.step !== "idle" && state.step !== "done") {
      throw new Error("A floor ticket is already pending. Wait for the wire.");
    }
    return walletAddress;
  }, [walletAddress, isWrongNetwork, state.step]);

  const stake = useCallback(
    async (args: {
      convexTraderId: Id<"traders">;
      onChainTraderId: number;
      amountHuman: string;
      vaultAddress?: `0x${string}`;
      depositor: string | null;
    }) => {
      setState({ step: "checking" });

      try {
        const wallet = assertWalletReady();
        const vault = args.vaultAddress ?? SEAT_VAULT_ADDRESS;

        let amountWei: bigint;
        try {
          amountWei = BigInt(parseBlowAmount(args.amountHuman));
        } catch {
          throw new Error("Enter a valid $BLOW amount.");
        }
        if (amountWei <= BigInt(0)) {
          throw new Error("Zero won't clear compliance. Post a real figure.");
        }

        if (!args.depositor) {
          throw new Error(
            "No depositor on file — fund escrow first so the desk owns this badge."
          );
        }
        if (args.depositor.toLowerCase() !== wallet.toLowerCase()) {
          throw new Error(
            "Depositor mismatch — only the assigned desk treasury can post principal."
          );
        }

        const publicClient = makePublicClient();

        const [balance, allowance] = await Promise.all([
          publicClient.readContract({
            address: MARGINCALL_TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet],
          }),
          publicClient.readContract({
            address: MARGINCALL_TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet, vault],
          }),
        ]);

        if (balance < amountWei) {
          throw new Error(
            "Insufficient $BLOW on the desk — wire more chips before posting."
          );
        }

        let approveHash: `0x${string}` | undefined;
        if (allowance < amountWei) {
          setState({ step: "approving" });
          approveHash = await writeSponsoredContract({
            address: MARGINCALL_TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [vault, maxUint256],
            chainId: CONTRACTS_CHAIN_ID,
          });
          setState({
            step: "confirmingApproval",
            txHash: approveHash,
          });
          await waitConfirmed(approveHash);
        }

        setState({ step: "staking", txHash: approveHash });
        const stakeHash = await writeSponsoredContract({
          address: vault,
          abi: seatVaultAbi,
          functionName: "stake",
          args: [BigInt(args.onChainTraderId), amountWei],
          chainId: CONTRACTS_CHAIN_ID,
        });
        setState({ step: "confirmingStake", txHash: stakeHash });
        await waitConfirmed(stakeHash);

        setState({ step: "reconciling", txHash: stakeHash });
        await reconcileOwnedTrader({
          traderId: args.convexTraderId,
          vaultAddress: vault,
        });

        setState({ step: "done", txHash: stakeHash });
        return { hash: stakeHash };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Stake ticket failed";
        setState({ step: "idle", error: message });
        throw err;
      }
    },
    [assertWalletReady, writeSponsoredContract, reconcileOwnedTrader]
  );

  const initiateUnstake = useCallback(
    async (args: {
      convexTraderId: Id<"traders">;
      onChainTraderId: number;
      amountHuman: string;
      vaultAddress?: `0x${string}`;
      activeWei: string;
      staker: string | null;
    }) => {
      setState({ step: "checking" });

      try {
        const wallet = assertWalletReady();
        const vault = args.vaultAddress ?? SEAT_VAULT_ADDRESS;

        let amountWei: bigint;
        try {
          amountWei = BigInt(parseBlowAmount(args.amountHuman));
        } catch {
          throw new Error("Enter a valid $BLOW amount.");
        }
        if (amountWei <= BigInt(0)) {
          throw new Error("Zero won't clear compliance. Name a real pull.");
        }
        if (amountWei > BigInt(args.activeWei)) {
          throw new Error("That pull exceeds active principal on this seat.");
        }

        const walletLc = wallet.toLowerCase();
        const stakerLc = args.staker?.toLowerCase();
        if (walletLc !== stakerLc) {
          throw new Error(
            "Not authorized — only the recorded staker can pull principal."
          );
        }

        setState({ step: "initiating" });
        const hash = await writeSponsoredContract({
          address: vault,
          abi: seatVaultAbi,
          functionName: "initiateUnstake",
          args: [BigInt(args.onChainTraderId), amountWei],
          chainId: CONTRACTS_CHAIN_ID,
        });
        setState({ step: "confirmingInitiate", txHash: hash });
        await waitConfirmed(hash);

        setState({ step: "reconciling", txHash: hash });
        await reconcileOwnedTrader({
          traderId: args.convexTraderId,
          vaultAddress: vault,
        });

        setState({ step: "done", txHash: hash });
        return { hash };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unstake initiate failed";
        setState({ step: "idle", error: message });
        throw err;
      }
    },
    [assertWalletReady, writeSponsoredContract, reconcileOwnedTrader]
  );

  const completeUnstake = useCallback(
    async (args: {
      convexTraderId: Id<"traders">;
      onChainTraderId: number;
      vaultAddress: `0x${string}`;
      pendingWei: string;
      unlockTime: number;
    }) => {
      setState({ step: "checking" });

      try {
        assertWalletReady();
        if (BigInt(args.pendingWei) <= BigInt(0)) {
          throw new Error("Nothing pending on this vault.");
        }
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (nowSeconds < args.unlockTime) {
          throw new Error(
            "Cooldown still running — the cage won't release principal yet."
          );
        }

        setState({ step: "completing" });
        const hash = await writeSponsoredContract({
          address: args.vaultAddress,
          abi: seatVaultAbi,
          functionName: "completeUnstake",
          args: [BigInt(args.onChainTraderId)],
          chainId: CONTRACTS_CHAIN_ID,
        });
        setState({ step: "confirmingComplete", txHash: hash });
        await waitConfirmed(hash);

        setState({ step: "reconciling", txHash: hash });
        await reconcileOwnedTrader({
          traderId: args.convexTraderId,
          vaultAddress: args.vaultAddress,
        });

        setState({ step: "done", txHash: hash });
        return { hash };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Complete unstake failed";
        setState({ step: "idle", error: message });
        throw err;
      }
    },
    [assertWalletReady, writeSponsoredContract, reconcileOwnedTrader]
  );

  const reset = useCallback(() => {
    setState({ step: "idle" });
  }, []);

  return {
    stake,
    initiateUnstake,
    completeUnstake,
    reset,
    step: state.step,
    error: state.error,
    txHash: state.txHash,
    isLoading: state.step !== "idle" && state.step !== "done",
    walletAddress,
  };
}

export function seatVaultStepLabel(step: SeatVaultStep): string {
  switch (step) {
    case "idle":
      return "Standing by";
    case "checking":
      return "Running compliance…";
    case "approving":
      return "Clearing $BLOW allowance…";
    case "confirmingApproval":
      return "Waiting on approval receipt…";
    case "staking":
      return "Posting principal…";
    case "confirmingStake":
      return "Waiting on stake receipt…";
    case "initiating":
      return "Filing pull request…";
    case "confirmingInitiate":
      return "Waiting on pull receipt…";
    case "completing":
      return "Releasing from the cage…";
    case "confirmingComplete":
      return "Waiting on release receipt…";
    case "reconciling":
      return "Updating the floor book…";
    case "done":
      return "Ticket cleared";
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}
