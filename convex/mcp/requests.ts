import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

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
