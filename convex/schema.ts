import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  deskManagers: defineTable({
    // Privy subject (e.g. "did:privy:xxx")
    subject: v.string(),
    walletAddress: v.optional(v.string()),
    displayName: v.optional(v.string()),
    settings: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("bySubject", ["subject"]),

  traders: defineTable({
    deskManagerId: v.id("deskManagers"),
    // Privy subject for fast ownership queries without join
    ownerSubject: v.string(),
    name: v.string(),
    // agent status
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("wiped_out")
    ),
    mandate: v.optional(v.any()),
    personality: v.optional(v.string()),
    escrowBalanceUsdc: v.optional(v.number()),
    lastCycleAt: v.optional(v.number()),
    // CDP wallet pipeline
    walletStatus: v.union(
      v.literal("pending"),
      v.literal("creating"),
      v.literal("ready"),
      v.literal("error")
    ),
    walletError: v.optional(v.string()),
    // wallet metadata (set when walletStatus === "ready")
    cdpWalletAddress: v.optional(v.string()),
    cdpOwnerAddress: v.optional(v.string()),
    cdpAccountName: v.optional(v.string()),
    tokenId: v.optional(v.number()),
    tbaAddress: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byOwner", ["ownerSubject"])
    .index("byDeskManager", ["deskManagerId"])
    .index("byStatus", ["status"])
    .index("byOwnerAndName", ["ownerSubject", "name"])
    .index("byCreatedAt", ["createdAt"]),

  deals: defineTable({
    // nullable: on-chain synced deals use creatorAddress instead
    creatorDeskManagerId: v.optional(v.id("deskManagers")),
    creatorAddress: v.optional(v.string()),
    creatorType: v.union(v.literal("desk_manager"), v.literal("agent")),
    prompt: v.string(),
    potUsdc: v.number(),
    entryCostUsdc: v.number(),
    maxExtractionPercentage: v.optional(v.number()),
    feeUsdc: v.optional(v.number()),
    status: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("depleted")
    ),
    entryCount: v.optional(v.number()),
    wipeoutCount: v.optional(v.number()),
    onChainDealId: v.optional(v.number()),
    onChainTxHash: v.optional(v.string()),
    sourceHeadline: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byStatus", ["status"])
    .index("byCreator", ["creatorDeskManagerId"])
    .index("byOnChainDealId", ["onChainDealId"])
    .index("byCreatedAt", ["createdAt"]),

  dealOutcomes: defineTable({
    dealId: v.id("deals"),
    // trader_id can reference either deskManagers or traders
    traderId: v.string(),
    narrative: v.optional(v.any()),
    traderPnlUsdc: v.optional(v.number()),
    potChangeUsdc: v.optional(v.number()),
    rakeUsdc: v.optional(v.number()),
    assetsGained: v.optional(v.any()),
    assetsLost: v.optional(v.any()),
    traderWipedOut: v.optional(v.boolean()),
    wipeoutReason: v.optional(v.string()),
    onChainTxHash: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("byDeal", ["dealId"])
    .index("byTrader", ["traderId"])
    .index("byTraderAndDeal", ["traderId", "dealId"])
    .index("byCreatedAt", ["createdAt"]),

  dealApprovals: defineTable({
    traderId: v.id("traders"),
    dealId: v.id("deals"),
    deskManagerId: v.id("deskManagers"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("expired"),
      v.literal("consumed")
    ),
    entryCostUsdc: v.number(),
    potUsdc: v.number(),
    expiresAt: v.number(),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("byTrader", ["traderId"])
    .index("byDeskManager", ["deskManagerId"])
    .index("byDeskManagerAndStatus", ["deskManagerId", "status"])
    .index("byStatus", ["status"])
    .index("byDeal", ["dealId"]),

  agentActivityLog: defineTable({
    traderId: v.id("traders"),
    activityType: v.string(),
    message: v.string(),
    dealId: v.optional(v.id("deals")),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("byTrader", ["traderId"])
    .index("byTraderAndCreatedAt", ["traderId", "createdAt"])
    .index("byActivityType", ["activityType"]),

  traderTransactions: defineTable({
    traderId: v.id("traders"),
    type: v.union(
      v.literal("deposit"),
      v.literal("withdrawal"),
      v.literal("enter"),
      v.literal("resolve")
    ),
    txHash: v.string(),
    blockNumber: v.optional(v.number()),
    amountUsdc: v.optional(v.number()),
    dealId: v.optional(v.id("deals")),
    onChainDealId: v.optional(v.number()),
    pnlUsdc: v.optional(v.number()),
    rakeUsdc: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("byTrader", ["traderId"])
    .index("byTraderAndCreatedAt", ["traderId", "createdAt"])
    .index("byTxHash", ["txHash"]),

  assets: defineTable({
    traderId: v.id("traders"),
    name: v.string(),
    valueUsdc: v.optional(v.number()),
    sourceDealId: v.optional(v.id("deals")),
    sourceOutcomeId: v.optional(v.id("dealOutcomes")),
    acquiredAt: v.number(),
  })
    .index("byTrader", ["traderId"])
    .index("byDeal", ["sourceDealId"]),

  marketNarratives: defineTable({
    epoch: v.number(),
    headlines: v.any(),
    worldState: v.any(),
    rawNarrative: v.string(),
    eventsIngested: v.optional(v.any()),
    createdAt: v.number(),
  }).index("byEpoch", ["epoch"]),

  systemPrompts: defineTable({
    name: v.string(),
    content: v.string(),
    returnFormat: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byName", ["name"]),

  siwaNonces: defineTable({
    nonce: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("byNonce", ["nonce"])
    .index("byExpiresAt", ["expiresAt"]),
});
