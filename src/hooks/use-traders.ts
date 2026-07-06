"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { PublicPortraitTraits } from "@/lib/portrait-traits";

type TraderReadModel = Pick<
  Doc<"traders">,
  | "_id"
  | "name"
  | "tokenId"
  | "tbaAddress"
  | "cdpWalletAddress"
  | "cdpOwnerAddress"
  | "cdpAccountName"
  | "status"
  | "mandate"
  | "personality"
  | "imageStatus"
  | "escrowBalanceUsdc"
  | "walletStatus"
  | "walletError"
  | "walletStep"
  | "walletStepTokenId"
  | "lastCycleAt"
  | "cycleLeaseUntil"
  | "createdAt"
  | "updatedAt"
> & {
  profileImageUrl: string;
  traits: PublicPortraitTraits | null;
  rarity: string;
};

export type TraderStatus = "active" | "paused" | "wiped_out";

export interface Trader {
  id: string;
  token_id: number;
  name: string;
  owner_address: string;
  tba_address: string | null;
  cdp_wallet_address: string | null;
  cdp_owner_address: string | null;
  cdp_account_name: string | null;
  status: TraderStatus;
  mandate: Record<string, unknown>;
  personality: string | null;
  image_status: TraderReadModel["imageStatus"] | null;
  profile_image_url: string;
  traits: PublicPortraitTraits | null;
  rarity: string;
  escrow_balance_usdc: number;
  wallet_status: Doc<"traders">["walletStatus"];
  wallet_error: string | null;
  wallet_step: Doc<"traders">["walletStep"] | null;
  wallet_step_token_id: number | null;
  /** Epoch ms for agent cycle countdown UI */
  last_cycle_at_ms: number | null;
  cycle_lease_until_ms: number | null;
  last_cycle_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapTrader(doc: TraderReadModel, ownerAddress: string): Trader {
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
    image_status: doc.imageStatus ?? null,
    profile_image_url: doc.profileImageUrl,
    traits: doc.traits ?? null,
    rarity: doc.rarity ?? "Common",
    escrow_balance_usdc: doc.escrowBalanceUsdc ?? 0,
    wallet_status: doc.walletStatus,
    wallet_error: doc.walletError ?? null,
    wallet_step: doc.walletStep ?? null,
    wallet_step_token_id: doc.walletStepTokenId ?? null,
    last_cycle_at_ms: doc.lastCycleAt ?? null,
    cycle_lease_until_ms: doc.cycleLeaseUntil ?? null,
    last_cycle_at: doc.lastCycleAt
      ? new Date(doc.lastCycleAt).toISOString()
      : null,
    created_at: new Date(doc.createdAt).toISOString(),
    updated_at: new Date(doc.updatedAt).toISOString(),
  };
}

export function useTraders() {
  const { authenticated, ready } = usePrivy();
  const canFetch = authenticated && ready;
  const rows = useQuery(api.traders.listByDesk, canFetch ? {} : "skip");
  const dm = useQuery(api.deskManagers.getMe, canFetch ? {} : "skip");

  if (!ready) {
    return { data: undefined, isLoading: true, isError: false };
  }

  if (!authenticated) {
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
  const canFetch = Boolean(id) && authenticated && ready;
  const traderDoc = useQuery(
    api.traders.getById,
    canFetch ? { traderId: id as Id<"traders"> } : "skip"
  );
  const dm = useQuery(api.deskManagers.getMe, canFetch ? {} : "skip");

  if (!id) {
    return {
      data: undefined,
      isLoading: false,
      error: new Error("Missing trader id"),
    };
  }

  if (!ready) {
    return { data: undefined, isLoading: true, error: null };
  }

  if (!authenticated) {
    return { data: undefined, isLoading: false, error: null };
  }

  if (traderDoc === undefined || dm === undefined) {
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

export type TraderHistoryEvent = Doc<"agentActivityLog">;

export function useTraderHistory(id: string) {
  const results = useQuery(
    api.agentActivityLog.listByTrader,
    id ? { traderId: id as Id<"traders">, limit: 100 } : "skip"
  );

  if (!id) return { data: undefined, isLoading: false, error: null };

  return {
    data: results,
    isLoading: results === undefined,
    error: null,
  };
}
