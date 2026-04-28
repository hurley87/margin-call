"use client";

/**
 * Portfolio hook — no direct Convex aggregate query yet.
 * Derives portfolio stats from traders reactive query.
 *
 * usePortfolio is stubbed to return data derived from useConvexTraders.
 * A proper portfolio aggregate query is flagged for PR #103 follow-up.
 */

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

type RawTrader = {
  _id: string;
  name: string;
  status: string;
  escrowBalanceUsdc?: number;
};

/**
 * Portfolio hook — derives from Convex traders query.
 * Asset values and PnL history are not yet aggregated server-side.
 * Flagged for follow-up in PR #103.
 */
export function usePortfolio() {
  const result = useConvexQuery(api.traders.listByDesk);

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  const traders: TraderSummary[] = (result as RawTrader[]).map((t) => ({
    id: t._id,
    name: t.name,
    status: t.status,
    escrow_usdc: t.escrowBalanceUsdc ?? 0,
    asset_value_usdc: 0, // not yet aggregated — PR #103
    total_value_usdc: t.escrowBalanceUsdc ?? 0,
  }));

  const total_value_usdc = traders.reduce((s, t) => s + t.total_value_usdc, 0);

  const data: Portfolio = {
    total_value_usdc,
    traders,
    pnl_history: [],
    stats: {
      total_wins: 0,
      total_losses: 0,
      total_wipeouts: 0,
      total_pnl: 0,
    },
  };

  return { data, isLoading: false };
}
