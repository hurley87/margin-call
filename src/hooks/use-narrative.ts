"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
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

export interface FeedHeadline {
  headline: string;
  body: string;
  category: string;
  epoch: number;
  created_at: string;
  mood: string;
  sec_heat: number;
}

/**
 * Reactive latest narrative epoch — backed by Convex subscription.
 */
export function useNarrative(): {
  data: Narrative | null | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const result = useQuery(api.narrative.latest, {});

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  if (result === null) {
    return { data: null, isLoading: false, isError: false };
  }

  const data: Narrative = {
    id: result._id,
    epoch: result.epoch,
    headlines: (result.headlines as NarrativeHeadline[]) ?? [],
    world_state: (result.worldState as WorldState) ?? {},
    raw_narrative: result.rawNarrative ?? "",
    events_ingested: [],
    created_at: new Date(result.createdAt).toISOString(),
  };

  return { data, isLoading: false, isError: false };
}

/**
 * Reactive narrative history — backed by Convex subscription.
 */
export function useNarrativeHistory(limit = 10): {
  data: Narrative[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const result = useQuery(api.narrative.history, { limit });

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  const data: Narrative[] = result.map((n) => ({
    id: n._id,
    epoch: n.epoch,
    headlines: (n.headlines as NarrativeHeadline[]) ?? [],
    world_state: (n.worldState as WorldState) ?? {},
    raw_narrative: n.rawNarrative ?? "",
    events_ingested: [],
    created_at: new Date(n.createdAt).toISOString(),
  }));

  return { data, isLoading: false, isError: false };
}

/**
 * Reactive narrative feed of headlines — backed by Convex subscription.
 */
export function useNarrativeFeed(epochs = 20): {
  data: FeedHeadline[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const result = useQuery(api.narrative.feed, { epochs });

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  const data: FeedHeadline[] = result.map((h) => ({
    headline: h.headline,
    body: h.body,
    category: h.category,
    epoch: h.epoch,
    created_at: new Date(h.createdAt).toISOString(),
    mood: h.mood ?? "neutral",
    sec_heat: h.secHeat ?? 0,
  }));

  return { data, isLoading: false, isError: false };
}
