"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Reactive activity feed for a single trader (owner-scoped, auth-checked).
 * Returns newest-first, up to `limit` entries (default: all).
 */
export function useConvexTraderActivity(
  traderId: Id<"traders"> | undefined,
  limit?: number
) {
  return useQuery(
    api.agentActivityLog.listByTrader,
    traderId ? { traderId, limit } : "skip"
  );
}

/**
 * Reactive activity feed across all traders owned by the current desk manager.
 * Returns `{ activity, traderNames }` — updates live from Convex subscription.
 */
export function useConvexDeskActivity(limit?: number) {
  return useQuery(api.agentActivityLog.listForDesk, { limit });
}
