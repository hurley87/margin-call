import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Internal: issue a new SIWA nonce.
 * Returns true on success, false if the nonce already exists (unique guard).
 */
export const issue = internalMutation({
  args: { nonce: v.string(), expiresAt: v.number() },
  handler: async (ctx, { nonce, expiresAt }) => {
    // Idempotency guard: unique nonce
    const existing = await ctx.db
      .query("siwaNonces")
      .withIndex("byNonce", (q) => q.eq("nonce", nonce))
      .unique();
    if (existing) return false;

    await ctx.db.insert("siwaNonces", {
      nonce,
      expiresAt,
      createdAt: Date.now(),
    });
    return true;
  },
});

/**
 * Internal: consume a SIWA nonce (atomic delete-if-valid).
 * Returns true if the nonce existed, was unexpired, and was deleted.
 */
export const consume = internalMutation({
  args: { nonce: v.string() },
  handler: async (ctx, { nonce }) => {
    const row = await ctx.db
      .query("siwaNonces")
      .withIndex("byNonce", (q) => q.eq("nonce", nonce))
      .unique();

    if (!row) return false;
    if (row.expiresAt < Date.now()) {
      // Expired — delete but report invalid
      await ctx.db.delete(row._id);
      return false;
    }

    await ctx.db.delete(row._id);
    return true;
  },
});

/**
 * Internal: find a trader by tokenId (ERC-8004 token id).
 * Convenience query for SIWA verification without auth.
 */
export const findTraderByTokenId = internalQuery({
  args: { tokenId: v.number() },
  handler: async (ctx, { tokenId }) => {
    const traders = await ctx.db.query("traders").collect();
    const trader = traders.find((t) => t.tokenId === tokenId);
    if (!trader) return null;
    return {
      _id: trader._id,
      cdpOwnerAddress: trader.cdpOwnerAddress,
      cdpWalletAddress: trader.cdpWalletAddress,
    };
  },
});
