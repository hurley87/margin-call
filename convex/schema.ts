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
    profileImageStorageId: v.optional(v.id("_storage")),
    imageStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("generating"),
        v.literal("ready"),
        v.literal("error")
      )
    ),
    imagePrompt: v.optional(v.string()),
    imagePromptSource: v.optional(v.any()),
    imageStyleSeed: v.optional(v.string()),
    imageVariant: v.optional(v.string()),
    imageRetryCount: v.optional(v.number()),
    imageLastAttemptAt: v.optional(v.number()),
    imageError: v.optional(v.string()),
    metadataVersion: v.optional(v.number()),
    escrowBalanceUsdc: v.optional(v.number()),
    /** Last deal outcome applied to escrow (idempotency for applyOutcomeBalance). */
    lastOutcomeId: v.optional(v.id("dealOutcomes")),
    lastCycleAt: v.optional(v.number()),
    // Cycle lease fields for idempotent, non-overlapping agent cycles (issue #85)
    cycleLeaseUntil: v.optional(v.number()),
    cycleGeneration: v.optional(v.number()),
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

  /**
   * Verified x402 deal entries (#87).
   * Populated exclusively via the internal mutation `deals.recordVerifiedEntry`.
   * No public mutation may set paid/verified/settled flags.
   * `paymentId` is the idempotency key (x402 settlement / request id).
   * Business rule: same-desk deals are rejected in `recordVerifiedEntry` (trader cannot enter its own desk's deals).
   */
  dealEntries: defineTable({
    // Idempotency key — x402 settlement id / payment id / request id.
    paymentId: v.string(),
    dealId: v.id("deals"),
    // traderId is a string to accommodate both Convex-native traders and
    // legacy Supabase trader ids during the migration window.
    traderId: v.string(),
    entryCostUsdc: v.number(),
    // x402 settlement metadata
    enterTxHash: v.optional(v.string()),
    resolveTxHash: v.optional(v.string()),
    onChainDealId: v.optional(v.number()),
    // outcome snapshot recorded at entry time
    traderPnlUsdc: v.optional(v.number()),
    rakeUsdc: v.optional(v.number()),
    traderWipedOut: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("byPaymentId", ["paymentId"])
    .index("byDeal", ["dealId"])
    .index("byTrader", ["traderId"])
    .index("byTraderAndDeal", ["traderId", "dealId"])
    .index("byCreatedAt", ["createdAt"])
    .index("byDealAndCreatedAt", ["dealId", "createdAt"]),

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
    // Stable dedupe key: (traderId, dealId, activityType, correlationId) or explicit eventId
    dedupeKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("byTrader", ["traderId"])
    .index("byTraderAndCreatedAt", ["traderId", "createdAt"])
    .index("byActivityType", ["activityType"])
    .index("byDedupeKey", ["dedupeKey"])
    .index("byCreatedAt", ["createdAt"]),

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

  narrativeSeasons: defineTable({
    seasonKey: v.string(),
    title: v.string(),
    weekStartAt: v.number(),
    weekEndAt: v.number(),
    tone: v.string(),
    weeklyShape: v.any(),
    styleRules: v.any(),
    forbiddenLanguage: v.array(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byIsActive", ["isActive"])
    .index("bySeasonKey", ["seasonKey"]),

  narrativeEntities: defineTable({
    seasonId: v.id("narrativeSeasons"),
    slug: v.string(),
    kind: v.union(
      v.literal("firm"),
      v.literal("trader"),
      v.literal("regulator"),
      v.literal("politician")
    ),
    displayName: v.string(),
    aliases: v.array(v.string()),
    bio: v.string(),
    traits: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("bySeason", ["seasonId"])
    .index("bySeasonAndSlug", ["seasonId", "slug"]),

  narrativeArcs: defineTable({
    seasonId: v.id("narrativeSeasons"),
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("resolved"),
      v.literal("abandoned")
    ),
    tensionScore: v.number(),
    entityRefs: v.array(v.id("narrativeEntities")),
    lastTouchedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("bySeason", ["seasonId"])
    .index("bySeasonAndStatus", ["seasonId", "status"])
    .index("bySeasonAndSlug", ["seasonId", "slug"]),

  wireDealSeeds: defineTable({
    epochId: v.id("marketNarratives"),
    seasonId: v.id("narrativeSeasons"),
    arcId: v.id("narrativeArcs"),
    dispatchIndex: v.number(),
    dispatchKey: v.string(),
    dispatchHeadline: v.string(),
    prompt: v.string(),
    suggestedPotUsdc: v.number(),
    suggestedEntryCostUsdc: v.number(),
    createdAt: v.number(),
  })
    .index("byEpoch", ["epochId"])
    .index("byEpochAndDispatchKey", ["epochId", "dispatchKey"])
    .index("byArc", ["arcId"]),

  wireDealSeedLinks: defineTable({
    seedId: v.id("wireDealSeeds"),
    dealId: v.id("deals"),
    deskManagerId: v.optional(v.id("deskManagers")),
    createdAt: v.number(),
  })
    .index("bySeed", ["seedId"])
    .index("byDeal", ["dealId"])
    .index("byDeskManager", ["deskManagerId"]),

  marketNarratives: defineTable({
    epoch: v.number(),
    headlines: v.any(),
    worldState: v.any(),
    rawNarrative: v.string(),
    eventsIngested: v.optional(v.any()),
    // Narrative engine extensions (all optional for back-compat with existing rows)
    seasonId: v.optional(v.id("narrativeSeasons")),
    arcRefs: v.optional(v.array(v.id("narrativeArcs"))),
    epochSlot: v.optional(v.number()),
    dropTitle: v.optional(v.string()),
    topArcTitle: v.optional(v.string()),
    topArcTension: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("byEpoch", ["epoch"])
    .index("byCreatedAt", ["createdAt"])
    .index("byEpochSlot", ["epochSlot"]),

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
