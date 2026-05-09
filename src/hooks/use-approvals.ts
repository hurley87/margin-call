"use client";

import { useCallback, useState } from "react";
import {
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";

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
  trader_image_status?: "pending" | "generating" | "ready" | "error" | null;
  trader_profile_image_url?: string | null;
  deal_prompt: string;
  deal_pot_usdc: number;
}

type ConvexPendingApprovalRow = FunctionReturnType<
  typeof api.dealApprovals.listPending
>[number];

function mapConvexPendingApproval(
  a: ConvexPendingApprovalRow
): PendingApproval {
  return {
    id: a._id,
    trader_id: a.traderId,
    deal_id: a.dealId,
    desk_manager_id: a.deskManagerId,
    status: a.status,
    entry_cost_usdc: a.entryCostUsdc,
    pot_usdc: a.potUsdc,
    expires_at: new Date(a.expiresAt).toISOString(),
    resolved_at: a.resolvedAt ? new Date(a.resolvedAt).toISOString() : null,
    created_at: new Date(a.createdAt).toISOString(),
    trader_name: a.traderName,
    trader_image_status: a.traderImageStatus ?? null,
    trader_profile_image_url: a.traderProfileImageUrl ?? null,
    deal_prompt: a.dealPrompt,
    deal_pot_usdc: a.dealPotUsdc,
  };
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

  const mapped =
    result === undefined ? undefined : result.map(mapConvexPendingApproval);

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

  function mutate(args: {
    approvalId: string;
    action: "approve" | "reject";
    reason?: string;
  }) {
    const id = args.approvalId as Id<"dealApprovals">;
    if (args.action === "approve") {
      return approve({ approvalId: id });
    }
    return reject({ approvalId: id, reason: args.reason });
  }

  return { mutate };
}

/**
 * Configure mandate + personality via Convex (replaces legacy TanStack + REST path).
 */
export function useConfigureMandate() {
  const update = useConvexMutation(api.traders.updateMandate);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    (
      vars: {
        traderId: string;
        mandate: Record<string, unknown>;
        personality?: string | null;
      },
      opts?: { onSuccess?: () => void; onError?: (e: Error) => void }
    ) => {
      setPending(true);
      setError(null);
      void update({
        traderId: vars.traderId as Id<"traders">,
        mandate: vars.mandate,
        personality:
          vars.personality === undefined ? undefined : vars.personality,
      })
        .then(() => {
          opts?.onSuccess?.();
        })
        .catch((e: unknown) => {
          const err = e instanceof Error ? e : new Error(String(e));
          setError(err);
          opts?.onError?.(err);
        })
        .finally(() => {
          setPending(false);
        });
    },
    [update]
  );

  return {
    mutate,
    isPending,
    isError: !!error,
    error,
  };
}
