"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** List traders for the authenticated desk manager. Reactive. */
export function useConvexTraders() {
  return useQuery(api.traders.listByDesk);
}

/** Get a single trader by id. Reactive. */
export function useConvexTrader(traderId: Id<"traders"> | undefined) {
  return useQuery(api.traders.getById, traderId ? { traderId } : "skip");
}

/** Create a trader (schedules CDP wallet pipeline). */
export function useConvexCreateTrader() {
  return useMutation(api.traders.create);
}
