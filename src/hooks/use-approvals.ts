"use client";

/**
 * Approvals hooks — Convex-backed list + approve/reject.
 * useConfigureMandate is stubbed: /api/desk/configure was removed; Convex mandate mutation TBD.
 */

import {
  useQuery as useConvexQuery,
  useMutation as useConvexMutation,
} from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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
 */
export function useApproveReject() {
  const approve = useConvexMutation(api.dealApprovals.approve);
  const reject = useConvexMutation(api.dealApprovals.reject);

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
    }
    return reject({ approvalId: id, reason });
  }

  return { mutate, isPending };
}

/** @deprecated No Convex mandate mutation wired yet — stub. See PR #103. */
export function useConfigureMandate() {
  return {
    mutate: (
      _params: {
        traderId: string;
        mandate: Record<string, unknown>;
        personality?: string | null;
      },
      _options?: { onSuccess?: () => void }
    ) => {
      console.warn("useConfigureMandate: no Convex mutation yet — see PR #103");
      _options?.onSuccess?.();
    },
    isPending: false as boolean,
    isError: false as boolean,
    error: new Error("No Convex mutation yet — see PR #103"),
  };
}
