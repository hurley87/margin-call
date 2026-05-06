import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

/** Public wire feed: grouped Wire Drops with nested dispatches (no auth). */
export const feedDrops = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }) => {
    const cap = Math.min(Math.max(limit, 1), 50);
    const narratives = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .take(cap);

    type DispatchItem = {
      headline: string;
      body: string;
      category: string;
      role?: string;
    };

    return narratives.map((n) => {
      const dispatches = (n.headlines ?? []) as DispatchItem[];
      const ws = (n.worldState ?? {}) as {
        mood?: string;
        sec_heat?: number;
      };
      return {
        epoch: n.epoch,
        epochSlot: n.epochSlot ?? null,
        dropTitle: n.dropTitle ?? null,
        topArcTitle: n.topArcTitle ?? null,
        topArcTension: n.topArcTension ?? null,
        mood: ws.mood ?? "unknown",
        secHeat: ws.sec_heat ?? 0,
        createdAt: new Date(n.createdAt).toISOString(),
        dispatches: dispatches.map((d) => ({
          headline: d.headline,
          body: d.body,
          category: d.category,
          role: d.role ?? "supporting",
        })),
      };
    });
  },
});

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

/** Authenticated: recent narrative epochs (newest-first). */
export const listRecentEpochs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .take(limit);
  },
});

/** Internal: get the latest market narrative for cycle LLM context. */
export const getLatestInternal = internalQuery({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("marketNarratives").withIndex("byEpoch").order("desc").first(),
});
