"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** List deal outcomes for a specific trader. Reactive. */
export function useConvexTraderOutcomes(traderId: Id<"traders"> | undefined) {
  return useQuery(
    api.dealOutcomes.listByTrader,
    traderId ? { traderId } : "skip"
  );
}

/** List deal outcomes for a specific deal. Reactive. */
export function useConvexDealOutcomes(dealId: Id<"deals"> | undefined) {
  return useQuery(api.dealOutcomes.listByDeal, dealId ? { dealId } : "skip");
}

export type { Id };
