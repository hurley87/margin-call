"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Doc } from "../../convex/_generated/dataModel";
import { realTxHashOrNull } from "@/lib/contracts/tx-hash";

/** Trader inventory row (Convex `assets` table, UI shape). */
export interface Asset {
  id: string;
  trader_id: string;
  name: string;
  value_usdc: number;
  source_deal_id: string | null;
  source_outcome_id: string | null;
  acquired_at: string;
}

export type TraderAsset = Asset;

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
  on_chain_tx_hash?: string | null;
}

function mapConvexAsset(asset: Doc<"assets">, traderId: string): Asset {
  return {
    id: asset._id,
    trader_id: traderId,
    name: asset.name,
    value_usdc: asset.valueUsdc ?? 0,
    source_deal_id: asset.sourceDealId ?? null,
    source_outcome_id: asset.sourceOutcomeId ?? null,
    acquired_at: new Date(asset.acquiredAt).toISOString(),
  };
}

export function useTraderAssets(traderId: string) {
  const rows = useConvexQuery(
    api.assets.listByTrader,
    traderId ? { traderId: traderId as Id<"traders"> } : "skip"
  );

  if (rows === undefined) {
    return {
      data: undefined as Asset[] | undefined,
      isLoading: true,
      isError: false,
    };
  }

  const data = rows.map((a) => mapConvexAsset(a, traderId));

  return { data, isLoading: false, isError: false };
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

  const data: AgentActivity[] = result.map((entry) => ({
    id: entry._id,
    trader_id: String(entry.traderId),
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

  const data: DealOutcomeWithNarrative[] = result.map((outcome) => ({
    id: outcome._id,
    deal_id: outcome.dealId,
    trader_id: String(outcome.traderId),
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
    on_chain_tx_hash: realTxHashOrNull(outcome.onChainTxHash),
  }));

  return { data, isLoading: false, isError: false };
}

function useTraderStatusMutation(status: "active" | "paused") {
  // Optimistic: pause/resume reflects immediately in the detail dialog and
  // desk roster; Convex rolls back automatically if the mutation fails.
  const setStatus = useMutation(api.traders.setStatus).withOptimisticUpdate(
    (store, { traderId, status: nextStatus }) => {
      const trader = store.getQuery(api.traders.getById, { traderId });
      if (trader) {
        store.setQuery(
          api.traders.getById,
          { traderId },
          { ...trader, status: nextStatus }
        );
      }
      const roster = store.getQuery(api.traders.listByDesk, {});
      if (roster !== undefined) {
        store.setQuery(
          api.traders.listByDesk,
          {},
          roster.map((row) =>
            row._id === traderId ? { ...row, status: nextStatus } : row
          )
        );
      }
    }
  );
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    (traderId: string) => {
      setPending(true);
      setError(null);
      void setStatus({ traderId: traderId as Id<"traders">, status })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e : new Error(String(e)));
        })
        .finally(() => {
          setPending(false);
        });
    },
    [setStatus, status]
  );

  return { mutate, isPending, isError: !!error, error };
}

export function usePauseTrader() {
  return useTraderStatusMutation("paused");
}

export function useResumeTrader() {
  return useTraderStatusMutation("active");
}

export function useReviveTrader() {
  return useTraderStatusMutation("active");
}
