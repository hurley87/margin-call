import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

/**
 * Read-only list of recent wire deal seeds for MCP `list_newswire`.
 *
 * Each seed is a newswire post the desk can spin a deal against: it carries the
 * dispatch headline, a suggested deal prompt, and suggested pot/entry economics.
 * The desk browses these, picks one, and passes its `seedId` to `create_deal`.
 *
 * Mirrors the seed/link aggregation in `marketNarratives.feedDrops` so deals
 * created via MCP land in the same wire feed as web-created ones.
 */
export const listSeeds = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 20 }) => {
    const bounded = Math.min(Math.max(1, limit), 50);

    // Newest-first by creation time (no dedicated index needed).
    const seeds = await ctx.db
      .query("wireDealSeeds")
      .order("desc")
      .take(bounded);

    const items = await Promise.all(
      seeds.map(async (s) => {
        const links = await ctx.db
          .query("wireDealSeedLinks")
          .withIndex("bySeed", (q) => q.eq("seedId", s._id))
          .take(100);

        const epoch = await ctx.db.get(s.epochId);
        const ws = (epoch?.worldState ?? {}) as {
          mood?: string;
          sec_heat?: number;
        };

        return {
          seedId: s._id,
          dispatchHeadline: s.dispatchHeadline,
          prompt: s.prompt,
          suggestedPotUsdc: s.suggestedPotUsdc,
          suggestedEntryCostUsdc: s.suggestedEntryCostUsdc,
          epoch: epoch?.epoch ?? null,
          arcStage: epoch?.arcStage ?? null,
          mood: ws.mood ?? "unknown",
          secHeat: ws.sec_heat ?? 0,
          linkedDealCount: links.length,
          createdAt: s.createdAt,
        };
      })
    );

    return { seeds: items, count: items.length };
  },
});

/**
 * Load a single wire deal seed for the MCP `create_deal` prepare step.
 * Returns the suggested prompt/economics and the dispatch headline used as the
 * deal's `sourceHeadline`.
 */
export const getSeed = internalQuery({
  args: { seedId: v.id("wireDealSeeds") },
  handler: async (ctx, { seedId }) => {
    const seed = await ctx.db.get(seedId);
    if (!seed)
      throw new Error("Newswire post not found (invalid wireDealSeedId)");
    return {
      seedId: seed._id,
      prompt: seed.prompt,
      suggestedPotUsdc: seed.suggestedPotUsdc,
      suggestedEntryCostUsdc: seed.suggestedEntryCostUsdc,
      dispatchHeadline: seed.dispatchHeadline,
    };
  },
});
