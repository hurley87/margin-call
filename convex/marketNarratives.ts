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

/** Public wire feed: flattened headlines from recent epochs (no auth). */
export const feedHeadlines = query({
  args: { maxEpochs: v.optional(v.number()) },
  handler: async (ctx, { maxEpochs = 20 }) => {
    const cap = Math.min(Math.max(maxEpochs, 1), 50);
    const narratives = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .take(cap);

    type Headline = { headline: string; body: string; category: string };

    const feed: {
      headline: string;
      body: string;
      category: string;
      epoch: number;
      created_at: string;
      mood: string;
      sec_heat: number;
    }[] = [];

    for (const n of narratives) {
      const headlines = (n.headlines ?? []) as Headline[];
      const ws = (n.worldState ?? {}) as {
        mood?: string;
        sec_heat?: number;
      };
      const createdAt = new Date(n.createdAt).toISOString();
      for (const h of headlines) {
        feed.push({
          headline: h.headline,
          body: h.body,
          category: h.category,
          epoch: n.epoch,
          created_at: createdAt,
          mood: ws.mood ?? "unknown",
          sec_heat: ws.sec_heat ?? 0,
        });
      }
    }

    return feed;
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
