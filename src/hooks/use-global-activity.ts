"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { AgentActivity } from "./use-agent";

export interface GlobalActivityData {
  activity: AgentActivity[];
  traderNames: Record<string, string>;
}

/** Global activity feed (leaderboard) — Convex subscription, no TanStack. */
export function useGlobalActivity() {
  const result = useQuery(api.agentActivityLog.listRecentGlobal, {
    limit: 100,
  });

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  const activity: AgentActivity[] = result.entries.map((entry) => ({
    id: entry._id,
    trader_id: String(entry.traderId),
    activity_type: entry.activityType,
    message: entry.message,
    deal_id: entry.dealId ?? null,
    metadata: (entry.metadata as Record<string, unknown>) ?? {},
    created_at: new Date(entry.createdAt).toISOString(),
  }));

  return {
    data: {
      activity,
      traderNames: result.traderNames,
    } satisfies GlobalActivityData,
    isLoading: false,
    isError: false,
  };
}
