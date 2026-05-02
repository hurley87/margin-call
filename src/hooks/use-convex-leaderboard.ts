"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/** Shape of a leaderboard row returned from Convex. */
export interface LeaderboardEntry {
  traderId: string;
  traderName: string;
  status: "active" | "paused" | "wiped_out";
  ownerSubject: string;
  totalPnlUsdc: number;
  wins: number;
  losses: number;
  wipeouts: number;
  dealCount: number;
  winRate: number;
  totalValueUsdc: number;
}

/**
 * Reactive leaderboard — top traders by PnL, live from Convex.
 * Aggregation is computed on read from the deduplicated dealOutcomes table
 * so replays and retries do not double-count scores.
 */
export function useConvexLeaderboard(limit?: number) {
  return useQuery(api.leaderboard.topByPnl, { limit });
}

/**
 * Reactive leaderboard scoped to the authenticated desk manager's traders.
 */
export function useConvexDeskLeaderboard() {
  return useQuery(api.leaderboard.byDesk, {});
}
