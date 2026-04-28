"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authFetch } from "@/lib/api";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapConvexTrader(t: Record<string, any>): Trader {
  return {
    id: t._id,
    token_id: t.tokenId ?? 0,
    name: t.name,
    owner_address: t.ownerSubject ?? "",
    tba_address: null,
    cdp_wallet_address: t.cdpWalletAddress ?? null,
    cdp_owner_address: t.cdpOwnerAddress ?? null,
    cdp_account_name: t.cdpAccountName ?? null,
    status: t.status,
    mandate: (t.mandate as Record<string, unknown>) ?? {},
    personality: t.personality ?? null,
    escrow_balance_usdc: t.escrowBalanceUsdc ?? 0,
    last_cycle_at: t.lastCycleAt ? new Date(t.lastCycleAt).toISOString() : null,
    created_at: new Date(t.createdAt).toISOString(),
    updated_at: new Date(t.updatedAt).toISOString(),
  };
}

/**
 * Reactive list of traders owned by the authenticated desk manager.
 * Backed by Convex subscription — live updates without polling.
 */
export function useTraders(): {
  data: Trader[] | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const result = useQuery(api.traders.listByDesk);

  if (result === undefined) {
    return { data: undefined, isLoading: true, error: null };
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: (result as any[]).map(mapConvexTrader),
    isLoading: false,
    error: null,
  };
}

/**
 * Reactive single trader by id.
 * Backed by Convex subscription — live updates without polling.
 */
export function useTrader(id: string): {
  data: Trader | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const result = useQuery(
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

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: mapConvexTrader(result as any),
    isLoading: false,
    error: null,
  };
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

/**
 * Fetch on-chain trader history from the legacy API route.
 * Not Convex-backed — plain fetch, no TanStack Query.
 */
export function useTraderHistory(id: string): {
  data: TraderHistoryEvent[] | undefined;
  isLoading: boolean;
} {
  const [state, setState] = useState<{
    data: TraderHistoryEvent[] | undefined;
    isLoading: boolean;
  }>({ data: undefined, isLoading: !!id });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    authFetch(`/api/trader/${id}/history`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load history");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setState({
            data: (json.events ?? []) as TraderHistoryEvent[],
            isLoading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, isLoading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
