"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** List all open deals. Reactive. */
export function useConvexDeals() {
  return useQuery(api.deals.list);
}

/** List deals created by the authenticated desk manager. Reactive. */
export function useConvexMyDeals() {
  return useQuery(api.deals.listMine);
}

/** Get a single deal by id. Reactive. */
export function useConvexDeal(dealId: Id<"deals"> | undefined) {
  return useQuery(api.deals.getById, dealId ? { dealId } : "skip");
}

export type { Id };
