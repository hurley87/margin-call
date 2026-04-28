"use client";

/**
 * Agent activity hooks — migrated to Convex.
 *
 * NOTE: usePauseTrader / useResumeTrader / useReviveTrader have no Convex
 * mutations yet. They are stubbed here and flagged for human follow-up.
 * See PR #103.
 */

import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ── Types (kept snake_case for UI compatibility) ──────────────────────────────

export interface AgentActivity {
  id: string;
  trader_id: string;
  activity_type: string;
  message: string;
  deal_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DealOutcomeWithNarrative {
  id: string;
  deal_id: string;
  trader_id: string;
  narrative: string | { event: string; description: string }[];
  trader_pnl_usdc: number;
  pot_change_usdc: number;
  rake_usdc: number;
  assets_gained: { name: string; value_usdc: number }[];
  assets_lost: string[];
  trader_wiped_out: boolean;
  wipeout_reason: string | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

type RawActivity = {
  _id: string;
  traderId: string;
  activityType: string;
  message: string;
  dealId?: string;
  metadata?: unknown;
  createdAt: number;
};

function toAgentActivity(doc: RawActivity): AgentActivity {
  return {
    id: doc._id,
    trader_id: doc.traderId,
    activity_type: doc.activityType,
    message: doc.message,
    deal_id: doc.dealId ?? null,
    metadata: (doc.metadata as Record<string, unknown>) ?? {},
    created_at: new Date(doc.createdAt).toISOString(),
  };
}

type RawOutcome = {
  _id: string;
  dealId: string;
  traderId: string;
  narrative?: unknown;
  traderPnlUsdc?: number;
  potChangeUsdc?: number;
  rakeUsdc?: number;
  assetsGained?: unknown;
  assetsLost?: unknown;
  traderWipedOut?: boolean;
  wipeoutReason?: string;
  createdAt: number;
};

function toOutcome(doc: RawOutcome): DealOutcomeWithNarrative {
  return {
    id: doc._id,
    deal_id: doc.dealId,
    trader_id: doc.traderId,
    narrative: (doc.narrative as DealOutcomeWithNarrative["narrative"]) ?? "",
    trader_pnl_usdc: doc.traderPnlUsdc ?? 0,
    pot_change_usdc: doc.potChangeUsdc ?? 0,
    rake_usdc: doc.rakeUsdc ?? 0,
    assets_gained:
      (doc.assetsGained as { name: string; value_usdc: number }[]) ?? [],
    assets_lost: (doc.assetsLost as string[]) ?? [],
    trader_wiped_out: doc.traderWipedOut ?? false,
    wipeout_reason: doc.wipeoutReason ?? null,
    created_at: new Date(doc.createdAt).toISOString(),
  };
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/** List agent activity log entries for a specific trader. Reactive via Convex. */
export function useAgentActivity(traderId: string) {
  const result = useConvexQuery(
    api.agentActivityLog.listByTrader,
    traderId ? { traderId: traderId as Id<"traders"> } : "skip"
  );

  if (result === undefined) {
    return { data: undefined, isLoading: true, isError: false, error: null };
  }

  const data = (result as RawActivity[]).map(toAgentActivity);

  return { data, isLoading: false, isError: false, error: null };
}

/** List deal outcomes for a specific trader. Reactive via Convex. */
export function useTraderOutcomes(traderId: string) {
  const result = useConvexQuery(
    api.dealOutcomes.listByTrader,
    traderId ? { traderId: traderId as Id<"traders"> } : "skip"
  );

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  const data = (result as RawOutcome[]).map(toOutcome);

  return { data, isLoading: false };
}

type RawAsset = {
  _id: string;
  name: string;
  valueUsdc?: number;
};

/** List assets for a specific trader. Reactive via Convex. */
export function useTraderAssets(traderId: string) {
  const result = useConvexQuery(
    api.assets.listByTrader,
    traderId ? { traderId: traderId as Id<"traders"> } : "skip"
  );

  if (result === undefined) {
    return { data: undefined, isLoading: true };
  }

  const data = (result as RawAsset[]).map((doc) => ({
    id: doc._id,
    name: doc.name,
    value_usdc: doc.valueUsdc ?? 0,
    trader_id: traderId,
  }));

  return { data, isLoading: false };
}

// ── Stubbed mutations (no Convex replacements yet — flagged #103) ──────────

/** @deprecated No Convex mutation for pause yet. Stub — no-op. Flag: PR #103. */
export function usePauseTrader() {
  return {
    mutate: (_traderId: string) => {
      console.warn("usePauseTrader: no Convex mutation yet — see PR #103");
    },
    isPending: false,
    isError: false,
    error: null as Error | null,
  };
}

/** @deprecated No Convex mutation for resume yet. Stub — no-op. Flag: PR #103. */
export function useResumeTrader() {
  return {
    mutate: (_traderId: string) => {
      console.warn("useResumeTrader: no Convex mutation yet — see PR #103");
    },
    isPending: false,
    isError: false,
    error: null as Error | null,
  };
}

/** @deprecated No Convex mutation for revive yet. Stub — no-op. Flag: PR #103. */
export function useReviveTrader() {
  return {
    mutate: (_traderId: string) => {
      console.warn("useReviveTrader: no Convex mutation yet — see PR #103");
    },
    isPending: false,
    isError: false,
    error: null as Error | null,
  };
}
