import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

/**
 * Read-only list of a desk's traders for MCP `list_traders`.
 * Returns compact terminal-usable fields + recent 30d P&L per trader + latest activity snippet.
 * `since` passed in so this query never calls Date.now().
 */
export const list = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { deskManagerId, since, limit = 20 }) => {
    const bounded = Math.min(Math.max(1, limit), 50);

    const traders = await ctx.db
      .query("traders")
      .withIndex("byDeskManager", (q) => q.eq("deskManagerId", deskManagerId))
      .order("desc")
      .take(bounded);

    const results = await Promise.all(
      traders.map(async (t) => {
        const recentOutcomes = await ctx.db
          .query("dealOutcomes")
          .withIndex("byTrader", (q) => q.eq("traderId", t._id))
          .order("desc")
          .take(100);
        let recentPnlUsdc = 0;
        for (const o of recentOutcomes) {
          if (o.createdAt >= since && typeof o.traderPnlUsdc === "number") {
            recentPnlUsdc += o.traderPnlUsdc;
          }
        }

        const latestAct = await ctx.db
          .query("agentActivityLog")
          .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", t._id))
          .order("desc")
          .take(1);
        const lastActivity =
          latestAct[0] != null
            ? {
                at: latestAct[0].createdAt,
                type: latestAct[0].activityType,
                message: latestAct[0].message,
              }
            : null;

        return {
          traderId: t._id,
          name: t.name,
          status: t.status,
          tokenId: t.tokenId ?? null,
          escrowBalanceUsdc: t.escrowBalanceUsdc ?? 0,
          mandate: t.mandate ?? null,
          personality: t.personality ?? null,
          walletStatus: t.walletStatus,
          cdpWalletAddress: t.cdpWalletAddress ?? null,
          recentPnlUsdc,
          lastCycleAt: t.lastCycleAt ?? null,
          lastActivity,
          createdAt: t.createdAt,
        };
      })
    );

    return {
      traders: results,
      count: results.length,
    };
  },
});
