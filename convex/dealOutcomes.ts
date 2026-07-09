import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

// ── Public queries ─────────────────────────────────────────────────────────

/** Get all outcomes for a deal — creator desk or participating trader owner only. */
export const listByDeal = query({
  args: { dealId: v.id("deals") },
  returns: v.array(v.any()),
  handler: async (ctx, { dealId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const deal = await ctx.db.get(dealId);
    if (!deal) return [];

    const dm = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();

    let allowed = dm != null && deal.creatorDeskManagerId === dm._id;

    if (!allowed) {
      const myTraders = await ctx.db
        .query("traders")
        .withIndex("byOwner", (q) => q.eq("ownerSubject", identity.subject))
        .collect();
      if (myTraders.length > 0) {
        const myTraderIds = new Set(myTraders.map((t) => String(t._id)));
        const entries = await ctx.db
          .query("dealEntries")
          .withIndex("byDeal", (q) => q.eq("dealId", dealId))
          .collect();
        allowed = entries.some((e) => myTraderIds.has(String(e.traderId)));
      }
    }

    if (!allowed) return [];

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
  args: { traderId: v.id("traders"), dealId: v.id("deals") },
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
  args: { traderId: v.id("traders") },
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
  args: { traderId: v.id("traders"), limit: v.number() },
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
    siblingTraderIds: v.array(v.id("traders")),
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
    traderId: v.id("traders"),
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
  args: { traderId: v.id("traders"), now: v.number() },
  handler: async (ctx, { traderId, now }) => {
    const since = now - 24 * 60 * 60_000;
    // Newest-first so the 24h window is anchored at the head — once we cross
    // the boundary we can stop, no risk of being capped by oldest-100.
    const recent = await ctx.db
      .query("dealOutcomes")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .order("desc")
      .take(100);
    let oldestOutcome: Doc<"dealOutcomes"> | null = null;
    let oldestDeal: Doc<"deals"> | null = null;
    for (const outcome of recent) {
      if (outcome.createdAt < since) break;
      if (outcome.onChainTxHash) continue;
      const deal = await ctx.db.get(outcome.dealId);
      if (
        !deal ||
        deal.onChainDealId === null ||
        deal.onChainDealId === undefined
      ) {
        continue;
      }
      // Keep iterating to find the oldest (within the 24h window) — same
      // semantics as the prior ascending scan but with a bounded take.
      oldestOutcome = outcome;
      oldestDeal = deal;
    }
    if (!oldestOutcome || !oldestDeal) return null;
    return { outcome: oldestOutcome, deal: oldestDeal };
  },
});

/**
 * Find the oldest outcome whose PnL has not been applied to the trader balance
 * AND whose on-chain settlement is known to have landed (real onChainTxHash).
 *
 * The on-chain gate prevents us from applying off-chain PnL before the contract
 * has actually moved funds — earlier the cycle could otherwise double-debit a
 * trader whose `resolveEntry` was still pending on the head of the FIFO queue.
 */
export const findUnappliedBalanceOutcome = internalQuery({
  args: { traderId: v.id("traders"), now: v.number() },
  handler: async (ctx, { traderId, now }) => {
    const since = now - 24 * 60 * 60_000;
    const recent = await ctx.db
      .query("dealOutcomes")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .order("desc")
      .take(100);
    let oldestUnapplied: Doc<"dealOutcomes"> | null = null;
    for (const outcome of recent) {
      if (outcome.createdAt < since) break;
      if (outcome.balanceAppliedAt !== undefined) continue;
      if (!outcome.onChainTxHash) continue;
      oldestUnapplied = outcome;
    }
    return oldestUnapplied;
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

/**
 * Void an outcome that cannot or should not be applied to the trader balance.
 * Stamps both `onChainTxHash` (sentinel) and `balanceAppliedAt` so that the
 * recovery queries stop returning it and no PnL is ever applied. Use when the
 * chain reports `already_resolved` for either reason — we don't know whether
 * the chain credited/debited the trader, so we let the next on-chain balance
 * sync reconcile rather than trusting the LLM-computed PnL.
 */
export const voidOnChainOutcome = internalMutation({
  args: {
    outcomeId: v.id("dealOutcomes"),
    onChainTxHash: v.string(),
  },
  handler: async (ctx, { outcomeId, onChainTxHash }) => {
    const outcome = await ctx.db.get(outcomeId);
    if (!outcome) return;
    const patch: {
      onChainTxHash?: string;
      balanceAppliedAt?: number;
    } = {};
    if (!outcome.onChainTxHash) {
      patch.onChainTxHash = onChainTxHash;
    }
    if (outcome.balanceAppliedAt === undefined) {
      patch.balanceAppliedAt = Date.now();
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(outcomeId, patch);
    }
  },
});
