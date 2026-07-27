"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getTradingHoursState } from "../lib/tradingHours";
import type { Doc } from "../_generated/dataModel";
import {
  isCycleIntervalElapsed,
  resolveAuthoritativeCapacity,
} from "./capacity";

export const MAX_CYCLES_PER_SCHEDULER_TICK = 5;

/**
 * Gate 3 (#211): autonomous enterDeal cycles require explicit enablement.
 * Set `AGENT_CYCLES_ENABLED=1` in Convex (and local) after human approval.
 * Any other value (including unset in deployed env) keeps the scheduler idle.
 * Vitest sets this to `1` so unit tests exercise the enqueue path.
 */
export function isAgentCyclesEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.AGENT_CYCLES_ENABLED === "1";
}

type SchedulerResult =
  | { enqueued: number; skipped: "autonomy_disabled" }
  | { enqueued: number; skipped: "market_closed"; nextOpenAt?: number }
  | { enqueued: number; skipped: "no_eligible_traders" }
  | { enqueued: number; skipped: null };

/**
 * Convex internal scheduler action — replaces the legacy Vercel Cron HTTP path.
 *
 * Triggered every 1 minute via convex/crons.ts as a heartbeat (Convex minimum).
 * SeatVault tier RPC is torn down: capacity fail-closes to Gallery cadence.
 *
 * For each eligible trader (active, wallet ready, no live lease,
 * lastCycleAt outside Gallery spacing) it enqueues an immediate cycle
 * action via ctx.scheduler.runAfter.
 */
export const scheduler = internalAction({
  args: {},
  handler: async (ctx): Promise<SchedulerResult> => {
    if (!isAgentCyclesEnabled()) {
      console.log(
        "[scheduler] skipped: AGENT_CYCLES_ENABLED is not 1 (Gate 3 autonomy off)"
      );
      return { enqueued: 0, skipped: "autonomy_disabled" as const };
    }

    const marketState = getTradingHoursState();
    if (!marketState.isOpen) {
      return {
        enqueued: 0,
        skipped: "market_closed" as const,
        nextOpenAt: marketState.nextOpenAt,
      };
    }

    const now = Date.now();
    const candidates: Array<Doc<"traders">> = await ctx.runQuery(
      internal.agent.internal.listStaleTradersForCycle,
      { limit: MAX_CYCLES_PER_SCHEDULER_TICK * 4, now }
    );

    if (candidates.length === 0) {
      return { enqueued: 0, skipped: "no_eligible_traders" as const };
    }

    const eligible: Array<Doc<"traders">> = [];

    for (const trader of candidates) {
      if (eligible.length >= MAX_CYCLES_PER_SCHEDULER_TICK) break;

      const capacity = await resolveAuthoritativeCapacity({
        onChainTraderId: trader.tokenId,
        vaultAddress: null,
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
