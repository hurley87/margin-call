"use client";

import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase/client";

interface RealtimeSubscription {
  table: string;
  /** Query keys to invalidate when this table changes */
  queryKeys: string[][];
  /** Optional filter, e.g. "trader_id=eq.abc-123" */
  filter?: string;
}

function buildSubscriptionSignature(subscriptions: RealtimeSubscription[]) {
  return JSON.stringify(
    subscriptions.map((subscription) => ({
      table: subscription.table,
      filter: subscription.filter ?? null,
      queryKeys: subscription.queryKeys,
    }))
  );
}

/**
 * Subscribe to Supabase Realtime changes and invalidate TanStack Query caches.
 * Replaces polling with push-based updates.
 */
export function useRealtimeInvalidation(subscriptions: RealtimeSubscription[]) {
  const queryClient = useQueryClient();
  const subscriptionSignature = buildSubscriptionSignature(subscriptions);

  // Stabilize the subscriptions array reference — only update when the
  // serialized signature changes, so the effect doesn't re-run on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableSubscriptions = useMemo(
    () => subscriptions,
    [subscriptionSignature]
  );

  useEffect(() => {
    if (stableSubscriptions.length === 0) return;

    const supabase = createBrowserClient();
    const channel = supabase.channel("realtime-invalidation");

    for (const sub of stableSubscriptions) {
      const config: {
        event: "INSERT" | "UPDATE" | "DELETE" | "*";
        schema: string;
        table: string;
        filter?: string;
      } = {
        event: "*",
        schema: "public",
        table: sub.table,
      };
      if (sub.filter) {
        config.filter = sub.filter;
      }

      channel.on("postgres_changes" as never, config, () => {
        for (const key of sub.queryKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      });
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, stableSubscriptions]);
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
  ]);
}

/**
 * Subscribe to realtime updates for the dashboard (portfolio-level).
 */
export function useDashboardRealtime() {
  useRealtimeInvalidation([
    {
      table: "deal_outcomes",
      queryKeys: [["portfolio"]],
    },
    {
      table: "traders",
      queryKeys: [["traders"], ["portfolio"]],
    },
    {
      table: "deals",
      queryKeys: [["deals"], ["my-deals"], ["portfolio"]],
    },
    {
      table: "deal_approvals",
      queryKeys: [["pending-approvals"]],
    },
    {
      table: "agent_activity_log",
      queryKeys: [["activity-feed"]],
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
