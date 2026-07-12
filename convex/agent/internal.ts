import { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { clampLimit } from "../lib/limits";
import { GALLERY_CYCLE_INTERVAL_MS, MIN_CYCLE_INTERVAL_MS } from "./capacity";

/** Cycle lease TTL: 90 seconds. Longer than the cycle itself to avoid false-recovery. */
export const CYCLE_LEASE_TTL_MS = 90_000;

/**
 * Gallery / fail-closed cadence. Authoritative SeatVault tiers may shorten this
 * (see `convex/agent/capacity.ts`); queries cannot RPC so they pre-filter with
 * {@link MIN_CYCLE_INTERVAL_MS} and scheduler/cycle re-check on-chain.
 */
export const DEFAULT_CYCLE_INTERVAL_MS = GALLERY_CYCLE_INTERVAL_MS;

/** @deprecated Prefer MIN_CYCLE_INTERVAL_MS from capacity — kept for call-site clarity. */
export const SPEED_TOKEN_CYCLE_INTERVAL_MS = MIN_CYCLE_INTERVAL_MS;

/**
 * Pre-filter interval for listStaleTradersForCycle. Uses the shortest tier
 * cadence so Seat/Corner Office are not missed; scheduler + cycle apply
 * authoritative `tierOf` before granting capacity. Never trusts chain here.
 */
export function resolveCycleIntervalMsForTrader(
  _trader: Doc<"traders">
): number {
  void _trader;
  return MIN_CYCLE_INTERVAL_MS;
}

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
 *   - escrowBalanceUsdc > 0
 *   - lastCycleAt is either unset or older than MIN_CYCLE_INTERVAL_MS (5m pre-filter)
 *   - cycleLeaseUntil is either unset or in the past (no active lease)
 *
 * The 1-minute cron is only a heartbeat. This query uses the shortest SeatVault
 * cadence as a pre-filter; the scheduler action re-checks authoritative on-chain
 * `tierOf` before enqueueing (Gallery remains 10m).
 * Called by the scheduler action — no auth context required.
 */
export const listStaleTradersForCycle = internalQuery({
  args: { limit: v.optional(v.number()), now: v.number() },
  handler: async (ctx, { limit, now }) => {
    const boundedLimit =
      limit === undefined ? undefined : clampLimit(limit, 25);

    // Convex can't index multi-field inequalities, so funding/lease/interval
    // still post-filter the (status, walletStatus) index scan.
    const readyActive = await ctx.db
      .query("traders")
      .withIndex("byStatusAndWalletStatus", (q) =>
        q.eq("status", "active").eq("walletStatus", "ready")
      )
      .take(500);

    const eligible = [];
    for (const t of readyActive) {
      if ((t.escrowBalanceUsdc ?? 0) <= 0) continue;
      // Skip if a cycle lease is still valid (another cycle is in flight)
      if (t.cycleLeaseUntil !== undefined && t.cycleLeaseUntil > now) continue;
      const intervalMs = resolveCycleIntervalMsForTrader(t);
      const staleThreshold = now - intervalMs;
      // Skip if within this trader's minimum cycle spacing
      if (t.lastCycleAt !== undefined && t.lastCycleAt > staleThreshold)
        continue;
      eligible.push(t);
      if (boundedLimit !== undefined && eligible.length >= boundedLimit) {
        break;
      }
    }
    return eligible;
  },
});

/**
 * Find one paid dealEntry from the last 24h that is missing its dealOutcome.
 * Returns the orphan entry (oldest first) so the cycle can resume outcome
 * resolution for it. Callers treat `null` as "no recovery work" (spec §5.2
 * step 3, §5.3 — recovery is permitted at any time).
 *
 * 24h scope is deliberate — older orphans are an ops/manual problem and
 * shouldn't keep the cycle waking every minute overnight.
 */
export const findPendingRecoveryEntry = internalQuery({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const since = Date.now() - 24 * 60 * 60_000;
    const recent = await ctx.db
      .query("dealEntries")
      .withIndex("byTraderAndCreatedAt", (q) =>
        q.eq("traderId", traderId).gt("createdAt", since)
      )
      .order("asc")
      .collect();

    for (const entry of recent) {
      const outcome = await ctx.db
        .query("dealOutcomes")
        .withIndex("byTraderAndDeal", (q) =>
          q.eq("traderId", traderId).eq("dealId", entry.dealId)
        )
        .unique();
      if (!outcome) return entry;
    }
    return null;
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Stamp `lastCycleAt` on a trader without acquiring a lease or bumping
 * generation. Used by the cycle (spec §5.2 step 3) when the market is closed
 * and there is no recovery work — keeps the scheduler's interval gate accurate
 * so it doesn't re-enqueue every minute overnight.
 */
export const stampLastCycleAt = internalMutation({
  args: {
    traderId: v.id("traders"),
    lastCycleAt: v.number(),
  },
  handler: async (ctx, { traderId, lastCycleAt }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    await ctx.db.patch(traderId, {
      lastCycleAt,
      updatedAt: Date.now(),
    });
  },
});

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
 * Recovery: if a cycle crashes without releasing its lease, the next cron
 * heartbeat skips the trader (leaseUntil > now). After CYCLE_LEASE_TTL_MS the lease
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
