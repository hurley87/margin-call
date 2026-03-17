"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { authFetch } from "@/lib/api";
import type { Trader } from "./use-traders";
import type { Mandate } from "@/lib/agent/evaluator";

export function useCreateTrader() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();
  const { user } = usePrivy();
  const walletAddress = user?.wallet?.address;

  const createTrader = useCallback(
    async (name: string, mandate?: Mandate) => {
      setIsLoading(true);
      setError(undefined);

      try {
        const res = await authFetch("/api/trader/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, mandate }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create trader");

        const newTrader = data.trader as Trader;

        // Optimistically prepend the new trader so the list updates instantly
        if (walletAddress) {
          queryClient.setQueryData<Trader[]>(
            ["traders", walletAddress],
            (old) => (old ? [newTrader, ...old] : [newTrader])
          );
        }

        return newTrader;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create trader";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [queryClient, walletAddress]
  );

  const reset = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    createTrader,
    reset,
    isLoading,
    error,
  };
}
