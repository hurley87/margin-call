"use client";

/**
 * Trader hooks — migrated to Convex.
 *
 * NOTE: useTraderHistory has no Convex public query yet — stubbed.
 * See PR #103.
 */

import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ── Types (kept snake_case for UI compatibility) ──────────────────────────────

export interface Trader {
  id: string;
  token_id: number;
  name: string;
  owner_address: string;
  tba_address: string | null;
  cdp_wallet_address: string | null;
  cdp_owner_address: string | null;
  cdp_account_name: string | null;
  status: "active" | "paused" | "wiped_out";
  mandate: Record<string, unknown>;
  personality: string | null;
  escrow_balance_usdc: number;
  last_cycle_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TraderHistoryEvent {
  type: "deposit" | "withdrawal" | "enter" | "resolve";
  block: number;
  txHash: string;
  amount?: number;
  dealId?: number;
  pnl?: number;
  rake?: number;
}

type RawTrader = {
  _id: string;
  tokenId?: number;
  name: string;
  cdpOwnerAddress?: string;
  cdpWalletAddress?: string;
  cdpAccountName?: string;
  tbaAddress?: string;
  status: "active" | "paused" | "wiped_out";
  mandate?: Record<string, unknown>;
  personality?: string;
  escrowBalanceUsdc?: number;
  lastCycleAt?: number;
  createdAt: number;
  updatedAt: number;
};

function toTrader(doc: RawTrader): Trader {
  return {
    id: doc._id,
    token_id: doc.tokenId ?? 0,
    name: doc.name,
    owner_address: doc.cdpOwnerAddress ?? "",
    tba_address: doc.tbaAddress ?? null,
    cdp_wallet_address: doc.cdpWalletAddress ?? null,
    cdp_owner_address: doc.cdpOwnerAddress ?? null,
    cdp_account_name: doc.cdpAccountName ?? null,
    status: doc.status,
    mandate: doc.mandate ?? {},
    personality: doc.personality ?? null,
    escrow_balance_usdc: doc.escrowBalanceUsdc ?? 0,
    last_cycle_at: doc.lastCycleAt
      ? new Date(doc.lastCycleAt).toISOString()
      : null,
    created_at: new Date(doc.createdAt).toISOString(),
    updated_at: new Date(doc.updatedAt).toISOString(),
  };
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/** List traders for the authenticated desk manager. Reactive via Convex. */
export function useTraders() {
  const result = useConvexQuery(api.traders.listByDesk);

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  const data = (result as RawTrader[]).map(toTrader);
  return { data, isLoading: false };
}

/** Get a single trader by id. Reactive via Convex. */
export function useTrader(id: string) {
  const result = useConvexQuery(
    api.traders.getById,
    id ? { traderId: id as Id<"traders"> } : "skip"
  );

  if (result === undefined) {
    return { data: undefined, isLoading: true, error: null };
  }

  if (result === null) {
    return {
      data: undefined,
      isLoading: false,
      error: new Error("Trader not found"),
    };
  }

  return { data: toTrader(result as RawTrader), isLoading: false, error: null };
}

/**
 * On-chain trader history — no Convex public query yet.
 * Returns empty data. Flagged for follow-up in PR #103.
 *
 * @deprecated Stub — awaiting Convex traderTransactions query.
 */
export function useTraderHistory(_id: string) {
  return { data: [] as TraderHistoryEvent[], isLoading: false };
}
