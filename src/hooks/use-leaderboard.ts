"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { LeaderboardTrader } from "@/lib/supabase/leaderboard";

/**
 * Reactive leaderboard — backed by Convex subscription.
 * Returns data in the legacy LeaderboardTrader shape for component compatibility.
 */
export function useLeaderboard(): {
  data: LeaderboardTrader[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const result = useQuery(api.leaderboard.topByPnl, {});

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  // Map Convex LeaderboardEntry → legacy LeaderboardTrader interface
  const data: LeaderboardTrader[] = result.map((entry) => ({
    id: entry.traderId,
    name: entry.traderName,
    status: entry.status,
    owner_address: entry.ownerSubject,
    total_pnl: entry.totalPnlUsdc,
    wins: entry.wins,
    losses: entry.losses,
    wipeouts: entry.wipeouts,
    deal_count: entry.dealCount,
    win_rate: entry.winRate,
    total_value: entry.totalValueUsdc,
  }));

  return { data, isLoading: false, isError: false };
}
