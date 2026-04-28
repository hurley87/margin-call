import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

/** Public: get the latest market narrative epoch. */
export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .first();
  },
});

/** Internal: get the latest market narrative for cycle LLM context. */
export const getLatestInternal = internalQuery({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("marketNarratives").withIndex("byEpoch").order("desc").first(),
});
