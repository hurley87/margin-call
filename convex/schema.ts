import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Auth shell + Starter Grant (#305). Pool index tables land with the indexer.
 */
export default defineSchema({
  siwaNonces: defineTable({
    nonce: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("byNonce", ["nonce"])
    .index("byExpiresAt", ["expiresAt"]),

  starterGrants: defineTable({
    walletAddress: v.string(),
    privySubject: v.string(),
    grantedAt: v.number(),
    grantAmount: v.number(),
    lastRefillAt: v.union(v.number(), v.null()),
    refillCount: v.number(),
    configVersion: v.number(),
    lastMintTxHash: v.optional(v.string()),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_subject", ["privySubject"]),
});
