import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { authFetch } from "@/lib/api";
import type { AgentActivity } from "./use-agent";

export interface ActivityFeedData {
  activity: AgentActivity[];
  traderNames: Record<string, string>;
}

export function useActivityFeed() {
  const { authenticated } = usePrivy();

  return useQuery({
    queryKey: ["activity-feed"],
    queryFn: async () => {
      const res = await authFetch("/api/desk/activity");
      if (!res.ok) throw new Error("Failed to load activity feed");
      return (await res.json()) as ActivityFeedData;
    },
    enabled: authenticated,
  });
}
