import { internalMutation } from "../_generated/server";
import { deleteAllRows } from "./_batchDelete";

/**
 * Dev/ops: wipe ALL wire + narrative state so the rebuilt engine can reseed
 * cleanly. The rebuild redefined arcStage (fraud lifecycle → attention
 * lifecycle) and entity kinds, so legacy rows must be cleared rather than
 * migrated (the DB is resettable). Run BEFORE the strict-schema push:
 *
 *   npx convex run ops/resetNarrative:clearNarrative '{}'
 *   npx convex run seasons:importSeason '{}'
 *
 * Does NOT touch deals / traders / players / on-chain state.
 */
export const clearNarrative = internalMutation({
  args: {},
  handler: async (ctx) => {
    const deleted = {
      wireDealSeedLinks: await deleteAllRows(ctx, "wireDealSeedLinks"),
      wireDealSeeds: await deleteAllRows(ctx, "wireDealSeeds"),
      marketNarratives: await deleteAllRows(ctx, "marketNarratives"),
      narrativeArcs: await deleteAllRows(ctx, "narrativeArcs"),
      narrativeEntities: await deleteAllRows(ctx, "narrativeEntities"),
      narrativeSeasons: await deleteAllRows(ctx, "narrativeSeasons"),
      tokenSnapshots: await deleteAllRows(ctx, "tokenSnapshots"),
    };
    return deleted;
  },
});
