import { useQuery } from "@tanstack/react-query";
import type { LeaderboardTrader } from "@/lib/supabase/leaderboard";

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
