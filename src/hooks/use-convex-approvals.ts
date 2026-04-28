"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** List pending approvals for the authenticated desk manager. Reactive. */
export function useConvexPendingApprovals() {
  return useQuery(api.dealApprovals.listPending);
}

/** Approve a pending deal approval. */
export function useConvexApprove() {
  return useMutation(api.dealApprovals.approve);
}

/** Reject a pending deal approval. */
export function useConvexReject() {
  return useMutation(api.dealApprovals.reject);
}

export type { Id };
