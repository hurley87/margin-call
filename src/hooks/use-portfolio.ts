import { useQuery } from "@tanstack/react-query";
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

export function usePortfolio() {
  const { authenticated } = usePrivy();

  return useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await authFetch("/api/desk/portfolio");
      if (!res.ok) throw new Error("Failed to load portfolio");
      return (await res.json()) as Portfolio;
    },
    enabled: authenticated,
  });
}
