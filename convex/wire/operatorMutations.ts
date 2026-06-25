import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Dev/ops: delete Wire drops by epoch number, including linked deal seeds.
 */
export const deleteDropsByEpochs = internalMutation({
  args: { epochs: v.array(v.number()) },
  returns: v.object({
    deletedNarratives: v.number(),
    deletedSeeds: v.number(),
    deletedSeedLinks: v.number(),
    deletedEpochs: v.array(v.number()),
  }),
  handler: async (ctx, { epochs }) => {
    const targetEpochs = new Set(epochs);
    const narratives = await ctx.db.query("marketNarratives").collect();
    const toDelete = narratives.filter((n) => targetEpochs.has(n.epoch));

    let deletedSeeds = 0;
    let deletedSeedLinks = 0;

    for (const narrative of toDelete) {
      const seeds = await ctx.db
        .query("wireDealSeeds")
        .withIndex("byEpoch", (q) => q.eq("epochId", narrative._id))
        .collect();

      for (const seed of seeds) {
        const links = await ctx.db
          .query("wireDealSeedLinks")
          .withIndex("bySeed", (q) => q.eq("seedId", seed._id))
          .collect();
        for (const link of links) {
          await ctx.db.delete(link._id);
          deletedSeedLinks++;
        }
        await ctx.db.delete(seed._id);
        deletedSeeds++;
      }

      await ctx.db.delete(narrative._id);
    }

    return {
      deletedNarratives: toDelete.length,
      deletedSeeds,
      deletedSeedLinks,
      deletedEpochs: toDelete.map((n) => n.epoch).sort((a, b) => a - b),
    };
  },
});

/**
 * Dev-only: delete all Wire narrative state (marketNarratives, wireDealSeeds,
 * wireDealSeedLinks). Arc tension resets happen via the subsequent importSeason call.
 * Bounded to 500 rows per table — safe for development volumes.
 */
export const clearNarrativeState = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [seedLinks, seeds, narratives] = await Promise.all([
      ctx.db.query("wireDealSeedLinks").take(500),
      ctx.db.query("wireDealSeeds").take(500),
      ctx.db.query("marketNarratives").take(500),
    ]);

    await Promise.all([
      ...seedLinks.map((r) => ctx.db.delete(r._id)),
      ...seeds.map((r) => ctx.db.delete(r._id)),
      ...narratives.map((r) => ctx.db.delete(r._id)),
    ]);

    return {
      deletedNarratives: narratives.length,
      deletedSeeds: seeds.length,
      deletedSeedLinks: seedLinks.length,
    };
  },
});
