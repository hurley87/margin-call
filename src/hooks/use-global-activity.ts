"use client";

/**
 * Global activity hook — migrated to Convex.
 *
 * NOTE: The old /api/activity/global endpoint returned activity for ALL traders
 * publicly. The Convex listForDesk query is scoped to the authenticated desk
 * manager's traders. A public/global view has no Convex equivalent yet.
 * Flagged for PR #103 follow-up.
 *
 * For now, the leaderboard page shows the authenticated user's own activity.
 */

import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { AgentActivity } from "./use-agent";

export interface GlobalActivityData {
  activity: AgentActivity[];
  traderNames: Record<string, string>;
}

/** Activity feed scoped to the authenticated desk manager's traders. Reactive via Convex. */
export function useGlobalActivity(): {
  data: GlobalActivityData | undefined;
  isLoading: boolean;
} {
  const result = useConvexQuery(api.agentActivityLog.listForDesk);

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

  return { data: { activity, traderNames: raw.traderNames }, isLoading: false };
}
