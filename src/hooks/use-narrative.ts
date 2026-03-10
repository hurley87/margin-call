import { useQuery } from "@tanstack/react-query";
import type { NarrativeHeadline, WorldState } from "@/lib/llm/schemas";

export type { NarrativeHeadline, WorldState };

export interface Narrative {
  id: string;
  epoch: number;
  headlines: NarrativeHeadline[];
  world_state: WorldState;
  raw_narrative: string;
  events_ingested: unknown[];
  created_at: string;
}

export function useNarrative() {
  return useQuery({
    queryKey: ["narrative"],
    queryFn: async () => {
      const res = await fetch("/api/narrative/current");
      if (!res.ok) throw new Error("Failed to load narrative");
      const data = await res.json();
      return data.narrative as Narrative | null;
    },
    refetchInterval: 60_000,
  });
}

export function useNarrativeHistory(limit = 10) {
  return useQuery({
    queryKey: ["narrative-history", limit],
    queryFn: async () => {
      const res = await fetch(`/api/narrative/history?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to load narrative history");
      const data = await res.json();
      return (data.narratives ?? []) as Narrative[];
    },
  });
}

export interface FeedHeadline {
  headline: string;
  body: string;
  category: string;
  epoch: number;
  created_at: string;
  mood: string;
  sec_heat: number;
}

export function useNarrativeFeed(epochs = 20) {
  return useQuery({
    queryKey: ["narrative-feed", epochs],
    queryFn: async () => {
      const res = await fetch(`/api/narrative/feed?epochs=${epochs}`);
      if (!res.ok) throw new Error("Failed to load narrative feed");
      const data = await res.json();
      return (data.feed ?? []) as FeedHeadline[];
    },
    refetchInterval: 60_000,
  });
}
