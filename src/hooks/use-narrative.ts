"use client";

import { useQuery } from "convex/react";
import type { Doc } from "../../convex/_generated/dataModel";
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

function mapNarrative(doc: Doc<"marketNarratives">): Narrative {
  return {
    id: doc._id,
    epoch: doc.epoch,
    headlines: (doc.headlines ?? []) as NarrativeHeadline[],
    world_state: (doc.worldState ?? {}) as WorldState,
    raw_narrative: doc.rawNarrative,
    events_ingested: (doc.eventsIngested ?? []) as unknown[],
    created_at: new Date(doc.createdAt).toISOString(),
  };
}

export function useNarrative() {
  const doc = useQuery(api.marketNarratives.getLatest);

  return {
    data:
      doc === undefined ? undefined : doc === null ? null : mapNarrative(doc),
    isLoading: doc === undefined,
    isError: false,
  };
}

export function useNarrativeHistory(limit = 10) {
  const docs = useQuery(api.marketNarratives.listRecentEpochs, { limit });

  return {
    data: docs === undefined ? undefined : docs.map(mapNarrative),
    isLoading: docs === undefined,
    isError: false,
  };
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
  const feed = useQuery(api.marketNarratives.feedHeadlines, {
    maxEpochs: epochs,
  });

  return {
    data: feed === undefined ? undefined : (feed as FeedHeadline[]),
    isLoading: feed === undefined,
    isError: false,
  };
}
