import { internalMutation } from "../_generated/server";
import type { TableNames } from "../_generated/dataModel";
import { deleteAllRows } from "./_batchDelete";

/**
 * Dev-only: hard-delete ALL wire narrative state — seasons, entities, arcs,
 * drops, and deal seeds — for a clean reseed. Used when the narrative schema
 * changes shape (e.g. the `phase` → `arcStage` migration) and stale rows would
 * otherwise fail schema validation.
 *
 * Run via: npx convex run ops/clearNarrativeWorld:clearNarrativeWorld '{}'
 */
export const clearNarrativeWorld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "wireDealSeedLinks",
      "wireDealSeeds",
      "marketNarratives",
      "narrativeArcs",
      "narrativeEntities",
      "narrativeSeasons",
    ] as const satisfies readonly TableNames[];

    const deleted: Record<string, number> = {};
    for (const table of tables) {
      deleted[table] = await deleteAllRows(ctx, table);
    }
    return { deleted };
  },
});
