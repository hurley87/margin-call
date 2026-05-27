import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * Recent deal outcomes for the desk's traders (or scoped to one).
 * Terminal-friendly: includes P&L, wipeouts, assets, tx hashes.
 */
export const get = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.optional(v.id("traders")),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { deskManagerId, traderId, since, limit = 20 }) => {
    const bounded = Math.min(Math.max(1, limit), 100);

    let traderIds: Id<"traders">[] = [];
    if (traderId) {
      const t = await ctx.db.get(traderId);
      if (t && t.deskManagerId === deskManagerId) traderIds = [traderId];
    } else {
      const ts = await ctx.db
        .query("traders")
        .withIndex("byDeskManager", (q) => q.eq("deskManagerId", deskManagerId))
        .take(30);
      traderIds = ts.map((t) => t._id);
    }

    if (traderIds.length === 0) {
      return { outcomes: [], count: 0 };
    }

    const perTrader = await Promise.all(
      traderIds.map((tid) =>
        ctx.db
          .query("dealOutcomes")
          .withIndex("byTrader", (q) => q.eq("traderId", tid))
          .order("desc")
          .take(50)
      )
    );

    let all = perTrader.flat().filter((o) => o.createdAt >= since);
    all.sort((a, b) => b.createdAt - a.createdAt);
    all = all.slice(0, bounded);

    const out = await Promise.all(
      all.map(async (o) => {
        const [deal, trader] = await Promise.all([
          o.dealId ? ctx.db.get(o.dealId) : null,
          ctx.db.get(o.traderId as Id<"traders">),
        ]);
        return {
          outcomeId: o._id,
          traderId: o.traderId,
          traderName: trader?.name ?? null,
          dealId: o.dealId,
          dealPrompt: deal?.prompt ?? null,
          traderPnlUsdc: o.traderPnlUsdc ?? 0,
          potChangeUsdc: o.potChangeUsdc ?? 0,
          rakeUsdc: o.rakeUsdc ?? 0,
          traderWipedOut: !!o.traderWipedOut,
          wipeoutReason: o.wipeoutReason ?? null,
          assetsGained: o.assetsGained ?? null,
          assetsLost: o.assetsLost ?? null,
          onChainTxHash: o.onChainTxHash ?? null,
          createdAt: o.createdAt,
        };
      })
    );

    return {
      outcomes: out,
      count: out.length,
    };
  },
});
