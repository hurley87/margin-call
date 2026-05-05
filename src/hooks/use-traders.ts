"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
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

function mapTrader(doc: Doc<"traders">, ownerAddress: string): Trader {
  return {
    id: doc._id,
    token_id: doc.tokenId ?? 0,
    name: doc.name,
    owner_address: ownerAddress,
    tba_address: doc.tbaAddress ?? null,
    cdp_wallet_address: doc.cdpWalletAddress ?? null,
    cdp_owner_address: doc.cdpOwnerAddress ?? null,
    cdp_account_name: doc.cdpAccountName ?? null,
    status: doc.status,
    mandate: (doc.mandate as Record<string, unknown>) ?? {},
    personality: doc.personality ?? null,
    escrow_balance_usdc: doc.escrowBalanceUsdc ?? 0,
    last_cycle_at: doc.lastCycleAt
      ? new Date(doc.lastCycleAt).toISOString()
      : null,
    created_at: new Date(doc.createdAt).toISOString(),
    updated_at: new Date(doc.updatedAt).toISOString(),
  };
}

export function useTraders() {
  const { authenticated, ready } = usePrivy();
  const rows = useQuery(
    api.traders.listByDesk,
    authenticated && ready ? {} : "skip"
  );
  const dm = useQuery(
    api.deskManagers.getMe,
    authenticated && ready ? {} : "skip"
  );

  if (!authenticated || !ready) {
    return { data: undefined, isLoading: false, isError: false };
  }

  if (rows === undefined || dm === undefined) {
    return { data: undefined, isLoading: true, isError: false };
  }

  const ownerWallet = dm?.walletAddress ?? "";
  return {
    data: rows.map((r) => mapTrader(r, ownerWallet)),
    isLoading: false,
    isError: false,
  };
}

export function useTrader(id: string) {
  const { authenticated, ready } = usePrivy();
  const traderDoc = useQuery(
    api.traders.getById,
    id && authenticated && ready ? { traderId: id as Id<"traders"> } : "skip"
  );
  const dm = useQuery(
    api.deskManagers.getMe,
    authenticated && ready ? {} : "skip"
  );

  if (!id) {
    return {
      data: undefined,
      isLoading: false,
      error: new Error("Missing trader id"),
    };
  }

  if (!authenticated || !ready) {
    return { data: undefined, isLoading: false, error: null };
  }

  const waitingDesk = dm === undefined;

  if (traderDoc === undefined || waitingDesk) {
    return { data: undefined, isLoading: true, error: null };
  }

  if (traderDoc === null) {
    return {
      data: undefined,
      isLoading: false,
      error: new Error("Trader not found"),
    };
  }

  const ownerWallet = dm?.walletAddress ?? "";
  return {
    data: mapTrader(traderDoc, ownerWallet),
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

export function useTraderHistory(id: string) {
  const [data, setData] = useState<TraderHistoryEvent[] | undefined>(undefined);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setData(undefined);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void authFetch(`/api/trader/${id}/history`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load history");
        const body = (await res.json()) as { events?: TraderHistoryEvent[] };
        if (!cancelled) setData(body.events ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setData(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { data, isLoading, error };
}
