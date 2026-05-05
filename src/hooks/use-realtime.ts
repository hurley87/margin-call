"use client";

import { useEffect } from "react";

interface RealtimeSubscription {
  table: string;
  /** Query keys to invalidate when this table changes */
  queryKeys: string[][];
  /** Optional filter, e.g. "trader_id=eq.abc-123" */
  filter?: string;
}

/**
 * Legacy shim retained while pages migrate fully to Convex subscriptions.
 * No-op by design: Supabase realtime has been removed from runtime paths.
 */
export function useRealtimeInvalidation(subscriptions: RealtimeSubscription[]) {
  useEffect(() => {
    if (subscriptions.length > 0 && process.env.NODE_ENV !== "production") {
      console.warn(
        "[use-realtime] Supabase realtime hooks are deprecated and now no-op."
      );
    }
  }, [subscriptions]);
}

/**
 * Subscribe to realtime updates for the deals list page.
 */
export function useDealsRealtime() {
  useRealtimeInvalidation([
    {
      table: "deals",
      queryKeys: [["deals"]],
    },
    {
      table: "deal_outcomes",
      queryKeys: [["deals"]],
    },
  ]);
}

/**
 * Subscribe to realtime updates for a single deal.
 */
export function useDealRealtime(dealId: string) {
  useRealtimeInvalidation([
    {
      table: "deals",
      filter: `id=eq.${dealId}`,
      queryKeys: [["deal", dealId]],
    },
    {
      table: "deal_outcomes",
      filter: `deal_id=eq.${dealId}`,
      queryKeys: [["deal", dealId]],
    },
  ]);
}

/**
 * Subscribe to realtime updates for the approvals page.
 */
export function useApprovalsRealtime() {
  useRealtimeInvalidation([
    {
      table: "deal_approvals",
      queryKeys: [["pending-approvals"]],
    },
  ]);
}

/**
 * Subscribe to realtime updates for a specific trader.
 */
export function useTraderRealtime(traderId: string) {
  useRealtimeInvalidation([
    {
      table: "traders",
      filter: `id=eq.${traderId}`,
      queryKeys: [["trader", traderId]],
    },
    {
      table: "agent_activity_log",
      filter: `trader_id=eq.${traderId}`,
      queryKeys: [["agent-activity", traderId]],
    },
    {
      table: "deal_outcomes",
      filter: `trader_id=eq.${traderId}`,
      queryKeys: [["trader-outcomes", traderId]],
    },
    {
      table: "assets",
      filter: `trader_id=eq.${traderId}`,
      queryKeys: [["trader-assets", traderId]],
    },
    {
      table: "trader_transactions",
      filter: `trader_id=eq.${traderId}`,
      queryKeys: [["trader-history", traderId]],
    },
    {
      table: "deal_approvals",
      queryKeys: [["pending-approvals"]],
    },
  ]);
}

/**
 * Subscribe to realtime updates for the Market Wire narrative.
 */
export function useNarrativeRealtime() {
  useRealtimeInvalidation([
    {
      table: "market_narratives",
      queryKeys: [["narrative"], ["narrative-history"], ["narrative-feed"]],
    },
  ]);
}

/**
 * Subscribe to realtime updates for the leaderboard + global activity.
 */
export function useLeaderboardRealtime() {
  useRealtimeInvalidation([
    {
      table: "deal_outcomes",
      queryKeys: [["leaderboard"], ["global-activity"]],
    },
    {
      table: "traders",
      queryKeys: [["leaderboard"]],
    },
    {
      table: "agent_activity_log",
      queryKeys: [["global-activity"]],
    },
    {
      table: "assets",
      queryKeys: [["leaderboard"]],
    },
  ]);
}
