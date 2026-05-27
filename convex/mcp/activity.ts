import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * MCP read for recent activity (desk-wide or per-trader).
 * Returns both structured entries and pre-formatted `lines` for direct terminal display.
 * `since` passed from caller (no Date.now inside query).
 */
export const get = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.optional(v.id("traders")),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { deskManagerId, traderId, since, limit = 30 }) => {
    const bounded = Math.min(Math.max(1, limit), 100);

    let traderIds: Id<"traders">[] = [];
    if (traderId) {
      const t = await ctx.db.get(traderId);
      if (t && t.deskManagerId === deskManagerId) {
        traderIds = [traderId];
      }
    } else {
      const traders = await ctx.db
        .query("traders")
        .withIndex("byDeskManager", (q) => q.eq("deskManagerId", deskManagerId))
        .take(50);
      traderIds = traders.map((t) => t._id);
    }

    if (traderIds.length === 0) {
      return { activity: [], lines: [], count: 0 };
    }

    const perTrader = await Promise.all(
      traderIds.map((tid) =>
        ctx.db
          .query("agentActivityLog")
          .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", tid))
          .order("desc")
          .take(bounded)
      )
    );

    const all = perTrader.flat().filter((a) => a.createdAt >= since);
    all.sort((a, b) => b.createdAt - a.createdAt);
    const limited = all.slice(0, bounded);

    const traderDocs = await Promise.all(
      traderIds.map((tid) => ctx.db.get(tid))
    );
    const nameMap: Record<string, string> = {};
    for (const t of traderDocs) {
      if (t) nameMap[t._id] = t.name;
    }

    const lines = limited.map((a) => {
      const ts = new Date(a.createdAt)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ");
      const who = nameMap[a.traderId] ?? "Trader";
      const shortMsg =
        a.message.length > 120 ? a.message.slice(0, 117) + "..." : a.message;
      return `[${ts}] ${who}: ${shortMsg}`;
    });

    return {
      activity: limited.map((a) => ({
        traderId: a.traderId,
        traderName: nameMap[a.traderId] ?? null,
        activityType: a.activityType,
        message: a.message,
        dealId: a.dealId ?? null,
        createdAt: a.createdAt,
      })),
      lines,
      count: limited.length,
    };
  },
});
