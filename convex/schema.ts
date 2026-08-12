import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Keeper ops tables only — round/ticket truth stays onchain.
 * Alerts never become settlement authority.
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
    .index("by_kind_observedAt", ["kind", "observedAt"])
    .index("by_observedAt", ["observedAt"]),

  keeperRuns: defineTable({
    startedAt: v.number(),
    finishedAt: v.number(),
    actionCount: v.number(),
    alertCount: v.number(),
    txHashes: v.array(v.string()),
    skippedReason: v.optional(v.string()),
    sessionActive: v.boolean(),
  }).index("by_startedAt", ["startedAt"]),

  keeperSponsorshipEvents: defineTable({
    kind: v.union(v.literal("failure"), v.literal("spend")),
    observedAt: v.number(),
    amountWei: v.optional(v.string()),
    detail: v.optional(v.string()),
  })
    .index("by_observedAt", ["observedAt"])
    .index("by_kind_observedAt", ["kind", "observedAt"]),
});
