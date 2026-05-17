"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getTradingHoursState } from "../lib/tradingHours";
import type { Doc } from "../_generated/dataModel";

export const MAX_CYCLES_PER_SCHEDULER_TICK = 5;

type SchedulerResult =
  | { enqueued: number; skipped: "market_closed"; nextOpenAt?: number }
  | { enqueued: number; skipped: "no_eligible_traders" }
  | { enqueued: number; skipped: null };

/**
 * Convex internal scheduler action — replaces the legacy Vercel Cron HTTP path.
 *
 * Triggered every 1 minute via convex/crons.ts as a heartbeat (Convex minimum).
 * Trader eligibility uses per-trader cycle intervals (see listStaleTradersForCycle),
 * not the cron period — traders may skip many heartbeats until they are stale enough.
 *
 * For each eligible trader (active, wallet ready, no live lease,
 * lastCycleAt outside their minimum spacing) it enqueues an immediate cycle action
 * via ctx.scheduler.runAfter.
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

    const staleTraders: Array<Doc<"traders">> = await ctx.runQuery(
      internal.agent.internal.listStaleTradersForCycle,
      { limit: MAX_CYCLES_PER_SCHEDULER_TICK }
    );

    if (staleTraders.length === 0) {
      return { enqueued: 0, skipped: "no_eligible_traders" as const };
    }

    await Promise.all(
      staleTraders.map((trader) =>
        ctx.scheduler.runAfter(0, internal.agent.cycle.cycle, {
          traderId: trader._id,
        })
      )
    );

    console.log(
      `[scheduler] enqueued ${staleTraders.length} cycle(s):`,
      staleTraders.map((t: { _id: string }) => t._id)
    );

    return { enqueued: staleTraders.length, skipped: null };
  },
});
