import { useQuery } from "@tanstack/react-query";

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

export function useLeaderboard() {
  return useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to load leaderboard");
      const data = await res.json();
      return (data.traders ?? []) as LeaderboardTrader[];
    },
  });
}
