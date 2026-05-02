import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * SIWA nonce retention policy:
 *   - Nonces are issued with a caller-supplied TTL (typically 5 minutes per SIWA spec).
 *   - A Convex cron (convex/crons.ts) runs `cleanup` every hour to purge expired rows.
 *   - `consume` deletes the row atomically; a second call returns null (idempotent).
 */

/** Internal: insert a new nonce row. Returns false if the nonce already exists (idempotent). */
export const issue = internalMutation({
  args: {
    nonce: v.string(),
    /** Unix timestamp (ms) when this nonce expires. */
    expiresAt: v.number(),
  },
  handler: async (ctx, { nonce, expiresAt }) => {
    // Idempotency: if the nonce is already stored just return true
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
 * Internal: read the nonce row without side-effects.
 * Returns null if not found or already expired.
 */
export const find = internalQuery({
  args: { nonce: v.string() },
  handler: async (ctx, { nonce }) => {
    const row = await ctx.db
      .query("siwaNonces")
      .withIndex("byNonce", (q) => q.eq("nonce", nonce))
      .unique();
    if (!row) return null;
    if (row.expiresAt < Date.now()) return null;
    return row;
  },
});

/**
 * Internal: atomically validate and delete a nonce.
 *
 * Returns:
 *   "ok"               — nonce existed, was valid, and has been deleted
 *   "expired"          — nonce existed but its TTL had passed (row deleted as a side-effect)
 *   "notFound"         — nonce never existed or was already consumed
 *
 * This is idempotent: a second call on the same nonce always returns "notFound".
 */
export const consume = internalMutation({
  args: { nonce: v.string() },
  handler: async (ctx, { nonce }): Promise<"ok" | "expired" | "notFound"> => {
    const row = await ctx.db
      .query("siwaNonces")
      .withIndex("byNonce", (q) => q.eq("nonce", nonce))
      .unique();

    if (!row) return "notFound";

    // Always delete — whether valid or expired — so the row is consumed exactly once
    await ctx.db.delete(row._id);

    if (row.expiresAt < Date.now()) return "expired";
    return "ok";
  },
});

/**
 * Internal: delete all rows whose expiresAt is in the past.
 * Called by the hourly cron in convex/crons.ts.
 * Safe to run concurrently; each row is deleted at most once.
 */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("siwaNonces")
      .withIndex("byExpiresAt", (q) => q.lt("expiresAt", now))
      .collect();

    await Promise.all(expired.map((row) => ctx.db.delete(row._id)));
    return { deleted: expired.length };
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
