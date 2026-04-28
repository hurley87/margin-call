"use client";

import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { authFetch } from "@/lib/api";
import type { Trader } from "./use-traders";
import type { Mandate } from "@/lib/agent/evaluator";

export function useCreateTrader() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { user } = usePrivy();

  const createTrader = useCallback(
    async (name: string, mandate?: Mandate, personality?: string | null) => {
      setIsLoading(true);
      setError(undefined);

      try {
        const res = await authFetch("/api/trader/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            mandate,
            ...(personality !== undefined && personality !== ""
              ? { personality }
              : {}),
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create trader");

        const newTrader = data.trader as Trader;
        // Convex subscription on traders.listByDesk will update automatically —
        // no cache invalidation needed.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.wallet?.address]
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
