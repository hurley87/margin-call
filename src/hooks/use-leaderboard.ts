import { useQuery } from "@tanstack/react-query";

export interface LeaderboardTrader {
  id: string;
  name: string;
  status: "active" | "paused" | "wiped_out";
  total_value: number;
  total_pnl: number;
  wins: number;
  losses: number;
  wipeouts: number;
  win_rate: number;
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
