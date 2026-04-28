import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

/** Cycle lease TTL: 90 seconds. Longer than the cycle itself to avoid false-recovery. */
export const CYCLE_LEASE_TTL_MS = 90_000;

/** How stale lastCycleAt must be before the scheduler kicks a new cycle. */
export const CYCLE_STALE_MS = 60_000; // 1 minute (Convex cron minimum)

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Load a trader document for use inside a cycle action.
 * No auth check — internal only.
 */
export const loadTraderForCycle = internalQuery({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    return ctx.db.get(traderId);
  },
});

/**
 * List traders eligible for a new cycle:
 *   - status === "active"
 *   - walletStatus === "ready"
 *   - lastCycleAt is either unset or older than CYCLE_STALE_MS
 *   - cycleLeaseUntil is either unset or in the past (no active lease)
 *
 * Called by the scheduler action — no auth context required.
 */
export const listStaleTradersForCycle = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const staleThreshold = now - CYCLE_STALE_MS;

    // Fetch active traders; Convex does not support multi-field inequality
    // indexes so we filter in memory after the index scan.
    const active = await ctx.db
      .query("traders")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .collect();

    return active.filter((t) => {
      if (t.walletStatus !== "ready") return false;
      // Skip if a cycle lease is still valid (another cycle is in flight)
      if (t.cycleLeaseUntil !== undefined && t.cycleLeaseUntil > now)
        return false;
      // Skip if recently cycled
      if (t.lastCycleAt !== undefined && t.lastCycleAt > staleThreshold)
        return false;
      return true;
    });
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Attempt to acquire a cycle lease via compare-and-set.
 *
 * Idempotency strategy
 * ---------------------
 * Each trader has two lease fields:
 *   - cycleGeneration (monotonic counter): incremented on each new lease grant.
 *   - cycleLeaseUntil (epoch ms): the lease expiry timestamp.
 *
 * Acquisition is a CAS transaction:
 *   - The caller reads currentGeneration from listStaleTradersForCycle.
 *   - It passes that value here as `expectedGeneration`.
 *   - If the DB's generation still equals expectedGeneration AND either there
 *     is no active lease or the lease has expired, we atomically increment
 *     generation and stamp a new leaseUntil.
 *   - Any other concurrent caller that observed the same generation will fail
 *     the CAS check and receive { acquired: false }.
 *
 * Recovery: if a cycle crashes without releasing its lease, the next scheduler
 * tick skips the trader (leaseUntil > now). After CYCLE_LEASE_TTL_MS the lease
 * expires, listStaleTradersForCycle returns the trader again, and a new cycle
 * acquires with a fresh generation — preventing double-execution.
 */
export const acquireCycleLease = internalMutation({
  args: {
    traderId: v.id("traders"),
    expectedGeneration: v.number(),
    leaseUntil: v.number(),
  },
  handler: async (ctx, { traderId, expectedGeneration, leaseUntil }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return { acquired: false, generation: expectedGeneration };

    const currentGeneration = trader.cycleGeneration ?? 0;
    const now = Date.now();

    // CAS check: generation must match AND no active lease
    const leaseActive =
      trader.cycleLeaseUntil !== undefined && trader.cycleLeaseUntil > now;
    if (currentGeneration !== expectedGeneration || leaseActive) {
      return { acquired: false, generation: currentGeneration };
    }

    const newGeneration = currentGeneration + 1;
    await ctx.db.patch(traderId, {
      cycleGeneration: newGeneration,
      cycleLeaseUntil: leaseUntil,
      updatedAt: now,
    });

    return { acquired: true, generation: newGeneration };
  },
});

/**
 * Release the cycle lease for a trader.
 * Only clears the lease if the generation matches (prevents a late release
 * from clearing a lease owned by a recovery cycle).
 */
export const releaseCycleLease = internalMutation({
  args: {
    traderId: v.id("traders"),
    generation: v.number(),
  },
  handler: async (ctx, { traderId, generation }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    if ((trader.cycleGeneration ?? 0) !== generation) return; // stale release

    await ctx.db.patch(traderId, {
      cycleLeaseUntil: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Record that a cycle completed successfully.
 * Updates lastCycleAt and clears the lease atomically.
 * Generation check prevents a stale completion from overwriting a newer cycle.
 */
export const markCycleComplete = internalMutation({
  args: {
    traderId: v.id("traders"),
    generation: v.number(),
    lastCycleAt: v.number(),
  },
  handler: async (ctx, { traderId, generation, lastCycleAt }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    if ((trader.cycleGeneration ?? 0) !== generation) return; // stale

    await ctx.db.patch(traderId, {
      lastCycleAt,
      cycleLeaseUntil: undefined,
      updatedAt: Date.now(),
    });
  },
});
