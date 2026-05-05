"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { LeaderboardTrader } from "@/lib/supabase/leaderboard";

/** Public leaderboard — Convex subscription. */
export function useLeaderboard() {
  const traders = useQuery(api.leaderboard.listTraderStats, { limit: 50 });

  return {
    data: traders as LeaderboardTrader[] | undefined,
    isLoading: traders === undefined,
    isError: false as const,
  };
}
