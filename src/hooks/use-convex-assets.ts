"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** List assets for a specific trader. Reactive. */
export function useConvexTraderAssets(traderId: Id<"traders"> | undefined) {
  return useQuery(api.assets.listByTrader, traderId ? { traderId } : "skip");
}

export type { Id };
