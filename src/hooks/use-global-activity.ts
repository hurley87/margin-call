"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { AgentActivity } from "./use-agent";
import type { TraderProfile } from "./use-activity-feed";
import { OUTCOME_ACTIVITY_TYPES } from "@/components/feed-line";

export interface GlobalActivityData {
  activity: AgentActivity[];
  traderNames: Record<string, string>;
  traderProfiles: Record<string, TraderProfile>;
}

/** Outcomes only — wins and losses (incl. wipeouts) across every desk. */
export const RELEVANT_FLOOR_ACTIVITY = OUTCOME_ACTIVITY_TYPES;

/** Global activity feed (leaderboard) — Convex subscription, no TanStack. */
export function useGlobalActivity(activityTypes?: string[]) {
  const result = useQuery(api.agentActivityLog.listRecentGlobal, {
    limit: 100,
    activityTypes,
  });

  const data = useMemo<GlobalActivityData | undefined>(() => {
    if (result === undefined) return undefined;
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
      activity,
      traderNames: result.traderNames,
      traderProfiles: result.traderProfiles,
    };
  }, [result]);

  return {
    data,
    isLoading: data === undefined,
    isError: false,
  };
}
