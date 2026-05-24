"use client";

import { useState, useCallback } from "react";
import { erc20Abi, parseUnits, decodeEventLog } from "viem";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSponsoredContractWrite } from "@/hooks/use-sponsored-contract-write";
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

type CreateDealStep = "idle" | "approving" | "creating" | "syncing" | "done";

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

      setState({ step: "approving" });

      try {
        await syncDeskWalletBalance("Fund your wallet before creating a deal");

        const potAmountRaw = parseUnits(potAmountUsdc.toString(), 6);
        const entryCostRaw = parseUnits(entryCostUsdc.toString(), 6);

        const approveHash = await writeSponsoredContract({
          address: USDC_SEPOLIA_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [ESCROW_ADDRESS, potAmountRaw],
          chainId: CONTRACTS_CHAIN_ID,
        });

        setState((s) => ({ ...s, approveHash }));

        const publicClient = makePublicClient();

        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        setState((s) => ({ ...s, step: "creating" }));

        const createHash = await writeSponsoredContract({
          address: ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "createDeal",
          args: [prompt, potAmountRaw, entryCostRaw],
          chainId: CONTRACTS_CHAIN_ID,
        });

        setState((s) => ({ ...s, createHash }));

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
    [writeSponsoredContract, recordOnChainCreation]
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
