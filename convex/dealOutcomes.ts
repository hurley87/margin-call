import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// ── Public queries ─────────────────────────────────────────────────────────

/** Get all outcomes for a deal — auth-checked. */
export const listByDeal = query({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return ctx.db
      .query("dealOutcomes")
      .withIndex("byDeal", (q) => q.eq("dealId", dealId))
      .order("desc")
      .collect();
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

    return ctx.db.insert("dealOutcomes", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
