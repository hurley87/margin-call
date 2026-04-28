"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** List activity log entries for all traders owned by the current desk manager. Reactive. */
export function useConvexActivityFeed(limit?: number) {
  return useQuery(api.agentActivityLog.listForDesk, limit ? { limit } : {});
}

/** List activity log entries for a specific trader. Reactive. */
export function useConvexTraderActivity(
  traderId: Id<"traders"> | undefined,
  limit?: number
) {
  return useQuery(
    api.agentActivityLog.listByTrader,
    traderId ? { traderId, ...(limit ? { limit } : {}) } : "skip"
  );
}

export type { Id };
