"use client";

/**
 * Narrative hooks — partially migrated to Convex.
 *
 * useNarrative → migrated to api.marketNarratives.getLatest
 * useNarrativeHistory → no Convex query (list + pagination not available yet)
 * useNarrativeFeed → no Convex query (feed format not modeled)
 *
 * History and feed are stubbed. Flagged for PR #103 follow-up.
 */

import { useQuery as useConvexQuery } from "convex/react";
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

type RawNarrative = {
  _id: string;
  epoch: number;
  headlines: unknown;
  worldState: unknown;
  rawNarrative: string;
  eventsIngested?: unknown;
  createdAt: number;
};

function toNarrative(doc: RawNarrative): Narrative {
  return {
    id: doc._id,
    epoch: doc.epoch,
    headlines: (doc.headlines as NarrativeHeadline[]) ?? [],
    world_state: (doc.worldState as WorldState) ?? ({} as WorldState),
    raw_narrative: doc.rawNarrative,
    events_ingested: (doc.eventsIngested as unknown[]) ?? [],
    created_at: new Date(doc.createdAt).toISOString(),
  };
}

/** Get the latest market narrative. Reactive via Convex. */
export function useNarrative() {
  const result = useConvexQuery(api.marketNarratives.getLatest);

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  return {
    data: result ? toNarrative(result as RawNarrative) : null,
    isLoading: false,
  };
}

/**
 * Narrative history — no Convex list query yet.
 * Returns empty array. Flagged for PR #103 follow-up.
 *
 * @deprecated Stub — awaiting Convex marketNarratives.list query.
 */
export function useNarrativeHistory(_limit = 10) {
  return { data: [] as Narrative[], isLoading: false };
}

/**
 * Narrative feed (headlines formatted as wire items) — no Convex query yet.
 * Derives feed items from the latest narrative's headlines where possible.
 *
 * @deprecated Partial stub — only shows current epoch headlines.
 */
export function useNarrativeFeed(_epochs = 20) {
  const result = useConvexQuery(api.marketNarratives.getLatest);

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  if (!result) {
    return { data: [] as FeedHeadline[], isLoading: false };
  }

  const raw = result as RawNarrative;
  const headlines = (raw.headlines as NarrativeHeadline[]) ?? [];
  const worldState = (raw.worldState as WorldState) ?? null;
  const created_at = new Date(raw.createdAt).toISOString();

  const feed: FeedHeadline[] = headlines.map((h) => ({
    headline: h.headline ?? "",
    body: h.body ?? "",
    category: h.category ?? "GENERAL",
    epoch: raw.epoch,
    created_at,
    mood: worldState?.mood ?? "neutral",
    sec_heat: worldState?.sec_heat ?? 0,
  }));

  return { data: feed, isLoading: false };
}
