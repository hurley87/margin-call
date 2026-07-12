"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getTradingHoursState } from "../lib/tradingHours";
import type { Doc } from "../_generated/dataModel";
import {
  getTierOfReaderOverride,
  isCycleIntervalElapsed,
  resolveAuthoritativeCapacity,
  type TierOfReader,
} from "./capacity";
import { createSeatVaultPublicClient, readTierOf } from "../seatVault/rpc";

export const MAX_CYCLES_PER_SCHEDULER_TICK = 5;

type SchedulerResult =
  | { enqueued: number; skipped: "market_closed"; nextOpenAt?: number }
  | { enqueued: number; skipped: "no_eligible_traders" }
  | { enqueued: number; skipped: null };

async function defaultReadTierOf(
  vaultAddress: `0x${string}`,
  onChainTraderId: number
) {
  const client = createSeatVaultPublicClient();
  return readTierOf(client, vaultAddress, onChainTraderId);
}

function resolveTierReader(): TierOfReader {
  return getTierOfReaderOverride() ?? defaultReadTierOf;
}

/**
 * Convex internal scheduler action — replaces the legacy Vercel Cron HTTP path.
 *
 * Triggered every 1 minute via convex/crons.ts as a heartbeat (Convex minimum).
 * Trader eligibility uses per-trader cycle intervals from SeatVault tier capacity
 * (authoritative on-chain `tierOf`), not the cron period — traders may skip many
 * heartbeats until they are stale enough for their tier.
 *
 * For each eligible trader (active, wallet ready, no live lease,
 * lastCycleAt outside their authoritative spacing) it enqueues an immediate cycle
 * action via ctx.scheduler.runAfter.
 * No HMAC, no HTTP self-call, no user auth context (internal-only action).
 */
export const scheduler = internalAction({
  args: {},
  handler: async (ctx): Promise<SchedulerResult> => {
    const marketState = getTradingHoursState();
    if (!marketState.isOpen) {
      return {
        enqueued: 0,
        skipped: "market_closed" as const,
        nextOpenAt: marketState.nextOpenAt,
      };
    }

    const now = Date.now();
    // Pre-filter at the shortest cadence; authoritative tier may still skip.
    const candidates: Array<Doc<"traders">> = await ctx.runQuery(
      internal.agent.internal.listStaleTradersForCycle,
      { limit: MAX_CYCLES_PER_SCHEDULER_TICK * 4, now }
    );

    if (candidates.length === 0) {
      return { enqueued: 0, skipped: "no_eligible_traders" as const };
    }

    const deployment = await ctx.runQuery(
      internal.seatVault.store.getActiveDeploymentInternal,
      {}
    );
    const readTierOfFn = resolveTierReader();
    const eligible: Array<Doc<"traders">> = [];

    for (const trader of candidates) {
      if (eligible.length >= MAX_CYCLES_PER_SCHEDULER_TICK) break;

      const capacity = await resolveAuthoritativeCapacity({
        onChainTraderId: trader.tokenId,
        vaultAddress: deployment?.address ?? null,
        readTierOf: readTierOfFn,
      });

      if (capacity.source === "fail_closed" && capacity.diagnostic) {
        console.warn(
          `[scheduler] capacity fail-closed Gallery for ${trader._id}: ${capacity.diagnostic}`
        );
      }

      if (
        !isCycleIntervalElapsed(
          trader.lastCycleAt,
          now,
          capacity.cycleIntervalMs
        )
      ) {
        continue;
      }

      eligible.push(trader);
    }

    if (eligible.length === 0) {
      return { enqueued: 0, skipped: "no_eligible_traders" as const };
    }

    await Promise.all(
      eligible.map((trader) =>
        ctx.scheduler.runAfter(0, internal.agent.cycle.cycle, {
          traderId: trader._id,
        })
      )
    );

    console.log(
      `[scheduler] enqueued ${eligible.length} cycle(s):`,
      eligible.map((t: { _id: string }) => t._id)
    );

    return { enqueued: eligible.length, skipped: null };
  },
});
