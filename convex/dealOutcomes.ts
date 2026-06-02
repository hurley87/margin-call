import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// ── Public queries ─────────────────────────────────────────────────────────

/** Get all outcomes for a deal — auth-checked. */
export const listByDeal = query({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const outcomes = await ctx.db
      .query("dealOutcomes")
      .withIndex("byDeal", (q) => q.eq("dealId", dealId))
      .order("desc")
      .collect();

    const outcomesWithTraderNames = outcomes.map(async (outcome) => {
      const traderId = ctx.db.normalizeId("traders", outcome.traderId);
      if (!traderId) {
        return {
          ...outcome,
          traderName: outcome.traderId,
        };
      }

      const trader = await ctx.db.get(traderId);
      return {
        ...outcome,
        traderName: trader?.name ?? outcome.traderId,
      };
    });

    return await Promise.all(outcomesWithTraderNames);
  },
});

/** Get all outcomes for a trader — auth-checked (trader must be owned by caller). */
export const listByTrader = query({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const trader = await ctx.db.get(traderId);
    if (!trader || trader.ownerSubject !== identity.subject) return [];

    return ctx.db
      .query("dealOutcomes")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .order("desc")
      .collect();
  },
});

// ── Internal queries ───────────────────────────────────────────────────────

/** Internal: check if outcome already exists for (traderId, dealId). */
export const findByTraderAndDeal = internalQuery({
  args: { traderId: v.string(), dealId: v.id("deals") },
  handler: async (ctx, { traderId, dealId }) =>
    ctx.db
      .query("dealOutcomes")
      .withIndex("byTraderAndDeal", (q) =>
        q.eq("traderId", traderId).eq("dealId", dealId)
      )
      .unique(),
});

/**
 * Internal: fetch deal ids already resolved by this trader.
 * Used to filter out deals the trader has already entered.
 */
export const listResolvedDealIdsForTrader = internalQuery({
  args: { traderId: v.string() },
  handler: async (ctx, { traderId }) => {
    const outcomes = await ctx.db
      .query("dealOutcomes")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .collect();
    return outcomes.map((o) => o.dealId as string);
  },
});

/**
 * Internal: list the N most recent outcomes for a trader (for LLM context).
 */
