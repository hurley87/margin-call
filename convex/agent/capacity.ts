/**
 * SeatVault tier capacity for agent scheduling (PRD #187 / issue #190).
 *
 * Authoritative capacity comes from on-chain `tierOf` (via injectable reader).
 * RPC/config/malformed failures fail closed to Gallery. Tier is never fed into
 * deal selection, outcome narration, probability, payout, or rake.
 *
 * Queries cannot RPC — `listStaleTradersForCycle` uses the shortest cadence as
 * a pre-filter; scheduler + cycle re-check with this module before granting.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import {
  capacityForTier,
  SEAT_TIER_NAMES,
  TIER_CAPACITY,
  type SeatTierName,
} from "../seatVault/policy";

/** Gallery cadence — default / fail-closed interval. */
export const GALLERY_CYCLE_INTERVAL_MS = TIER_CAPACITY.Gallery.cycleIntervalMs;

/** Shortest tier cadence (Seat / Corner Office). Pre-filter floor for listStale. */
export const MIN_CYCLE_INTERVAL_MS = TIER_CAPACITY.Seat.cycleIntervalMs;

export type AuthoritativeCapacity = {
  tier: SeatTierName;
  cycleIntervalMs: number;
  maxUnresolvedEntries: number;
  source: "rpc" | "fail_closed";
  diagnostic: string | null;
};

export type TierOfReader = (
  vaultAddress: `0x${string}`,
  onChainTraderId: number
) => Promise<SeatTierName>;

/** Test-only injectable seam — production passes an explicit reader. */
let tierOfReaderOverride: TierOfReader | undefined;

export function setTierOfReaderForTests(
  reader: TierOfReader | undefined
): void {
  tierOfReaderOverride = reader;
}

export function getTierOfReaderOverride(): TierOfReader | undefined {
  return tierOfReaderOverride;
}

export function isValidSeatTier(value: unknown): value is SeatTierName {
  return (
    typeof value === "string" &&
    (SEAT_TIER_NAMES as readonly string[]).includes(value)
  );
}

export function capacityFromTier(tier: SeatTierName): AuthoritativeCapacity {
  const capacity = capacityForTier(tier);
  return {
    tier,
    cycleIntervalMs: capacity.cycleIntervalMs,
    maxUnresolvedEntries: capacity.maxUnresolvedEntries,
    source: "rpc",
    diagnostic: null,
  };
}

export function failClosedGallery(diagnostic: string): AuthoritativeCapacity {
  const capacity = capacityForTier("Gallery");
  return {
    tier: "Gallery",
    cycleIntervalMs: capacity.cycleIntervalMs,
    maxUnresolvedEntries: capacity.maxUnresolvedEntries,
    source: "fail_closed",
    diagnostic,
  };
}

/** True when the trader may start a new cycle for the given interval. */
export function isCycleIntervalElapsed(
  lastCycleAt: number | undefined,
  now: number,
  intervalMs: number
): boolean {
  if (lastCycleAt === undefined) return true;
  return lastCycleAt <= now - intervalMs;
}

/**
 * Resolve capacity from on-chain tierOf (or injected test reader).
 * Never trusts traderSeatState alone for accelerated cadence.
 */
export async function resolveAuthoritativeCapacity(args: {
  onChainTraderId: number | null | undefined;
  vaultAddress: string | null | undefined;
  readTierOf?: TierOfReader;
}): Promise<AuthoritativeCapacity> {
  const { onChainTraderId, vaultAddress } = args;

  if (onChainTraderId === null || onChainTraderId === undefined) {
    return failClosedGallery("missing_token_id");
  }
  if (!vaultAddress || !/^0x[a-fA-F0-9]{40}$/i.test(vaultAddress)) {
    return failClosedGallery("missing_or_invalid_vault");
  }

  const reader = args.readTierOf ?? tierOfReaderOverride;
  if (!reader) {
    return failClosedGallery("tier_reader_unavailable");
  }

  try {
    const tier = await reader(
      vaultAddress.toLowerCase() as `0x${string}`,
      onChainTraderId
    );
    if (!isValidSeatTier(tier)) {
      return failClosedGallery(`malformed_tier:${String(tier)}`);
    }
    return capacityFromTier(tier);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "tierOf_rpc_failed";
    return failClosedGallery(`rpc_error:${message}`);
  }
}

/**
 * Count verified deal entries that are still unresolved (no outcome, or
 * outcome without on-chain settlement). Aligns with recovery concepts in
 * findPendingRecoveryEntry / findUnresolvedOnChain. 24h window.
 */
export const countUnresolvedEntries = internalQuery({
  args: {
    traderId: v.id("traders"),
    now: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, { traderId, now }) => {
    const since = now - 24 * 60 * 60_000;
    const recent = await ctx.db
      .query("dealEntries")
      .withIndex("byTraderAndCreatedAt", (q) =>
        q.eq("traderId", traderId).gt("createdAt", since)
      )
      .collect();

    let count = 0;
    for (const entry of recent) {
      const outcome = await ctx.db
        .query("dealOutcomes")
        .withIndex("byTraderAndDeal", (q) =>
          q.eq("traderId", traderId).eq("dealId", entry.dealId)
        )
        .unique();
      if (!outcome || !outcome.onChainTxHash) {
        count += 1;
      }
    }
    return count;
  },
});
