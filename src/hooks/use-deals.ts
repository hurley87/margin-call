"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Doc } from "../../convex/_generated/dataModel";
import { authFetch } from "@/lib/api";
import { realTxHashOrNull } from "@/lib/tx-hash";

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
  /** Populated for desk_manager creators via lightweight desk join in Convex list/get queries (public Wire + detail surfaces). */
  creator_is_agent_desk?: boolean;
}

export interface DealOutcome {
  id: string;
  deal_id: string;
  trader_id: string;
  trader_name?: string;
  /** Public floor credential — Gallery / Seat / Corner Office. */
  effective_tier?: "Gallery" | "Seat" | "CornerOffice";
  trader_pnl_usdc: number;
  pot_change_usdc: number;
  pot_change_inferred: boolean;
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
    on_chain_tx_hash: realTxHashOrNull(deal.onChainTxHash),
    creator_address: deal.creatorAddress,
    source_headline: deal.sourceHeadline,
  };
}

type DealOutcomeDoc = Doc<"dealOutcomes"> & {
  traderName?: string;
  effectiveTier?: "Gallery" | "Seat" | "CornerOffice";
};

function mapConvexOutcome(o: DealOutcomeDoc): DealOutcome {
  const traderPnlUsdc = o.traderPnlUsdc ?? 0;
  const rakeUsdc = o.rakeUsdc ?? 0;
  const potChangeInferred = o.potChangeUsdc === undefined;
  const potChangeUsdc =
    o.potChangeUsdc ??
    (traderPnlUsdc > 0 ? -(traderPnlUsdc + rakeUsdc) : Math.abs(traderPnlUsdc));

  return {
    id: o._id,
    deal_id: o.dealId,
    trader_id: String(o.traderId),
    trader_name: o.traderName,
    effective_tier: o.effectiveTier,
    trader_pnl_usdc: traderPnlUsdc,
    pot_change_usdc: potChangeUsdc,
    pot_change_inferred: potChangeInferred,
    rake_usdc: rakeUsdc,
    narrative: (o.narrative as DealOutcome["narrative"]) ?? "",
    trader_wiped_out: o.traderWipedOut ?? false,
    wipeout_reason: o.wipeoutReason,
    assets_gained:
      (o.assetsGained as { name: string; value_usdc: number }[]) ?? [],
    assets_lost: (o.assetsLost as string[]) ?? [],
    created_at: new Date(o.createdAt).toISOString(),
    on_chain_tx_hash: realTxHashOrNull(o.onChainTxHash),
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
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const convexId = id as Id<"deals">;
  const shouldQuery = Boolean(id) && !isAuthLoading && isAuthenticated;

  const rawDeal = useConvexQuery(
    api.deals.getById,
    shouldQuery ? { dealId: convexId } : "skip"
  );

  const rawOutcomes = useConvexQuery(
    api.dealOutcomes.listByDeal,
    shouldQuery ? { dealId: convexId } : "skip"
  );

  if (!id) {
    return {
      data: undefined as { deal: Deal; outcomes: DealOutcome[] } | undefined,
      isLoading: false,
      error: new Error("Deal not found"),
    };
  }

  if (isAuthLoading) {
    return { data: undefined, isLoading: true, error: null };
  }

  if (!isAuthenticated) {
    return {
      data: undefined,
      isLoading: false,
      error: new Error("Authentication required"),
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

/** A settled suggestion request, tagged with the inputs that produced it. */
interface SuggestPromptsResult {
  theme: string;
  attempt: number;
  data?: string[];
  error: Error | null;
}

export function useSuggestPrompts(theme: string, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<SuggestPromptsResult | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await authFetch("/api/prompt/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme }),
          signal: controller.signal,
        });
        const payload = await res.json();
        if (!res.ok)
          throw new Error(payload.error || "Failed to suggest prompts");
        setSettled({
          theme,
          attempt,
          data: payload.suggestions as string[],
          error: null,
        });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setSettled({
          theme,
          attempt,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [theme, attempt, enabled]);

  // Pending is derived rather than stored, so the effect never has to write
  // state synchronously. A result only counts once it matches the theme and
  // attempt currently being requested, which also drops late/stale responses.
  const current =
    settled?.theme === theme && settled.attempt === attempt ? settled : null;

  return {
    data: current?.data,
    isPending: enabled && current === null,
    isError: current?.error != null,
    error: current?.error ?? null,
    refetch: () => setAttempt((n) => n + 1),
  };
}
