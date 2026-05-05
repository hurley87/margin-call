"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Doc } from "../../convex/_generated/dataModel";
import { authFetch } from "@/lib/api";

export interface Deal {
  id: string;
  creator_id?: string;
  creator_type: "desk_manager" | "agent";
  on_chain_deal_id?: number;
  prompt: string;
  pot_usdc: number;
  entry_cost_usdc: number;
  fee_usdc?: number;
  max_extraction_percentage: number;
  entry_count: number;
  wipeout_count: number;
  status: string;
  created_at: string;
  updated_at: string;
  on_chain_tx_hash?: string;
  creator_address?: string;
  source_headline?: string;
}

export interface DealOutcome {
  id: string;
  deal_id: string;
  trader_id: string;
  trader_pnl_usdc: number;
  pot_change_usdc: number;
  rake_usdc: number;
  narrative: string | { event: string; description: string }[];
  trader_wiped_out: boolean;
  wipeout_reason?: string;
  assets_gained: { name: string; value_usdc: number }[];
  assets_lost: string[];
  created_at: string;
  on_chain_tx_hash?: string;
}

function mapConvexDeal(deal: Doc<"deals">): Deal {
  return {
    id: deal._id,
    creator_id: deal.creatorDeskManagerId,
    creator_type: deal.creatorType,
    on_chain_deal_id: deal.onChainDealId,
    prompt: deal.prompt,
    pot_usdc: deal.potUsdc,
    entry_cost_usdc: deal.entryCostUsdc,
    fee_usdc: deal.feeUsdc,
    max_extraction_percentage: deal.maxExtractionPercentage ?? 0,
    entry_count: deal.entryCount ?? 0,
    wipeout_count: deal.wipeoutCount ?? 0,
    status: deal.status,
    created_at: new Date(deal.createdAt).toISOString(),
    updated_at: new Date(deal.updatedAt).toISOString(),
    on_chain_tx_hash: deal.onChainTxHash,
    creator_address: deal.creatorAddress,
    source_headline: deal.sourceHeadline,
  };
}

function mapConvexOutcome(o: Doc<"dealOutcomes">): DealOutcome {
  return {
    id: o._id,
    deal_id: o.dealId,
    trader_id: String(o.traderId),
    trader_pnl_usdc: o.traderPnlUsdc ?? 0,
    pot_change_usdc: o.potChangeUsdc ?? 0,
    rake_usdc: o.rakeUsdc ?? 0,
    narrative: (o.narrative as DealOutcome["narrative"]) ?? "",
    trader_wiped_out: o.traderWipedOut ?? false,
    wipeout_reason: o.wipeoutReason,
    assets_gained:
      (o.assetsGained as { name: string; value_usdc: number }[]) ?? [],
    assets_lost: (o.assetsLost as string[]) ?? [],
    created_at: new Date(o.createdAt).toISOString(),
    on_chain_tx_hash: o.onChainTxHash,
  };
}

/**
 * Returns all deals (any status) visible to the authenticated user.
 * Backed by Convex subscription — live updates without polling.
 */
export function useDeals(): {
  data: Deal[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const result = useConvexQuery(api.deals.list);

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  const data: Deal[] = result.map(mapConvexDeal);

  return { data, isLoading: false, isError: false };
}

/**
 * Returns deals created by the current desk manager.
 * Backed by Convex subscription — live updates without polling.
 */
export function useMyDeals(): {
  data: Deal[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const result = useConvexQuery(api.deals.listMine);

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  const data: Deal[] = result.map(mapConvexDeal);

  return { data, isLoading: false, isError: false };
}

export function useDeal(id: string) {
  const convexId = id as Id<"deals">;

  const rawDeal = useConvexQuery(
    api.deals.getById,
    id ? { dealId: convexId } : "skip"
  );

  const rawOutcomes = useConvexQuery(
    api.dealOutcomes.listByDeal,
    id ? { dealId: convexId } : "skip"
  );

  if (!id) {
    return {
      data: undefined as { deal: Deal; outcomes: DealOutcome[] } | undefined,
      isLoading: false,
      error: new Error("Deal not found"),
    };
  }

  if (rawDeal === undefined || rawOutcomes === undefined) {
    return { data: undefined, isLoading: true, error: null };
  }

  if (rawDeal === null) {
    return {
      data: undefined,
      isLoading: false,
      error: new Error("Deal not found"),
    };
  }

  return {
    data: {
      deal: mapConvexDeal(rawDeal),
      outcomes: rawOutcomes.map(mapConvexOutcome),
    },
    isLoading: false,
    error: null,
  };
}

/**
 * Returns a map of headline text → deals created from that headline.
 * Backed by Convex subscription.
 */
export function useHeadlineDeals(): {
  data: Record<string, Deal[]> | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const { data: deals, isLoading, isError } = useDeals();

  if (!deals) return { data: undefined, isLoading, isError };

  const map: Record<string, Deal[]> = {};
  for (const d of deals) {
    if (!d.source_headline) continue;
    if (!map[d.source_headline]) map[d.source_headline] = [];
    map[d.source_headline].push(d);
  }

  return { data: map, isLoading: false, isError: false };
}

export function useSuggestPrompts(theme: string) {
  const [data, setData] = useState<string[] | undefined>(undefined);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const res = await authFetch("/api/prompt/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      const payload = await res.json();
      if (!res.ok)
        throw new Error(payload.error || "Failed to suggest prompts");
      setData(payload.suggestions as string[]);
    } catch (e) {
      setData(undefined);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setPending(false);
    }
  }, [theme]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    isPending,
    isError: !!error,
    error,
    refetch: load,
  };
}
