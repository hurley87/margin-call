"use client";

/**
 * Leaderboard hook — no Convex aggregate query yet.
 *
 * The old /api/leaderboard computed aggregate P&L, win rates, etc. server-side.
 * No Convex equivalent exists. Stubbed to return empty data.
 * Flagged for PR #103 follow-up.
 *
 * The leaderboard page will show "no data" until a Convex leaderboard query
 * is added.
 */

export interface LeaderboardTrader {
  id: string;
  name: string;
  status: string;
  owner_address: string;
  total_pnl: number;
  wins: number;
  losses: number;
  wipeouts: number;
  deal_count: number;
  win_rate: number;
  total_value: number;
}

/** @deprecated No Convex leaderboard query yet. Returns empty. Flag: PR #103. */
export function useLeaderboard() {
  return {
    data: [] as LeaderboardTrader[],
    isLoading: false,
  };
}
