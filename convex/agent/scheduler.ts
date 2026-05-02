"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Convex internal scheduler action — replaces the legacy Vercel Cron HTTP path.
 *
 * Triggered every 1 minute via convex/crons.ts (Convex minimum; PRD target is
 * 30s but the platform constraint is 1m on most plans).
 *
 * For each eligible trader (active, wallet ready, no live lease, lastCycleAt
 * stale) it enqueues an immediate cycle action via ctx.scheduler.runAfter.
 * No HMAC, no HTTP self-call, no user auth context (internal-only action).
 */
export const scheduler = internalAction({
  args: {},
  handler: async (ctx) => {
    const staleTraders = await ctx.runQuery(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );

    if (staleTraders.length === 0) return;

    for (const trader of staleTraders) {
      await ctx.scheduler.runAfter(0, internal.agent.cycle.cycle, {
        traderId: trader._id,
      });
    }

    console.log(
      `[scheduler] enqueued ${staleTraders.length} cycle(s):`,
      staleTraders.map((t) => t._id)
    );
  },
});
