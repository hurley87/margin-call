"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { CYCLE_LEASE_TTL_MS } from "./internal";

/**
 * Idempotent cycle action for a single trader agent.
 *
 * Idempotency strategy (lease-based CAS)
 * ----------------------------------------
 * 1. The scheduler reads cycleGeneration from listStaleTradersForCycle.
 * 2. Before any work this action calls acquireCycleLease with:
 *      expectedGeneration = trader.cycleGeneration ?? 0
 *      leaseUntil = now + CYCLE_LEASE_TTL_MS
 *    acquireCycleLease is an atomic Convex mutation: it only increments
 *    cycleGeneration and stamps cycleLeaseUntil if currentGeneration === expectedGeneration
 *    AND there is no active lease. If two concurrent invocations race, exactly
 *    one wins the CAS; the other receives { acquired: false } and exits cleanly.
 * 3. On success the action holds { acquired: true, generation: N }.
 * 4. On completion it calls markCycleComplete({ generation: N }) which updates
 *    lastCycleAt and clears the lease — but only if generation still equals N.
 *    This prevents a stale cycle from clobbering a recovery cycle's state.
 * 5. On crash / timeout the lease expires automatically after CYCLE_LEASE_TTL_MS
 *    (90 s). The next scheduler tick sees no active lease and enqueues a fresh
 *    cycle with an incremented generation.
 *
 * Overlapping ticks: if the cron fires while a cycle is in flight,
 * listStaleTradersForCycle filters out traders with cycleLeaseUntil > now,
 * so the scheduler never even enqueues a second cycle. Belt-and-suspenders:
 * even if it did enqueue one (e.g. clock skew) the CAS would reject it.
 *
 * TODO (#86): wire in deal selection + outcome resolver
 * TODO (#87): x402 deal-entry HTTP call
 */
export const cycle = internalAction({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const now = Date.now();

    // ── 1. Load trader ────────────────────────────────────────────────────────
    const trader = await ctx.runQuery(
      internal.agent.internal.loadTraderForCycle,
      { traderId }
    );
    if (!trader) {
      console.warn(`[cycle] trader ${traderId} not found — skipping`);
      return;
    }

    // Defensive guard: only run for active + ready traders
    if (trader.status !== "active" || trader.walletStatus !== "ready") {
      console.log(
        `[cycle] trader ${traderId} not eligible (status=${trader.status}, wallet=${trader.walletStatus}) — skipping`
      );
      return;
    }

    // ── 2. Acquire lease (CAS) ────────────────────────────────────────────────
    const expectedGeneration = trader.cycleGeneration ?? 0;
    const leaseResult = await ctx.runMutation(
      internal.agent.internal.acquireCycleLease,
      {
        traderId,
        expectedGeneration,
        leaseUntil: now + CYCLE_LEASE_TTL_MS,
      }
    );

    if (!leaseResult.acquired) {
      // Another cycle is in flight or just won the CAS race — exit cleanly.
      console.log(
        `[cycle] lease not acquired for ${traderId} (generation mismatch or active lease) — skipping`
      );
      return;
    }

    const { generation } = leaseResult;
    console.log(
      `[cycle] lease acquired for ${traderId} generation=${generation}`
    );

    try {
      // ── 3. Core cycle work ──────────────────────────────────────────────────
      // TODO (#86): load desk, pick deal, resolve outcome, apply PnL
      // Placeholder: just log that the skeleton ran.
      console.log(
        `[cycle] running skeleton for trader ${traderId} (${trader.name})`
      );

      // ── 4. Mark complete (updates lastCycleAt, releases lease) ─────────────
      await ctx.runMutation(internal.agent.internal.markCycleComplete, {
        traderId,
        generation,
        lastCycleAt: Date.now(),
      });

      console.log(`[cycle] completed for ${traderId} generation=${generation}`);
    } catch (err) {
      // Release lease so the next tick can retry after TTL.
      // markCycleComplete was not called, so lastCycleAt is unchanged; the
      // scheduler will re-enqueue once the lease expires.
      await ctx.runMutation(internal.agent.internal.releaseCycleLease, {
        traderId,
        generation,
      });
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[cycle] error for ${traderId} generation=${generation}: ${message}`
      );
      throw err; // re-throw so Convex marks the action as failed
    }
  },
});
