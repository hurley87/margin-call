import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** Suppress duplicate fingerprints within this window (ms). */
const ALERT_DEDUPE_MS = 5 * 60 * 1000;

export const recordAlerts = internalMutation({
  args: {
    alerts: v.array(
      v.object({
        kind: v.string(),
        severity: v.string(),
        message: v.string(),
        roundId: v.optional(v.string()),
        fingerprint: v.string(),
        meta: v.optional(v.string()),
      })
    ),
    observedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    let inserted = 0;
    const windowStart = args.observedAt - ALERT_DEDUPE_MS;

    for (const alert of args.alerts) {
      const recent = await ctx.db
        .query("keeperAlerts")
        .withIndex("by_fingerprint_observedAt", (q) =>
          q.eq("fingerprint", alert.fingerprint).gte("observedAt", windowStart)
        )
        .take(1);

      if (recent.length > 0) continue;

      await ctx.db.insert("keeperAlerts", {
        ...alert,
        observedAt: args.observedAt,
      });
      inserted += 1;
      console.error(`[keeper-alert] ${alert.kind}: ${alert.message}`);
    }

    return inserted;
  },
});

export const recordRun = internalMutation({
  args: {
    startedAt: v.number(),
    finishedAt: v.number(),
    actionCount: v.number(),
    alertCount: v.number(),
    txHashes: v.array(v.string()),
    skippedReason: v.optional(v.string()),
    sessionActive: v.boolean(),
  },
  returns: v.id("keeperRuns"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("keeperRuns", args);
  },
});

export const listRecentAlerts = internalQuery({
  args: {
    since: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("keeperAlerts"),
      _creationTime: v.number(),
      kind: v.string(),
      severity: v.string(),
      message: v.string(),
      roundId: v.optional(v.string()),
      observedAt: v.number(),
      fingerprint: v.string(),
      meta: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("keeperAlerts")
      .withIndex("by_observedAt", (q) => q.gte("observedAt", args.since))
      .order("desc")
      .take(limit);
  },
});
