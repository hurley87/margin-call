"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export type ConvexNarrative = Doc<"marketNarratives">;

export interface ConvexFeedHeadline {
  headline: string;
  body: string;
  category: string;
  epoch: number;
  createdAt: number;
  mood: string;
  secHeat: number;
}

/**
 * Reactive latest narrative epoch — updates live from Convex subscription.
 */
export function useConvexNarrative() {
  return useQuery(api.narrative.latest, {});
}

/**
 * Reactive history of narrative epochs, newest-first.
 */
export function useConvexNarrativeHistory(limit = 10) {
  return useQuery(api.narrative.history, { limit });
}

/**
 * Reactive flattened feed of headlines from recent epochs.
 * Each entry carries mood and SEC heat from the parent epoch's world state.
 */
export function useConvexNarrativeFeed(epochs = 20) {
  return useQuery(api.narrative.feed, { epochs });
}
