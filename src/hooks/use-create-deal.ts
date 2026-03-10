"use client";

import { useState, useCallback } from "react";
import { useWriteContract } from "wagmi";
import { erc20Abi, parseUnits, decodeEventLog } from "viem";
import {
  ESCROW_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  CONTRACTS_CHAIN_ID,
  escrowAbi,
} from "@/lib/contracts/escrow";

type CreateDealStep = "idle" | "approving" | "creating" | "syncing" | "done";

interface CreateDealState {
  step: CreateDealStep;
  approveHash?: `0x${string}`;
  createHash?: `0x${string}`;
  dealId?: bigint;
  supabaseId?: string;
  error?: string;
}

export function useCreateDeal() {
  const [state, setState] = useState<CreateDealState>({ step: "idle" });

  const { writeContractAsync: writeApprove } = useWriteContract();

  const { writeContractAsync: writeCreateDeal } = useWriteContract();

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
        const { createPublicClient, http } = await import("viem");
        const { baseSepolia } = await import("viem/chains");
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http(),
        });

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

        // Step 3: Sync to Supabase
        setState((s) => ({ ...s, step: "syncing", dealId }));

        let supabaseId: string | undefined;
        try {
          const syncRes = await fetch("/api/deal/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              txHash: createHash,
              source_headline: sourceHeadline,
            }),
          });
          const syncData = await syncRes.json();
          supabaseId = syncData.supabaseId ?? undefined;
        } catch {
          // Sync failure is non-critical
        }

        setState({ step: "done", approveHash, createHash, dealId, supabaseId });

        return { dealId, createHash, supabaseId };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Transaction failed";
        setState({ step: "idle", error: message });
        throw err;
      }
    },
    [writeApprove, writeCreateDeal]
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
    supabaseId: state.supabaseId,
    error: state.error,
    isLoading: state.step !== "idle" && state.step !== "done",
  };
}
