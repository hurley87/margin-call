import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const positionStatusValidator = v.union(
  v.literal("active"),
  v.literal("closed"),
  v.literal("liquidated")
);

/**
 * Public Position NFT read model for discovery/lifecycle.
 * Base remains authoritative for debt, NAV, and risk.
 *
 * `latestIndexedBlock` + `latestIndexedLogIndex` form a per-position
 * lexicographic cursor; mutable ownership/status only advances on newer events.
 */
export default defineSchema({
  positions: defineTable({
    tokenId: v.string(),
    assetId: v.number(),
    owner: v.string(),
    status: positionStatusValidator,
    openedBlock: v.number(),
    openedTxHash: v.string(),
    latestIndexedBlock: v.number(),
    latestIndexedLogIndex: v.number(),
    terminalBlock: v.optional(v.number()),
    terminalTxHash: v.optional(v.string()),
  })
    .index("by_tokenId", ["tokenId"])
    .index("by_owner", ["owner"])
    .index("by_owner_and_status", ["owner", "status"])
    .index("by_status", ["status"])
    .index("by_assetId_and_status", ["assetId", "status"])
    .index("by_openedBlock", ["openedBlock"]),

  syncState: defineTable({
    key: v.string(),
    cursorBlock: v.number(),
    lastRunAt: v.number(),
  }).index("by_key", ["key"]),
});
