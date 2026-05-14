"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { PublicPortraitTraits } from "@/lib/trader-metadata";

/** Shape returned by Convex `leaderboard.listTraderStats` — matches leaderboard UI expectations. */
export interface LeaderboardTrader {
  id: string;
  name: string;
  status: string;
  owner_address: string;
  imageStatus: "pending" | "generating" | "ready" | "error" | null;
  profileImageUrl: string;
  traits: PublicPortraitTraits | null;
  total_pnl: number;
  wins: number;
  losses: number;
  wipeouts: number;
  deal_count: number;
  win_rate: number;
  total_value: number;
}

/** Public leaderboard — Convex subscription. */
export function useLeaderboard() {
  const traders = useQuery(api.leaderboard.listTraderStats, { limit: 50 });

  return {
    data: traders as LeaderboardTrader[] | undefined,
    isLoading: traders === undefined,
    isError: false as const,
  };
}
