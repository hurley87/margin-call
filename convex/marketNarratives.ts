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
      dispatchKey?: string;
    };

    return Promise.all(
      narratives.map(async (n) => {
        const dispatches = (n.headlines ?? []) as DispatchItem[];
        const ws = (n.worldState ?? {}) as {
          mood?: string;
          sec_heat?: number;
        };

        const seeds = await ctx.db
          .query("wireDealSeeds")
          .withIndex("byEpoch", (q) => q.eq("epochId", n._id))
          .collect();

        const seedAggregates = await Promise.all(
          seeds.map(async (s) => {
            const links = await ctx.db
              .query("wireDealSeedLinks")
              .withIndex("bySeed", (q) => q.eq("seedId", s._id))
              .take(100);
            const deals = await Promise.all(
              links.map((link) => ctx.db.get(link.dealId))
            );
            const linkedPotTotalUsdc = deals.reduce(
              (sum, d) => (d ? sum + d.potUsdc : sum),
              0
            );
            return {
              seed: s,
              linkedDealCount: links.length,
              linkedPotTotalUsdc,
            };
          })
        );

        const seedByDispatchKey = new Map(
          seedAggregates.map((agg) => [agg.seed.dispatchKey, agg])
        );

        return {
          epoch: n.epoch,
          epochSlot: n.epochSlot ?? null,
          dropTitle: n.dropTitle ?? null,
          topArcTitle: n.topArcTitle ?? null,
          topArcTension: n.topArcTension ?? null,
          arcStage: n.arcStage ?? null,
          isFlash: n.isFlash ?? false,
          subjects: n.subjects ?? [],
          mood: ws.mood ?? "unknown",
          secHeat: ws.sec_heat ?? 0,
          createdAt: new Date(n.createdAt).toISOString(),
          dispatches: dispatches.map((d) => {
            const agg = d.dispatchKey
              ? seedByDispatchKey.get(d.dispatchKey)
              : undefined;
            return {
              headline: d.headline,
              body: d.body,
              category: d.category,
              role: d.role ?? "supporting",
              dispatchKey: d.dispatchKey,
              dealSeed: agg
                ? {
                    seedId: agg.seed._id,
                    arcId: agg.seed.arcId,
                    prompt: agg.seed.prompt,
                    suggestedPotUsdc: agg.seed.suggestedPotUsdc,
                    suggestedEntryCostUsdc: agg.seed.suggestedEntryCostUsdc,
                    linkedDealCount: agg.linkedDealCount,
                    linkedPotTotalUsdc: agg.linkedPotTotalUsdc,
                  }
                : undefined,
            };
          }),
        };
      })
    );
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
