import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const basketEntry = v.object({
  asset: v.string(),
  amount: v.string(),
  symbol: v.union(v.string(), v.null()),
});

const navBucket = v.object({
  minUsd: v.number(),
  maxUsd: v.union(v.number(), v.null()),
  count: v.number(),
});

/**
 * Auth shell + Starter Grant + pool index (#305).
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

  packs: defineTable({
    tokenId: v.number(),
    maker: v.string(),
    basket: v.array(basketEntry),
    /** WAD USD string ($1 = 1e18). */
    navUsdWad: v.union(v.string(), v.null()),
    status: v.union(
      v.literal("resting"),
      v.literal("ripped"),
      v.literal("unlisted")
    ),
    eligible: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_tokenId", ["tokenId"])
    .index("by_status", ["status"])
    .index("by_maker_and_status", ["maker", "status"]),

  poolSnapshots: defineTable({
    key: v.literal("latest"),
    eligibleCount: v.number(),
    restingCount: v.number(),
    /** WAD USD strings. */
    harmonicMeanNavWad: v.union(v.string(), v.null()),
    ripUnitPriceWad: v.union(v.string(), v.null()),
    navDistribution: v.array(navBucket),
    blockNumber: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  chainCursors: defineTable({
    key: v.string(),
    blockNumber: v.number(),
  }).index("by_key", ["key"]),
});