export const listRecentForTrader = internalQuery({
  args: { traderId: v.string(), limit: v.number() },
  handler: async (ctx, { traderId, limit }) => {
    return ctx.db
      .query("dealOutcomes")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Internal: get the set of deal ids that any of the given sibling trader ids
 * entered on or after `since` (epoch ms). Used for desk dedup in cycle.
 */
export const getDealIdsEnteredBySiblingsSince = internalQuery({
  args: {
    siblingTraderIds: v.array(v.string()),
    since: v.number(),
  },
  handler: async (ctx, { siblingTraderIds, since }) => {
    const blocked = new Set<string>();
    for (const siblingId of siblingTraderIds) {
      const outcomes = await ctx.db
        .query("dealOutcomes")
        .withIndex("byTrader", (q) => q.eq("traderId", siblingId))
        .filter((q) => q.gte(q.field("createdAt"), since))
        .collect();
      for (const o of outcomes) {
        blocked.add(o.dealId as string);
      }
    }
    return [...blocked];
  },
});

// ── Internal mutations ─────────────────────────────────────────────────────

/**
 * Internal: apply an outcome for a (traderId, dealId) pair.
 * Idempotent: if an outcome already exists for this (traderId, dealId), no-op and return existing id.
 */
export const apply = internalMutation({
  args: {
    dealId: v.id("deals"),
    traderId: v.string(),
    narrative: v.optional(v.any()),
    traderPnlUsdc: v.optional(v.number()),
    potChangeUsdc: v.optional(v.number()),
    rakeUsdc: v.optional(v.number()),
    assetsGained: v.optional(v.any()),
    assetsLost: v.optional(v.any()),
    traderWipedOut: v.optional(v.boolean()),
    wipeoutReason: v.optional(v.string()),
    onChainTxHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dealOutcomes")
      .withIndex("byTraderAndDeal", (q) =>
        q.eq("traderId", args.traderId).eq("dealId", args.dealId)
      )
      .unique();
    if (existing) return existing._id;

    const traderPnlUsdc = args.traderPnlUsdc ?? 0;
    const rakeUsdc = args.rakeUsdc ?? 0;
    const potChangeUsdc =
      args.potChangeUsdc ??
      (traderPnlUsdc > 0
        ? -(traderPnlUsdc + rakeUsdc)
        : Math.abs(traderPnlUsdc));
    const now = Date.now();

    const outcomeId = await ctx.db.insert("dealOutcomes", {
      ...args,
      potChangeUsdc,
      createdAt: now,
    });

    const deal = await ctx.db.get(args.dealId);
    if (deal) {
      const nextPotUsdc = Math.max(0, deal.potUsdc + potChangeUsdc);
      await ctx.db.patch(args.dealId, {
        potUsdc: nextPotUsdc,
        wipeoutCount: args.traderWipedOut
          ? (deal.wipeoutCount ?? 0) + 1
          : (deal.wipeoutCount ?? 0),
        status: nextPotUsdc <= 0 ? "depleted" : deal.status,
        updatedAt: now,
      });
    }

    return outcomeId;
  },
});

/**
 * Find the oldest outcome for a trader that has no on-chain tx hash yet.
 * Used by the agent cycle to retry on-chain `resolveEntry` calls that
 * previously reverted (e.g. FIFO "Trader mismatch") without re-running the
 * LLM. Returns `null` when the trader has no pending on-chain settlement.
 *
 * 24h scope mirrors `findPendingRecoveryEntry` — older orphans are an
 * ops/manual problem and shouldn't keep the cycle waking overnight.
 */
export const findUnresolvedOnChain = internalQuery({
  args: { traderId: v.string(), now: v.number() },
  handler: async (ctx, { traderId, now }) => {
    const since = now - 24 * 60 * 60_000;
    const recent = await ctx.db
      .query("dealOutcomes")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .order("asc")
      .take(100);
    for (const outcome of recent) {
      if (outcome.createdAt < since) continue;
      if (outcome.onChainTxHash) continue;
      // Only retry outcomes for deals that have an on-chain counterpart.
      const deal = await ctx.db.get(outcome.dealId);
      if (
        !deal ||
        deal.onChainDealId === null ||
        deal.onChainDealId === undefined
      ) {
        continue;
      }
      return { outcome, deal };
    }
    return null;
  },
});

/**
 * Find the oldest outcome whose PnL has not been applied to the trader balance.
 * Used when on-chain settlement was delayed (e.g. FIFO mismatch before fix).
 */
export const findUnappliedBalanceOutcome = internalQuery({
  args: { traderId: v.string(), now: v.number() },
  handler: async (ctx, { traderId, now }) => {
    const since = now - 24 * 60 * 60_000;
    const recent = await ctx.db
      .query("dealOutcomes")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .order("asc")
      .take(100);
    for (const outcome of recent) {
      if (outcome.createdAt < since) continue;
      if (outcome.balanceAppliedAt !== undefined) continue;
      return outcome;
    }
    return null;
  },
});

/**
 * Stamp the on-chain settlement tx hash on an existing outcome.
 * Idempotent: a no-op if onChainTxHash is already set.
 *
 * Used by the agent cycle after `resolveEntry` succeeds — we persist the
 * outcome record before attempting the on-chain call so that a contract
 * revert (e.g. FIFO "Trader mismatch") doesn't force a re-LLM on retry.
 * Sentinel values (`reconciled:*`) are written when the chain has no pending
 * entry for this trader but Convex still needs to stop retrying.
 */
export const markOnChainResolved = internalMutation({
  args: {
    outcomeId: v.id("dealOutcomes"),
    onChainTxHash: v.string(),
  },
  handler: async (ctx, { outcomeId, onChainTxHash }) => {
    const outcome = await ctx.db.get(outcomeId);
    if (!outcome) return;
    if (outcome.onChainTxHash) return;
    await ctx.db.patch(outcomeId, { onChainTxHash });
  },
});
