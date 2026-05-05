"use client";

import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface TraderSummary {
  id: string;
  name: string;
  status: string;
  escrow_usdc: number;
  asset_value_usdc: number;
  total_value_usdc: number;
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
      escrow_usdc: t.escrowUsdc,
      asset_value_usdc: t.assetValueUsdc,
      total_value_usdc: t.totalValueUsdc,
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
