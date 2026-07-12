"use client";

import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface TraderSummary {
  id: string;
  name: string;
  status: string;
  wallet_status: "pending" | "creating" | "ready" | "error";
  last_cycle_at?: number;
  cycle_lease_until?: number;
  wallet_error?: string;
  image_status?: "pending" | "generating" | "ready" | "error";
  profile_image_url: string;
  escrow_usdc: number;
  asset_value_usdc: number;
  total_value_usdc: number;
  total_pnl: number;
  wins: number;
  losses: number;
  wipeouts: number;
  deal_count: number;
  /** Public floor credential — Gallery / Seat / Corner Office. */
  effective_tier: "Gallery" | "Seat" | "CornerOffice";
}

export interface PnlPoint {
  timestamp: string;
  cumulative_pnl: number;
}

export interface PortfolioStats {
  total_wins: number;
  total_losses: number;
  total_wipeouts: number;
  total_pnl: number;
}

export interface Portfolio {
  total_value_usdc: number;
  traders: TraderSummary[];
  pnl_history: PnlPoint[];
  stats: PortfolioStats;
}

export function usePortfolio(): {
  data: Portfolio | undefined;
  isLoading: boolean;
} {
  const result = useConvexQuery(api.portfolio.forDesk);

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  const portfolio: Portfolio = {
    total_value_usdc: result.totalValueUsdc,
    traders: result.traders.map((t) => ({
      id: String(t.id),
      name: t.name,
      status: t.status,
      wallet_status: t.walletStatus,
      last_cycle_at: t.lastCycleAt,
      cycle_lease_until: t.cycleLeaseUntil,
      wallet_error: t.walletError,
      image_status: t.imageStatus,
      profile_image_url: t.profileImageUrl,
      escrow_usdc: t.escrowUsdc,
      asset_value_usdc: t.assetValueUsdc,
      total_value_usdc: t.totalValueUsdc,
      total_pnl: t.totalPnl,
      wins: t.wins,
      losses: t.losses,
      wipeouts: t.wipeouts,
      deal_count: t.dealCount,
      effective_tier: t.effectiveTier,
    })),
    pnl_history: result.pnlHistory.map((p) => ({
      timestamp: new Date(p.createdAt).toISOString(),
      cumulative_pnl: p.cumulativePnl,
    })),
    stats: {
      total_wins: result.stats.totalWins,
      total_losses: result.stats.totalLosses,
      total_wipeouts: result.stats.totalWipeouts,
      total_pnl: result.stats.totalPnl,
    },
  };

  return { data: portfolio, isLoading: false };
}
