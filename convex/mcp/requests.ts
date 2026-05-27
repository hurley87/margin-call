import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

/** For HTTP write idempotency: latest matching audit row within the TTL window. */
export const findRecentByKey = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    idempotencyKey: v.string(),
    tool: v.string(),
    /** Only consider rows with createdAt >= minCreatedAt (caller: now - 24h). */
    minCreatedAt: v.number(),
  },
  handler: async (
    ctx,
    { deskManagerId, idempotencyKey, tool, minCreatedAt }
  ) => {
    const rows = await ctx.db
      .query("mcpRequests")
      .withIndex("byDeskManagerAndIdempotencyKey", (q) =>
        q
          .eq("deskManagerId", deskManagerId)
          .eq("idempotencyKey", idempotencyKey)
      )
      .collect();

    let newest: (typeof rows)[number] | null = null;
    for (const row of rows) {
      if (row.tool !== tool) continue;
      if (row.createdAt < minCreatedAt) continue;
      if (row.result === undefined && row.error === undefined) continue;
      if (!newest || row.createdAt > newest.createdAt) {
        newest = row;
      }
    }
    return newest;
  },
});

/**
 * Audit logger for MCP tool invocations. `requestBody` and `idempotencyKey`
 * are reserved for write tools (Phase 2+) and unset in Phase 1 reads.
 */
export const log = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    tool: v.string(),
    requestBody: v.optional(v.any()),
    idempotencyKey: v.optional(v.string()),
    result: v.optional(v.any()),
    txHash: v.optional(v.string()),
    durationMs: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("mcpRequests", args);
  },
});
