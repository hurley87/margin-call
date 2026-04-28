"use client";

import { useState, useEffect } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authFetch } from "@/lib/api";

export interface AgentActivity {
  id: string;
  trader_id: string;
  activity_type: string;
  message: string;
  deal_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DealOutcomeWithNarrative {
  id: string;
  deal_id: string;
  trader_id: string;
  narrative: string | { event: string; description: string }[];
  trader_pnl_usdc: number;
  pot_change_usdc: number;
  rake_usdc: number;
  assets_gained: { name: string; value_usdc: number }[];
  assets_lost: string[];
  trader_wiped_out: boolean;
  wipeout_reason: string | null;
  created_at: string;
}

export type { Asset as TraderAsset } from "@/lib/supabase/queries";

/**
 * Fetch trader assets from the legacy API route.
 * Not Convex-backed — plain fetch (assets not yet in Convex).
 */
export function useTraderAssets(traderId: string): {
  data: import("@/lib/supabase/queries").Asset[] | undefined;
  isLoading: boolean;
} {
  const [data, setData] = useState<
    import("@/lib/supabase/queries").Asset[] | undefined
  >(undefined);
  const [isLoading, setIsLoading] = useState(!!traderId);

  useEffect(() => {
    if (!traderId) return;
    let cancelled = false;
    // Note: setIsLoading before fetch — intentional, avoids flash of old data
    authFetch(`/api/trader/${traderId}/assets`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load assets");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(
            (json.assets ?? []) as import("@/lib/supabase/queries").Asset[]
          );
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [traderId]);

  return { data, isLoading };
}

/**
 * Reactive activity feed for a single trader.
 * Backed by Convex subscription — live updates without polling.
 */
export function useAgentActivity(traderId: string): {
  data: AgentActivity[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const result = useConvexQuery(
    api.agentActivityLog.listByTrader,
    traderId ? { traderId: traderId as Id<"traders"> } : "skip"
  );

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false, error: null };
  }

  // Map Convex camelCase → legacy snake_case AgentActivity interface
  const data: AgentActivity[] = result.map((entry) => ({
    id: entry._id,
    trader_id: entry.traderId,
    activity_type: entry.activityType,
    message: entry.message,
    deal_id: entry.dealId ?? null,
    metadata: (entry.metadata as Record<string, unknown>) ?? {},
    created_at: new Date(entry.createdAt).toISOString(),
  }));

  return { data, isLoading: false, isError: false, error: null };
}

/**
 * Reactive deal outcomes for a single trader.
 * Backed by Convex subscription — live updates without polling.
 */
export function useTraderOutcomes(traderId: string): {
  data: DealOutcomeWithNarrative[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const result = useConvexQuery(
    api.dealOutcomes.listByTrader,
    traderId ? { traderId: traderId as Id<"traders"> } : "skip"
  );

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  // Map Convex camelCase → legacy snake_case DealOutcomeWithNarrative interface
  const data: DealOutcomeWithNarrative[] = result.map((outcome) => ({
    id: outcome._id,
    deal_id: outcome.dealId,
    trader_id: outcome.traderId,
    narrative:
      (outcome.narrative as DealOutcomeWithNarrative["narrative"]) ?? "",
    trader_pnl_usdc: outcome.traderPnlUsdc ?? 0,
    pot_change_usdc: outcome.potChangeUsdc ?? 0,
    rake_usdc: outcome.rakeUsdc ?? 0,
    assets_gained:
      (outcome.assetsGained as { name: string; value_usdc: number }[]) ?? [],
    assets_lost: (outcome.assetsLost as string[]) ?? [],
    trader_wiped_out: outcome.traderWipedOut ?? false,
    wipeout_reason: outcome.wipeoutReason ?? null,
    created_at: new Date(outcome.createdAt).toISOString(),
    on_chain_tx_hash: outcome.onChainTxHash,
  }));

  return { data, isLoading: false, isError: false };
}

function useTraderStatusMutation(action: "pause" | "resume" | "revive") {
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function mutate(traderId: string) {
    setIsPending(true);
    setIsError(false);
    setError(null);
    try {
      const res = await authFetch(`/api/trader/${traderId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Failed to ${action}`);
      }
      return res.json();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(`Failed to ${action}`);
      setIsError(true);
      setError(e);
      throw e;
    } finally {
      setIsPending(false);
    }
  }

  return { mutate, isPending, isError, error };
}

export function usePauseTrader() {
  return useTraderStatusMutation("pause");
}

export function useResumeTrader() {
  return useTraderStatusMutation("resume");
}

export function useReviveTrader() {
  return useTraderStatusMutation("revive");
}
