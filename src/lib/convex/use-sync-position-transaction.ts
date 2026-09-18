"use client";

import { useCallback, useMemo } from "react";
import { ConvexReactClient } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
 * Best-effort receipt sync into the Convex Position read model.
 * Never throws — Base tx success is independent of indexing.
 * Uses a dedicated client so it works with or without ConvexProvider.
 */
export function useSyncPositionTransaction() {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
    if (!url) return null;
    return new ConvexReactClient(url);
  }, []);

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
