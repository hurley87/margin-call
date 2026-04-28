"use client";

import { useState } from "react";
import {
  useQuery as useConvexQuery,
  useMutation as useConvexMutation,
} from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authFetch } from "@/lib/api";

// ── Types (snake_case to match existing component interface) ──────────────

export interface PendingApproval {
  id: string;
  trader_id: string;
  deal_id: string;
  desk_manager_id: string;
  status: string;
  entry_cost_usdc: number;
  pot_usdc: number;
  expires_at: string;
  resolved_at: string | null;
  created_at: string;
  trader_name: string;
  deal_prompt: string;
  deal_pot_usdc: number;
}

// ── Hooks ─────────────────────────────────────────────────────────────────

/**
 * Reactive list of pending approvals for the authenticated desk manager.
 * Backed by Convex subscription — updates live without polling or cache invalidation.
 */
export function usePendingApprovals(): {
  data: PendingApproval[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const result = useConvexQuery(api.dealApprovals.listPending);

  // Map Convex camelCase → legacy snake_case interface expected by components
  const mapped: PendingApproval[] | undefined =
    result === undefined
      ? undefined
      : result.map((a) => ({
          id: a._id,
          trader_id: a.traderId,
          deal_id: a.dealId,
          desk_manager_id: a.deskManagerId,
          status: a.status,
          entry_cost_usdc: a.entryCostUsdc,
          pot_usdc: a.potUsdc,
          expires_at: new Date(a.expiresAt).toISOString(),
          resolved_at: a.resolvedAt
            ? new Date(a.resolvedAt).toISOString()
            : null,
          created_at: new Date(a.createdAt).toISOString(),
          trader_name: a.traderName,
          deal_prompt: a.dealPrompt,
          deal_pot_usdc: a.dealPotUsdc,
        }));

  return {
    data: mapped,
    isLoading: result === undefined,
    isError: false,
  };
}

/**
 * Approve/reject a deal approval — backed by Convex mutations (idempotent).
 * Returns a `mutate` function with the same signature as the old TanStack version.
 */
export function useApproveReject() {
  const approve = useConvexMutation(api.dealApprovals.approve);
  const reject = useConvexMutation(api.dealApprovals.reject);

  // Convex useMutation returns the function directly — no pending state tracked here.
  const isPending = false;

  function mutate({
    approvalId,
    action,
    reason,
  }: {
    approvalId: string;
    action: "approve" | "reject";
    reason?: string;
  }) {
    const id = approvalId as Id<"dealApprovals">;
    if (action === "approve") {
      return approve({ approvalId: id });
    } else {
      return reject({ approvalId: id, reason });
    }
  }

  return { mutate, isPending };
}

/**
 * Configure a trader's mandate/personality.
 * Calls the /api/desk/configure route (no TanStack Query — plain fetch).
 */
export function useConfigureMandate() {
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function mutate(
    {
      traderId,
      mandate,
      personality,
    }: {
      traderId: string;
      mandate: Record<string, unknown>;
      personality?: string | null;
    },
    options?: { onSuccess?: () => void }
  ) {
    setIsPending(true);
    setIsError(false);
    setError(null);
    try {
      const res = await authFetch("/api/desk/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trader_id: traderId,
          mandate,
          ...(personality !== undefined ? { personality } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update mandate");
      }
      const result = await res.json();
      options?.onSuccess?.();
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error("Failed to update mandate");
      setIsError(true);
      setError(e);
      throw e;
    } finally {
      setIsPending(false);
    }
  }

  return { mutate, isPending, isError, error };
}
