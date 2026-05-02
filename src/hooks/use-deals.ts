"use client";

import { useEffect, useState } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapConvexDeal(deal: Record<string, any>): Deal {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (result as any[]).map(mapConvexDeal), isLoading: false, isError: false };
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (result as any[]).map(mapConvexDeal), isLoading: false, isError: false };
}

/**
 * Returns a single deal with its outcomes.
 * Deal backed by Convex subscription; outcomes fetched from Convex separately.
 */
export function useDeal(id: string): {
  data: { deal: Deal; outcomes: DealOutcome[] } | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const dealResult = useConvexQuery(
    api.deals.getById,
    id ? { dealId: id as Id<"deals"> } : "skip"
  );
  const outcomesResult = useConvexQuery(
    api.dealOutcomes.listByDeal,
    id ? { dealId: id as Id<"deals"> } : "skip"
  );

  if (dealResult === undefined || outcomesResult === undefined) {
    return { data: undefined, isLoading: true, error: null };
  }

  if (dealResult === null) {
    return { data: undefined, isLoading: false, error: new Error("Deal not found") };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deal = mapConvexDeal(dealResult as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outcomes: DealOutcome[] = (outcomesResult as any[]).map((o) => ({
    id: o._id,
    deal_id: o.dealId,
    trader_id: o.traderId,
    trader_pnl_usdc: o.traderPnlUsdc ?? 0,
    pot_change_usdc: o.potChangeUsdc ?? 0,
    rake_usdc: o.rakeUsdc ?? 0,
    narrative: o.narrative ?? "",
    trader_wiped_out: o.traderWipedOut ?? false,
    wipeout_reason: o.wipeoutReason,
    assets_gained: o.assetsGained ?? [],
    assets_lost: o.assetsLost ?? [],
    created_at: new Date(o.createdAt).toISOString(),
    on_chain_tx_hash: o.onChainTxHash,
  }));

  return { data: { deal, outcomes }, isLoading: false, error: null };
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

/**
 * Suggest deal prompts for a given theme.
 * Not Convex-backed — plain fetch.
 */
export function useSuggestPrompts(theme: string): {
  data: string[] | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const [data, setData] = useState<string[] | undefined>(undefined);
  const [isPending, setIsPending] = useState(!!theme);
  const [isError, setIsError] = useState(false);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (!theme) return;
    let cancelled = false;
    setIsPending(true);
    setIsError(false);
    authFetch("/api/prompt/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!cancelled) {
          if (!ok) throw new Error(json.error || "Failed to suggest prompts");
          setData(json.suggestions as string[]);
          setIsPending(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsError(true);
          setIsPending(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, rev]);

  return { data, isPending, isError, refetch: () => setRev((r) => r + 1) };
}
