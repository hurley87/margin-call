"use client";

import { useState, useCallback } from "react";
import { erc20Abi, parseUnits, decodeEventLog, maxUint256 } from "viem";
import { useMutation } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSponsoredContractWrite } from "@/hooks/use-sponsored-contract-write";
import { getEmbeddedEvmWalletAddress } from "@/lib/privy/wallet";
import { syncDeskWalletBalance } from "@/lib/api";
import {
  ESCROW_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  CONTRACTS_CHAIN_ID,
  escrowAbi,
} from "@/lib/contracts/escrow";
import { makePublicClient } from "@/lib/contracts/client";
import {
  isTradingHours,
  MARKET_CLOSED_MESSAGE,
} from "../../convex/lib/tradingHours";

type CreateDealStep =
  | "idle"
  | "checking"
  | "approving"
  | "confirmingApproval"
  | "creating"
  | "confirmingCreate"
  | "syncing"
  | "done";

interface CreateDealState {
  step: CreateDealStep;
  approveHash?: `0x${string}`;
  createHash?: `0x${string}`;
  dealId?: bigint;
  convexDealId?: Id<"deals">;
  error?: string;
}

export function useCreateDeal() {
  const [state, setState] = useState<CreateDealState>({ step: "idle" });
  const writeSponsoredContract = useSponsoredContractWrite();
  const { user } = usePrivy();
  const walletAddress = getEmbeddedEvmWalletAddress(user) ?? undefined;

  const recordOnChainCreation = useMutation(api.deals.recordOnChainCreation);

  const createDeal = useCallback(
    async (
      prompt: string,
      potAmountUsdc: number,
      entryCostUsdc: number,
      sourceHeadline?: string,
      wireDealSeedId?: Id<"wireDealSeeds">
    ) => {
      if (!isTradingHours()) {
        const error = new Error(MARKET_CLOSED_MESSAGE);
        setState({ step: "idle", error: error.message });
        throw error;
      }

      setState({ step: "checking" });

      try {
        await syncDeskWalletBalance("Fund your wallet before creating a deal");

        const potAmountRaw = parseUnits(potAmountUsdc.toString(), 6);
        const entryCostRaw = parseUnits(entryCostUsdc.toString(), 6);

        const publicClient = makePublicClient();

        // Skip the approve tx entirely when the desk wallet already has a
        // standing allowance that covers this pot. We approve maxUint256 (USDC
        // treats it as infinite), so only the first deal ever needs an approval.
        let hasSufficientAllowance = false;
        if (walletAddress) {
          try {
            const allowance = await publicClient.readContract({
              address: USDC_SEPOLIA_ADDRESS,
              abi: erc20Abi,
              functionName: "allowance",
              args: [walletAddress, ESCROW_ADDRESS],
            });
            hasSufficientAllowance = allowance >= potAmountRaw;
          } catch {
            // Fall back to approving if the allowance read fails.
            hasSufficientAllowance = false;
          }
        }

        let approveHash: `0x${string}` | undefined;
        if (!hasSufficientAllowance) {
          setState((s) => ({ ...s, step: "approving" }));

          approveHash = await writeSponsoredContract({
            address: USDC_SEPOLIA_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [ESCROW_ADDRESS, maxUint256],
            chainId: CONTRACTS_CHAIN_ID,
          });

          setState((s) => ({ ...s, approveHash, step: "confirmingApproval" }));

          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }

        setState((s) => ({ ...s, step: "creating" }));

        const createHash = await writeSponsoredContract({
          address: ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "createDeal",
          args: [prompt, potAmountRaw, entryCostRaw],
          chainId: CONTRACTS_CHAIN_ID,
        });

        setState((s) => ({ ...s, createHash, step: "confirmingCreate" }));

        const createTxReceipt = await publicClient.waitForTransactionReceipt({
          hash: createHash,
        });

        let dealId: bigint | undefined;
        for (const log of createTxReceipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: escrowAbi,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "DealCreated") {
              dealId = (decoded.args as { dealId: bigint }).dealId;
              break;
            }
          } catch {
            // not our event
          }
        }

        setState((s) => ({ ...s, step: "syncing", dealId }));

        let convexDealId: Id<"deals"> | undefined;
        if (dealId !== undefined) {
          try {
            convexDealId = await recordOnChainCreation({
              onChainDealId: Number(dealId),
              onChainTxHash: createHash,
              prompt,
              potUsdc: potAmountUsdc,
              entryCostUsdc,
              sourceHeadline,
              wireDealSeedId,
            });
          } catch (syncErr) {
            console.error("recordOnChainCreation failed:", syncErr);
          }
        }

        setState({
          step: "done",
          approveHash,
          createHash,
          dealId,
          convexDealId,
        });

        return { dealId, createHash, convexDealId };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Transaction failed";
        setState({ step: "idle", error: message });
        throw err;
      }
    },
    [writeSponsoredContract, recordOnChainCreation, walletAddress]
  );

  const reset = useCallback(() => {
    setState({ step: "idle" });
  }, []);

  return {
    createDeal,
    reset,
    step: state.step,
    approveHash: state.approveHash,
    createHash: state.createHash,
    dealId: state.dealId,
    convexDealId: state.convexDealId,
    error: state.error,
    isLoading: state.step !== "idle" && state.step !== "done",
  };
}
