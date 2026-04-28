"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Get the latest market narrative. Reactive.
 * Note: history and feed endpoints have no Convex replacement yet — flagged for follow-up.
 */
export function useConvexNarrative() {
  return useQuery(api.marketNarratives.getLatest);
}
