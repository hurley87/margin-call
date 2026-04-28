"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { authFetch } from "@/lib/api";

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

/**
 * Fetch the desk portfolio summary from the API route.
 * Not Convex-backed (Supabase aggregation) — plain fetch, no TanStack Query.
 */
export function usePortfolio(): {
  data: Portfolio | undefined;
  isLoading: boolean;
} {
  const { authenticated } = usePrivy();
  const [state, setState] = useState<{
    data: Portfolio | undefined;
    isLoading: boolean;
  }>({ data: undefined, isLoading: !!authenticated });

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    authFetch("/api/desk/portfolio")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load portfolio");
        return res.json();
      })
      .then((json: Portfolio) => {
        if (!cancelled) {
          setState({ data: json, isLoading: false });
        }
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, isLoading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  return state;
}
