"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { AgentActivity } from "./use-agent";

export interface GlobalActivityData {
  activity: AgentActivity[];
  traderNames: Record<string, string>;
}

/**
 * Reactive global activity feed — all traders, newest-first.
 * Backed by Convex subscription — live updates without polling.
 */
export function useGlobalActivity(): {
  data: GlobalActivityData | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const result = useQuery(api.agentActivityLog.listGlobal, {});

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
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
