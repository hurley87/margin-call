"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { AgentActivity } from "./use-agent";

export interface ActivityFeedData {
  activity: AgentActivity[];
  traderNames: Record<string, string>;
}

/**
 * Reactive activity feed for all traders owned by the desk manager.
 * Backed by Convex subscription — live updates without polling or cache invalidation.
 */
export function useActivityFeed(): {
  data: ActivityFeedData | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const result = useQuery(api.agentActivityLog.listForDesk, { limit: 200 });

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  // listForDesk returns { activity, traderNames } | []
  // When no desk manager is found, returns []
  if (Array.isArray(result)) {
    return {
      data: { activity: [], traderNames: {} },
      isLoading: false,
      isError: false,
    };
  }

  // Map Convex camelCase → legacy snake_case AgentActivity interface
  const activity: AgentActivity[] = result.activity.map((entry) => ({
    id: entry._id,
    trader_id: entry.traderId,
    activity_type: entry.activityType,
    message: entry.message,
    deal_id: entry.dealId ?? null,
    metadata: (entry.metadata as Record<string, unknown>) ?? {},
    created_at: new Date(entry.createdAt).toISOString(),
  }));

  return {
    data: {
      activity,
      traderNames: result.traderNames as Record<string, string>,
    },
    isLoading: false,
    isError: false,
  };
}
