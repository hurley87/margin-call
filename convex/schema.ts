import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Keeper ops + promotional desk-phone consent/attempts.
 * Round/ticket truth stays onchain. Phone numbers are never stored.
 */
export default defineSchema({
  keeperAlerts: defineTable({
    kind: v.string(),
    severity: v.string(),
    message: v.string(),
    roundId: v.optional(v.string()),
    observedAt: v.number(),
    fingerprint: v.string(),
    meta: v.optional(v.string()),
  })
    .index("by_fingerprint_observedAt", ["fingerprint", "observedAt"])
    .index("by_observedAt", ["observedAt"]),

  keeperRuns: defineTable({
    startedAt: v.number(),
    finishedAt: v.number(),
    actionCount: v.number(),
    alertCount: v.number(),
    txHashes: v.array(v.string()),
    skippedReason: v.optional(v.string()),
    sessionActive: v.boolean(),
  }),

  keeperSponsorshipEvents: defineTable({
    kind: v.union(v.literal("failure"), v.literal("spend")),
    observedAt: v.number(),
    amountWei: v.optional(v.string()),
    detail: v.optional(v.string()),
  }).index("by_observedAt", ["observedAt"]),

  /** Desk-phone switch — DID + wallet only; never a phone number. */
  marginCallConsent: defineTable({
    privyDid: v.string(),
    walletAddress: v.string(),
    optedIn: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_did", ["privyDid"])
    .index("by_wallet", ["walletAddress"]),

  /**
   * Idempotent attempt log per ticket. Stores Twilio SIDs and short skip
   * reasons — never phone numbers or auth material.
   */
  marginCallAttempts: defineTable({
    ticketId: v.string(),
    roundId: v.string(),
    walletAddress: v.string(),
    privyDid: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("placed"),
      v.literal("skipped"),
      v.literal("failed")
    ),
    twilioCallSid: v.optional(v.string()),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_ticketId", ["ticketId"]),
});
