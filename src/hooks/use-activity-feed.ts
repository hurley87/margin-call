"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { AgentActivity } from "./use-agent";

export interface ActivityFeedData {
  activity: AgentActivity[];
  traderNames: Record<string, string>;
}

/** Reactive activity feed for the authenticated desk manager's traders. */
export function useActivityFeed(): {
  data: ActivityFeedData | undefined;
  isLoading: boolean;
} {
  const result = useQuery(api.agentActivityLog.listForDesk);

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  if (!result || typeof result !== "object" || !("activity" in result)) {
    return { data: { activity: [], traderNames: {} }, isLoading: false };
  }

  const raw = result as {
    activity: {
      _id: string;
      traderId: string;
      activityType: string;
      message: string;
      dealId?: string;
      metadata?: Record<string, unknown>;
      createdAt: number;
    }[];
    traderNames: Record<string, string>;
  };

  const activity: AgentActivity[] = raw.activity.map((a) => ({
    id: a._id,
    trader_id: a.traderId,
    activity_type: a.activityType,
    message: a.message,
    deal_id: a.dealId ?? null,
    metadata: a.metadata ?? {},
    created_at: new Date(a.createdAt).toISOString(),
  }));

  return {
    data: { activity, traderNames: raw.traderNames },
    isLoading: false,
  };
}
