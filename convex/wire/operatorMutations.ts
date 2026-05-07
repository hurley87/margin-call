import { internalMutation } from "../_generated/server";

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
