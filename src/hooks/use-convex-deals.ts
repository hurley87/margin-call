"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Reactive list of all open deals — visible to any authenticated user.
 */
export function useConvexDeals() {
  return useQuery(api.deals.list);
}

/**
 * Reactive list of open deals only.
 */
export function useConvexOpenDeals() {
  return useQuery(api.deals.listOpen);
}

/**
 * Reactive list of deals created by the authenticated desk manager.
 */
export function useConvexMyDeals() {
  return useQuery(api.deals.listMine);
}

/**
 * Reactive single deal by id.
 */
export function useConvexDeal(dealId: Id<"deals"> | undefined) {
  return useQuery(api.deals.getById, dealId ? { dealId } : "skip");
}
