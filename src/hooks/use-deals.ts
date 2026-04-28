"use client";

/**
 * Deal hooks — migrated to Convex.
 *
 * useSuggestPrompts still calls /api/prompt/suggest (kept route).
 */

import { useQuery as useConvexQuery } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authFetch } from "@/lib/api";

// ── Types (kept snake_case for UI compatibility) ──────────────────────────────

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

type RawDeal = {
  _id: string;
  creatorDeskManagerId?: string;
  creatorAddress?: string;
  creatorType: "desk_manager" | "agent";
  onChainDealId?: number;
  prompt: string;
  potUsdc: number;
  entryCostUsdc: number;
  feeUsdc?: number;
  maxExtractionPercentage?: number;
  entryCount?: number;
  wipeoutCount?: number;
  status: string;
  onChainTxHash?: string;
  sourceHeadline?: string;
  createdAt: number;
  updatedAt: number;
};

function toDeal(doc: RawDeal): Deal {
  return {
    id: doc._id,
    creator_id: doc.creatorDeskManagerId,
    creator_type: doc.creatorType,
    on_chain_deal_id: doc.onChainDealId,
    prompt: doc.prompt,
    pot_usdc: doc.potUsdc,
    entry_cost_usdc: doc.entryCostUsdc,
    fee_usdc: doc.feeUsdc,
    max_extraction_percentage: doc.maxExtractionPercentage ?? 100,
    entry_count: doc.entryCount ?? 0,
    wipeout_count: doc.wipeoutCount ?? 0,
    status: doc.status,
    created_at: new Date(doc.createdAt).toISOString(),
    updated_at: new Date(doc.updatedAt).toISOString(),
    on_chain_tx_hash: doc.onChainTxHash,
    creator_address: doc.creatorAddress,
    source_headline: doc.sourceHeadline,
  };
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/** List all deals. Reactive via Convex. */
export function useDeals() {
  const result = useConvexQuery(api.deals.list);

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  return { data: (result as RawDeal[]).map(toDeal), isLoading: false };
}

/** List deals created by the current desk manager. Reactive via Convex. */
export function useMyDeals() {
  const result = useConvexQuery(api.deals.listMine);

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  return { data: (result as RawDeal[]).map(toDeal), isLoading: false };
}

/** Get a single deal by id. Reactive via Convex. */
export function useDeal(id: string) {
  const result = useConvexQuery(
    api.deals.getById,
    id ? { dealId: id as Id<"deals"> } : "skip"
  );

  if (result === undefined) {
    return { data: undefined, isLoading: true, error: null };
  }

  if (result === null) {
    return {
      data: undefined,
      isLoading: false,
      error: new Error("Deal not found"),
    };
  }

  return {
    data: { deal: toDeal(result as RawDeal), outcomes: [] as DealOutcome[] },
    isLoading: false,
    error: null,
  };
}

/** Returns a map of headline text → deals from that headline. Reactive via Convex. */
export function useHeadlineDeals() {
  const result = useConvexQuery(api.deals.list);

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  const deals = (result as RawDeal[]).map(toDeal);
  const map: Record<string, Deal[]> = {};
  for (const d of deals) {
    if (!d.source_headline) continue;
    if (!map[d.source_headline]) map[d.source_headline] = [];
    map[d.source_headline].push(d);
  }

  return { data: map, isLoading: false };
}

/** Suggest deal prompts from /api/prompt/suggest (kept route). Uses TanStack Query. */
export function useSuggestPrompts(theme: string) {
  return useQuery({
    queryKey: ["suggest-prompts", theme],
    queryFn: async () => {
      const res = await authFetch("/api/prompt/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to suggest prompts");
      return data.suggestions as string[];
    },
  });
}
