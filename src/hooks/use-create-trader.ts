"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api";

export function useCreateTrader() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const createTrader = useCallback(
    async (name: string) => {
      setIsLoading(true);
      setError(undefined);

      try {
        const res = await authFetch("/api/trader/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create trader");

        queryClient.invalidateQueries({ queryKey: ["traders"] });
        return data.trader;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create trader";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [queryClient]
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
