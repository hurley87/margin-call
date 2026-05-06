"use client";

import { useState, useCallback } from "react";
import { useWriteContract } from "wagmi";
import { erc20Abi, parseUnits, decodeEventLog } from "viem";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ESCROW_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  CONTRACTS_CHAIN_ID,
  escrowAbi,
} from "@/lib/contracts/escrow";
import { makePublicClient } from "@/lib/contracts/client";

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

  const { writeContractAsync: writeApprove } = useWriteContract();

  const { writeContractAsync: writeCreateDeal } = useWriteContract();

  const recordOnChainCreation = useMutation(api.deals.recordOnChainCreation);

  const createDeal = useCallback(
    async (
      prompt: string,
      potAmountUsdc: number,
      entryCostUsdc: number,
      sourceHeadline?: string
    ) => {
      setState({ step: "approving" });

      try {
        const potAmountRaw = parseUnits(potAmountUsdc.toString(), 6);
        const entryCostRaw = parseUnits(entryCostUsdc.toString(), 6);

        // Step 1: Approve USDC spend
        const approveHash = await writeApprove({
          address: USDC_SEPOLIA_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [ESCROW_ADDRESS, potAmountRaw],
          chainId: CONTRACTS_CHAIN_ID,
        });

        setState((s) => ({ ...s, approveHash }));

        // Wait for approval confirmation inline via polling
        const publicClient = makePublicClient();

        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // Step 2: Call createDeal on escrow
        setState((s) => ({ ...s, step: "creating" }));

        const createHash = await writeCreateDeal({
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

        // Extract dealId from DealCreated event
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

        // Step 3: Record on-chain deal in Convex
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
    [writeApprove, writeCreateDeal, recordOnChainCreation]
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
