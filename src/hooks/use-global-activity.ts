import { useQuery } from "@tanstack/react-query";
import type { AgentActivity } from "./use-agent";

export interface GlobalActivityData {
  activity: AgentActivity[];
  traderNames: Record<string, string>;
}

export function useGlobalActivity() {
  return useQuery({
    queryKey: ["global-activity"],
    queryFn: async () => {
      const res = await fetch("/api/activity/global");
      if (!res.ok) throw new Error("Failed to load global activity");
      return (await res.json()) as GlobalActivityData;
    },
  });
}
