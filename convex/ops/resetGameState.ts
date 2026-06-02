import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { TableNames } from "../_generated/dataModel";

/**
 * Operator wipe: delete all player/game state for a fresh start on a new escrow.
 * Keeps seeded systemPrompts + narrative season/entity/arc rows.
 * Does NOT touch on-chain balances or deals.
 *
 * Run via:
 *   npx convex run ops/resetGameState:resetGameState '{}'
 *   npx convex run ops/resetGameState:resetGameState '{"confirm":true}'
 */
export const resetGameState = internalMutation({
  args: {
    confirm: v.optional(v.boolean()),
    secret: v.optional(v.string()),
  },
  handler: async (ctx, { confirm, secret }) => {
    const expected = process.env.GAME_RESET_ADMIN_SECRET;
    if (!expected) {
      throw new Error(
        "GAME_RESET_ADMIN_SECRET is not configured in Convex env"
      );
    }
    if (secret !== expected) {
      throw new Error("Invalid reset secret");
    }

    const tables = [
      "dealEntries",
      "dealOutcomes",
      "dealApprovals",
      "agentActivityLog",
      "traderTransactions",
      "assets",
      "emailNotifications",
      "wireDealSeedLinks",
      "deals",
      "mcpIntents",
      "mcpRequests",
      "mcpApiKeys",
    ] as const satisfies readonly TableNames[];

    if (!confirm) {
      const preview: Record<string, number> = {};
      for (const table of tables) {
        preview[table] = (await ctx.db.query(table).take(500)).length;
      }
      preview.traders = (await ctx.db.query("traders").take(500)).length;
      preview.deskManagers = (
        await ctx.db.query("deskManagers").take(500)
      ).length;
      preview.siwaNonces = (await ctx.db.query("siwaNonces").take(500)).length;
      preview.wireDealSeeds = (
        await ctx.db.query("wireDealSeeds").take(500)
      ).length;
      preview.marketNarratives = (
        await ctx.db.query("marketNarratives").take(500)
      ).length;
      return { dryRun: true, preview, note: "Pass confirm:true to execute" };
    }

    const deleted: Record<string, number> = {};

    for (const table of tables) {
      deleted[table] = await deleteAllRows(ctx, table);
    }

    deleted.traders = await deleteAllTraders(ctx);
    deleted.deskManagers = await deleteAllRows(ctx, "deskManagers");
    deleted.siwaNonces = await deleteAllRows(ctx, "siwaNonces");
    deleted.wireDealSeeds = await deleteAllRows(ctx, "wireDealSeeds");
    deleted.marketNarratives = await deleteAllRows(ctx, "marketNarratives");

    return { dryRun: false, deleted };
  },
});

async function deleteAllRows(
  ctx: MutationCtx,
  table: TableNames,
  batchSize = 500
): Promise<number> {
  let deleted = 0;
  while (true) {
    const rows = await ctx.db.query(table).take(batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      await ctx.db.delete(row._id);
      deleted++;
    }
  }
  return deleted;
}

async function deleteAllTraders(ctx: MutationCtx): Promise<number> {
  let deleted = 0;
  while (true) {
    const traders = await ctx.db.query("traders").take(500);
    if (traders.length === 0) break;
    for (const trader of traders) {
      if (trader.profileImageStorageId) {
        await ctx.storage.delete(trader.profileImageStorageId);
      }
      await ctx.db.delete(trader._id);
      deleted++;
    }
  }
  return deleted;
}
