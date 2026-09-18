"use client";

import { useCallback } from "react";
import { useOptionalConvexClient } from "@/components/providers/convex-client-provider";
import { api } from "../../../convex/_generated/api";

/**
 * Best-effort receipt sync into the Convex Position read model.
 * Never throws — Base tx success is independent of indexing.
 * Uses the shared ConvexClientProvider client (or skips when unset).
 */
export function useSyncPositionTransaction() {
  const client = useOptionalConvexClient();

  return useCallback(
    async (
      txHash: `0x${string}`
    ): Promise<"synced" | "pending" | "skipped"> => {
      if (!client) return "skipped";
      try {
        const result = await client.action(api.sync.syncTransaction, {
          txHash,
        });
        return result.ok ? "synced" : "pending";
      } catch {
        return "pending";
      }
    },
    [client]
  );
}
