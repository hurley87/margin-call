import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Internal helpers for MCP API key lifecycle. Keys are issued from
 * Privy-authenticated Next.js routes (raw keys never reach Convex).
 */

const LAST_USED_DEBOUNCE_MS = 5 * 60 * 1000;

export const create = internalMutation({
  args: {
    keyHash: v.string(),
    deskManagerId: v.id("deskManagers"),
  },
  handler: async (ctx, { keyHash, deskManagerId }) => {
    return await ctx.db.insert("mcpApiKeys", {
      keyHash,
      deskManagerId,
      createdAt: Date.now(),
    });
  },
});

export const lookupDeskByKeyHash = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const keyDoc = await ctx.db
      .query("mcpApiKeys")
      .withIndex("byKeyHash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!keyDoc || keyDoc.revokedAt != null) {
      return null;
    }
    const desk = await ctx.db.get(keyDoc.deskManagerId);
    if (!desk) return null;
    return {
      deskManagerId: keyDoc.deskManagerId,
      walletAddress: desk.walletAddress,
    };
  },
});

export const touchLastUsed = internalMutation({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const keyDoc = await ctx.db
      .query("mcpApiKeys")
      .withIndex("byKeyHash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!keyDoc || keyDoc.revokedAt != null) return;
    const now = Date.now();
    if (
      keyDoc.lastUsedAt != null &&
      now - keyDoc.lastUsedAt < LAST_USED_DEBOUNCE_MS
    ) {
      return;
    }
    await ctx.db.patch(keyDoc._id, { lastUsedAt: now });
  },
});
