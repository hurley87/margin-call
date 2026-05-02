import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// ── Public queries ─────────────────────────────────────────────────────────

/** List assets for a trader — auth-checked (must be owner). */
export const listByTrader = query({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const trader = await ctx.db.get(traderId);
    if (!trader || trader.ownerSubject !== identity.subject) return [];
    return ctx.db
      .query("assets")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .collect();
  },
});

// ── Internal queries ───────────────────────────────────────────────────────

/** Internal: load all assets for a trader without auth (for cycle LLM context). */
export const listForTraderInternal = internalQuery({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) =>
    ctx.db
      .query("assets")
      .withIndex("byTrader", (q) => q.eq("traderId", traderId))
      .collect(),
});
