"use client";

/**
 * Approvals hooks — migrated to Convex.
 *
 * NOTE: useConfigureMandate has no Convex mutation yet — stubbed and flagged.
 * See PR #103.
 */

import {
  useQuery as useConvexQuery,
  useMutation as useConvexMutation,
} from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ── Types (kept snake_case for UI compatibility) ──────────────────────────────

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

type RawApproval = {
  _id: string;
  traderId: string;
  dealId: string;
  deskManagerId: string;
  status: string;
  entryCostUsdc: number;
  potUsdc: number;
  expiresAt: number;
  resolvedAt?: number;
  createdAt: number;
  traderName: string;
  dealPrompt: string;
  dealPotUsdc: number;
};

function toPendingApproval(doc: RawApproval): PendingApproval {
  return {
    id: doc._id,
    trader_id: doc.traderId,
    deal_id: doc.dealId,
    desk_manager_id: doc.deskManagerId,
    status: doc.status,
    entry_cost_usdc: doc.entryCostUsdc,
    pot_usdc: doc.potUsdc,
    expires_at: new Date(doc.expiresAt).toISOString(),
    resolved_at: doc.resolvedAt ? new Date(doc.resolvedAt).toISOString() : null,
    created_at: new Date(doc.createdAt).toISOString(),
    trader_name: doc.traderName,
    deal_prompt: doc.dealPrompt,
    deal_pot_usdc: doc.dealPotUsdc,
  };
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/** List pending approvals for the authenticated desk manager. Reactive via Convex. */
export function usePendingApprovals() {
  const result = useConvexQuery(api.dealApprovals.listPending);

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  const data = (result as RawApproval[]).map(toPendingApproval);
  return { data, isLoading: false, isError: false };
}

/** Approve or reject a pending deal approval via Convex. */
export function useApproveReject() {
  const approve = useConvexMutation(api.dealApprovals.approve);
  const reject = useConvexMutation(api.dealApprovals.reject);

  return {
    mutate: async ({
      approvalId,
      action,
      reason,
    }: {
      approvalId: string;
      action: "approve" | "reject";
      reason?: string;
    }) => {
      if (action === "approve") {
        await approve({ approvalId: approvalId as Id<"dealApprovals"> });
      } else {
        await reject({
          approvalId: approvalId as Id<"dealApprovals">,
          reason,
        });
      }
    },
    isPending: false,
  };
}

/** @deprecated No Convex mutation for configure yet. Stub — no-op. Flag: PR #103. */
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
