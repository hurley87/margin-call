"use client";

import { useState, useCallback } from "react";
import { useWriteContract } from "wagmi";
import { decodeEventLog } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import {
  IDENTITY_REGISTRY_ADDRESS,
  CONTRACTS_CHAIN_ID,
  identityRegistryAbi,
} from "@/lib/contracts/escrow";
import { authFetch } from "@/lib/api";

type CreateTraderStep = "idle" | "minting" | "syncing" | "done";

interface CreateTraderState {
  step: CreateTraderStep;
  mintHash?: `0x${string}`;
  tokenId?: bigint;
  error?: string;
}

export function useCreateTrader() {
  const [state, setState] = useState<CreateTraderState>({ step: "idle" });
  const queryClient = useQueryClient();

  const { writeContractAsync } = useWriteContract();

  const createTrader = useCallback(
    async (name: string) => {
      setState({ step: "minting" });

      try {
        const agentURI = `data:application/json,{"name":"${name}"}`;

        // Step 1: User signs register(agentURI) — NFT mints to their wallet
        const mintHash = await writeContractAsync({
          address: IDENTITY_REGISTRY_ADDRESS,
          abi: identityRegistryAbi,
          functionName: "register",
          args: [agentURI],
          chainId: CONTRACTS_CHAIN_ID,
        });

        setState((s) => ({ ...s, mintHash }));

        // Wait for confirmation
        const { createPublicClient, http } = await import("viem");
        const { baseSepolia } = await import("viem/chains");
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http(),
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: mintHash,
        });

        // Extract tokenId from Transfer event
        let tokenId: bigint | undefined;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: identityRegistryAbi,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "Transfer") {
              tokenId = (decoded.args as { tokenId: bigint }).tokenId;
              break;
            }
          } catch {
            // not our event
          }
        }

        if (tokenId === undefined) {
          throw new Error("Failed to extract token ID from mint transaction");
        }

        // Step 2: Sync to Supabase
        setState((s) => ({ ...s, step: "syncing", tokenId }));

        const res = await authFetch("/api/trader/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            tokenId: Number(tokenId),
            txHash: mintHash,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to sync trader");

        setState({ step: "done", mintHash, tokenId });
        queryClient.invalidateQueries({ queryKey: ["traders"] });

        return data.trader;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Transaction failed";
        setState({ step: "idle", error: message });
        throw err;
      }
    },
    [writeContractAsync, queryClient]
  );

  const reset = useCallback(() => {
    setState({ step: "idle" });
  }, []);

  return {
    createTrader,
    reset,
    step: state.step,
    mintHash: state.mintHash,
    tokenId: state.tokenId,
    error: state.error,
    isLoading: state.step !== "idle" && state.step !== "done",
  };
}
