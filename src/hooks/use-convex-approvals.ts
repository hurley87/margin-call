"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Reactive list of pending deal approvals for the authenticated desk manager.
 * Updates live via Convex subscription — no polling or cache invalidation needed.
 */
export function useConvexPendingApprovals() {
  return useQuery(api.dealApprovals.listPending);
}

/**
 * Get a single approval by id (auth-checked, reactive).
 */
export function useConvexApproval(approvalId: Id<"dealApprovals"> | undefined) {
  return useQuery(
    api.dealApprovals.getById,
    approvalId ? { approvalId } : "skip"
  );
}

/**
 * Approve a pending deal approval (idempotent).
 */
export function useConvexApprove() {
  return useMutation(api.dealApprovals.approve);
}

/**
 * Reject a pending deal approval (idempotent).
 */
export function useConvexReject() {
  return useMutation(api.dealApprovals.reject);
}
